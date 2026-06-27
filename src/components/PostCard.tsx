import React, { useState, useEffect } from 'react';
import { Post, OperationType, Board } from '../types';
import { db, auth } from '../lib/firebase';
import { doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { MoreHorizontal, Trash2, Edit3, Check, X, Clock, Copy, Loader2, Image as ImageIcon, Plus, Sparkles, Pin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError } from '../lib/error-handler';
import { uploadPostImage, deletePostImage } from '../lib/upload-helper';
import { movePostToRecycleBin } from '../lib/recycle-bin';
import { getAccessToken, googleSignIn } from '../lib/auth';
import { compressImage } from '../lib/imageCompressor';
import { getLocalUserPostsIndexedDB, saveLocalUserPostsIndexedDB } from '../lib/indexedDbService';
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

function renderTextWithLinks(text: string) {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      const href = part.toLowerCase().startsWith('www.') ? `https://${part}` : part;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline break-all font-semibold inline cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function ImageModelBadge({ modelName, slideSrc }: { modelName: string; slideSrc: string }) {
  const [imgRect, setImgRect] = useState<{ bottom: number; left: number; width: number } | null>(null);

  useEffect(() => {
    let rafId: number;
    const updatePosition = () => {
      // 1. Try selecting the image within the current/active slide
      let activeImg = document.querySelector('.yarl__slide_current img') as HTMLImageElement | null;
      
      // 2. Fallback: if not found, try any image within the Lightbox container
      if (!activeImg) {
        activeImg = document.querySelector('.yarl__container img') as HTMLImageElement | null;
      }
      
      // 3. Last fallback: try any element with class .yarl__slide_image
      if (!activeImg) {
        activeImg = document.querySelector('.yarl__slide_image') as HTMLImageElement | null;
      }

      if (activeImg) {
        const rect = activeImg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setImgRect({
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width
          });
        }
      } else {
        setImgRect(null);
      }
      rafId = requestAnimationFrame(updatePosition);
    };

    updatePosition();
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [slideSrc]);

  if (!imgRect || !modelName) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        left: `${imgRect.left + imgRect.width / 2}px`,
        top: `${imgRect.bottom + 12}px`,
        transform: 'translate3d(-50%, 0, 0)',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
      className="bg-black/80 text-[#F5F5EC] border border-white/20 rounded-full px-3.5 py-1.5 text-[11px] font-black backdrop-blur-md select-none font-sans tracking-wide shadow-lg flex items-center gap-1.5 whitespace-nowrap animate-fade-in"
      dir="rtl"
    >
      <span>موديل التوليد :</span>
      <span className="text-amber-200">{modelName}</span>
    </div>
  );
}

interface PostCardProps {
  post: Post;
  isAdmin: boolean;
  boards: Board[];
  onTestPrompt: (text: string) => void;
}

import { ADMIN_CONFIG } from '../config';

const DEFAULT_SITES = [
  { label: "بدون تسجيل دخول (انقر بالزر الأيمن  للتصفح الخفي )", url: "https://duck.ai" },
  { label: "وان (10 نقاط يومية)", url: "https://create.wan.video/generate/image/draft?model=wan2.7" },
  { label: "أرينا", url: "https://arena.ai/image/side-by-side" },
  { label: "كل ايميل له عدد نقاط", url: "https://promptsref.com/tool/AI-Image-Generator" },
  { label: "كل ايميل له عدد نقاط", url: "https://chataibot.pro" },
  { label: " جيميناي", url: "https://gemini.google.com/app?hl=ar" },
  { label: " notegpt.io ", url: "https://notegpt.io " },
  { label: " موقع أدوبي ( انقر بالزر الأيمن للتصفح الخفي) ", url: "https://firefly.adobe.com/generate/image?view=edit" },
  { label: "اسم الموقع هنا ", url: "https://عنوان الموفع" },
  { label: "اسم الموقع هنا ", url: "https://عنوان الموفع" }

];

export default function PostCard({ post, isAdmin, boards, onTestPrompt }: PostCardProps) {
  const isRtl = (val: string): boolean => {
    if (!val) return true; // Default to natural Arabic direction
    let arabicCount = 0;
    let englishCount = 0;
    for (let i = 0; i < val.length; i++) {
      const charCode = val.charCodeAt(i);
      if ((charCode >= 0x0600 && charCode <= 0x06FF) || 
          (charCode >= 0x0750 && charCode <= 0x077F) || 
          (charCode >= 0x08A0 && charCode <= 0x08FF) || 
          (charCode >= 0xFB50 && charCode <= 0xFDFF) || 
          (charCode >= 0xFE70 && charCode <= 0xFEFF)) {
        arabicCount++;
      } else if ((charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122)) { // A-Z, a-z
        englishCount++;
      }
    }
    if (arabicCount > englishCount) return true;
    if (englishCount > arabicCount) return false;
    const rtlChar = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\uFE70-\uFEFC]/;
    return rtlChar.test(val);
  };

  const [currentUser, setCurrentUser] = useState<any>(auth.currentUser);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const isPostFromAdmin = post.authorEmail === ADMIN_CONFIG.email;
  const isLocalPost = post.boardId === 'user-board';

  const displayEmailOrName = isLocalPost 
    ? (currentUser?.email || post.authorEmail || 'local-user@local.com')
    : (isPostFromAdmin ? ADMIN_CONFIG.displayName : post.authorEmail.split('@')[0]);

  const personName = isLocalPost 
    ? (currentUser?.displayName || (currentUser?.email || post.authorEmail || 'local-user@local.com').split('@')[0])
    : (isPostFromAdmin ? ADMIN_CONFIG.displayName : post.authorEmail.split('@')[0]);

  const avatarChar = isLocalPost 
    ? (currentUser?.email || post.authorEmail || 'U').charAt(0).toUpperCase()
    : (post.authorEmail || 'U').charAt(0).toUpperCase();

  const displayName = displayEmailOrName;

  const boardName = post.boardId 
    ? boards.find(b => b.id === post.boardId)?.name || 'غير معروف'
    : 'عام';
  
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('post_font_size');
    return saved ? parseInt(saved, 10) : 14;
  });

  useEffect(() => {
    const handleFontSizeChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.size === 'number') {
        setFontSize(customEvent.detail.size);
      }
    };
    window.addEventListener('post_font_size_changed', handleFontSizeChange);
    return () => {
      window.removeEventListener('post_font_size_changed', handleFontSizeChange);
    };
  }, []);

  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(post.text);
  const [editedImageUrls, setEditedImageUrls] = useState<string[]>(post.imageUrls || (post.imageUrl ? [post.imageUrl] : []));
  const [editedBoardId, setEditedBoardId] = useState<string | null>(post.boardId || null);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [removedImageUrls, setRemovedImageUrls] = useState<string[]>([]);
  const [editedImageModels, setEditedImageModels] = useState<string[]>([]);
  const [newImageModels, setNewImageModels] = useState<string[]>([]);
  const [editedImageCaptions, setEditedImageCaptions] = useState<string[]>([]);
  const [newImageCaptions, setNewImageCaptions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const hasManagePermissions = isAdmin || isLocalPost;
  
  const [isDeleting, setIsDeleting] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPinning, setIsPinning] = useState(false);

  const handleTogglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasManagePermissions) return;
    try {
      setIsPinning(true);
      if (isLocalPost) {
        const parsed = await getLocalUserPostsIndexedDB();
        const updated = parsed.map((p: any) => {
          if (p.id === post.id) {
            return { ...p, isPinned: !p.isPinned };
          }
          return p;
        });
        await saveLocalUserPostsIndexedDB(updated);
        window.dispatchEvent(new Event('reload_local_posts'));
        setIsPinning(false);
        return;
      }
      const isPinnedNewValue = !post.isPinned;
      await updateDoc(doc(db, 'posts', post.id), {
        isPinned: isPinnedNewValue,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[PostCard] Error updating pin status:', err);
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
    } finally {
      setIsPinning(false);
    }
  };

  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // States for the new prompt dropdown menu
  const [showDropdown, setShowDropdown] = useState(false);
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [customSites, setCustomSites] = useState<{ label?: string; url: string }[]>(() => {
    try {
      const saved = localStorage.getItem('user_custom_generator_sites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [visitedTrialUrls, setVisitedTrialUrls] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('user_trial_visited_sites_v2');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('user_trial_visited_sites_v2', JSON.stringify(visitedTrialUrls));
  }, [visitedTrialUrls]);

  // Lock body scroll when execution dropdown is open to prevent background scrolling/jitter
  useEffect(() => {
    if (showDropdown) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showDropdown]);

  const handleEditCustomSiteLabel = (url: string, newLabel: string) => {
    const updated = customSites.map(s => s.url === url ? { ...s, label: newLabel } : s);
    setCustomSites(updated);
    localStorage.setItem('user_custom_generator_sites', JSON.stringify(updated));
  };

  const handleTestPromptClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Copy the prompt text toclipboard automatically
    try {
      await navigator.clipboard.writeText(post.text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback
      try {
        const textArea = document.createElement('textarea');
        textArea.value = post.text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (fallbackErr) {
        console.warn('Fallback copy failed:', fallbackErr);
      }
    }

    setShowDropdown(prev => !prev);
  };

  const handleSaveCustomSite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!newSiteUrl.trim()) return;
    
    let url = newSiteUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    const label = newSiteName.trim();

    const updated = [...customSites, { label: label || undefined, url }];
    setCustomSites(updated);
    setNewSiteUrl('');
    setNewSiteName('');
    localStorage.setItem('user_custom_generator_sites', JSON.stringify(updated));
  };

  const handleDeleteCustomSite = (urlToDelete: string) => {
    const updated = customSites.filter(site => site.url !== urlToDelete);
    setCustomSites(updated);
    localStorage.setItem('user_custom_generator_sites', JSON.stringify(updated));
  };

  // Handle mobile back gesture to close lightbox
  useEffect(() => {
    if (!lightboxOpen) return;

    const handlePopState = () => {
      setLightboxOpen(false);
    };

    // Push a dummy state to history
    window.history.pushState({ lightboxId: post.id }, "");
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // If we are closing via state change (not popstate), we need to clear our history entry
      if (window.history.state?.lightboxId === post.id) {
        window.history.back();
      }
    };
  }, [lightboxOpen, post.id]);

  useEffect(() => {
    if (isEditing) {
      setEditedText(post.text);
      const originalUrls = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);
      setEditedImageUrls(originalUrls);
      setEditedBoardId(post.boardId || null);
      setNewImages([]);
      setNewPreviews([]);
      setRemovedImageUrls([]);
      
      const originalModels = Array(originalUrls.length).fill('').map((_, i) => post.imageModels?.[i] || '');
      setEditedImageModels(originalModels);
      setNewImageModels([]);
      
      const originalCaptions = Array(originalUrls.length).fill('').map((_, i) => post.imageCaptions?.[i] || '');
      setEditedImageCaptions(originalCaptions);
      setNewImageCaptions([]);
    }
  }, [isEditing]); // Only reset when toggling isEditing

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(post.text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const postPath = `posts/${post.id}`;
    
    try {
      if (isLocalPost) {
        const parsed = await getLocalUserPostsIndexedDB();
        const filtered = parsed.filter((p: any) => p.id !== post.id);
        await saveLocalUserPostsIndexedDB(filtered);
        window.dispatchEvent(new Event('reload_local_posts'));
        alert('تم حذف المنشور من لوحتك بنجاح! 🗑️');
        setIsDeleting(false);
        setShowDeleteConfirm(false);
        return;
      }
      const boardName = boards.find(b => b.id === post.boardId)?.name || 'غير معروف';
      await movePostToRecycleBin(post, boardName);
      alert('تم نقل المنشور إلى سلة المحذوفات بنجاح! 🗑️');
    } catch (err) {
      console.error('Delete error:', err);
      alert('حدث خطأ أثناء الحذف: ' + (err instanceof Error ? err.message : String(err)));
      handleFirestoreError(err, OperationType.DELETE, postPath);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleAuthorize = async (shouldSetLoadingState = true) => {
    if (shouldSetLoadingState) {
      setIsSaving(true);
    }
    setStatus('جاري طلب صلاحية الوصول...');
    try {
      await googleSignIn();
    } catch (err) {
      console.error('[PostCard] Authorization failed:', err);
      alert('فشل الحصول على صلاحية الوصول. يرجى التأكد من السماح بالنوافذ المنبثقة.');
    } finally {
      if (shouldSetLoadingState) {
        setIsSaving(false);
        setStatus('');
      }
    }
  };

  const handleUpdate = async () => {
    console.log('[PostCard] Starting update check...');
    const totalCount = editedImageUrls.length + newImages.length;
    
    if (!editedText.trim() && totalCount === 0) {
      alert('لا يمكن حفظ منشور فارغ (برجاء كتابة نص أو إضافة صورة)');
      return;
    }

    setIsSaving(true);
    setStatus('جاري الحفظ...');

    try {
      if (isLocalPost) {
        setStatus('جاري حفظ التعديلات محلياً...');
        const newUrls: string[] = [];
        for (const file of newImages) {
          const base64 = await compressImage(file);
          newUrls.push(base64);
        }

        const remainingOldUrls = editedImageUrls.filter(url => !removedImageUrls.includes(url));
        const finalImageUrls = [...remainingOldUrls, ...newUrls];
        const finalImageModels = [...editedImageModels, ...newImageModels];
        const finalImageCaptions = [...editedImageCaptions, ...newImageCaptions];

        const parsed = await getLocalUserPostsIndexedDB();
        const updated = parsed.map((p: any) => {
          if (p.id === post.id) {
            return {
              ...p,
              text: editedText.trim(),
              imageUrls: finalImageUrls,
              imageUrl: finalImageUrls.length > 0 ? finalImageUrls[0] : null,
              imageModels: finalImageModels,
              imageCaptions: finalImageCaptions,
              boardId: editedBoardId,
            };
          }
          return p;
        });
        
        const isSaved = await saveLocalUserPostsIndexedDB(updated);
        if (isSaved) {
          window.dispatchEvent(new Event('reload_local_posts'));
          alert('تم تحديث المنشور محلياً بنجاح! ✅');
        }

        setIsEditing(false);
        setNewImages([]);
        setNewPreviews([]);
        setRemovedImageUrls([]);
        setIsSaving(false);
        setStatus('');
        return;
      }

      setStatus('جاري معالجة الصور...');
      const finalImageUrls = [...editedImageUrls];
      
      // 1. Upload new images if any
      if (newImages.length > 0) {
        const activeToken = getAccessToken();
        if (!activeToken || activeToken === 'local-dummy-token') {
          alert('يتطلب رفع صور جديدة تسجيل الدخول إلى Google Drive.');
          await handleAuthorize(false);
          const freshToken = getAccessToken();
          if (!freshToken || freshToken === 'local-dummy-token') {
            setIsSaving(false);
            setStatus('');
            return;
          }
        }

        for (let i = 0; i < newImages.length; i++) {
          setStatus(`جاري رفع الصورة ${i + 1}/${newImages.length} إلى Google Drive...`);
          try {
            const url = await uploadPostImage(newImages[i], post.authorId);
            finalImageUrls.push(url);
          } catch (uploadErr: any) {
            console.warn('[PostCard] Image upload error:', uploadErr);
            if (uploadErr.message === 'AUTH_REQUIRED' || uploadErr.message === 'AUTH_EXPIRED') {
              await handleAuthorize(false);
              const freshToken = getAccessToken();
              if (!freshToken || freshToken === 'local-dummy-token') {
                setIsSaving(false);
                setStatus('');
                return;
              }
              const url = await uploadPostImage(newImages[i], post.authorId);
              finalImageUrls.push(url);
              continue;
            }
            throw uploadErr;
          }
        }
      }

      // 2. Delete removed images
      if (removedImageUrls.length > 0) {
        setStatus('جاري حذف الصور القديمة...');
        const token = getAccessToken();
        for (const url of removedImageUrls) {
          try {
            await deletePostImage(url, token);
          } catch (deleteErr) {
            console.warn('[PostCard] Delete failed:', deleteErr);
          }
        }
      }

      setStatus('جاري الحفظ في Firestore...');
      // 3. Update Firestore
      const finalImageModels = [...editedImageModels, ...newImageModels];
      const finalImageCaptions = [...editedImageCaptions, ...newImageCaptions];
      await updateDoc(doc(db, 'posts', post.id), {
        text: editedText.trim(),
        imageUrls: finalImageUrls,
        imageUrl: finalImageUrls.length > 0 ? finalImageUrls[0] : null,
        imageModels: finalImageModels,
        imageCaptions: finalImageCaptions,
        boardId: editedBoardId,
        updatedAt: serverTimestamp(),
      });

      console.log('[PostCard] Update successful');
      setIsEditing(false);
      setNewImages([]);
      setNewPreviews([]);
      setRemovedImageUrls([]);
      alert('تم تحديث المنشور بنجاح! ✅');
    } catch (err) {
      console.error('[PostCard] Fatal update error:', err);
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
      alert('حدث خطأ أثناء التحديث: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
      setStatus('');
    }
  };

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    const totalCount = editedImageUrls.length + newImages.length + files.length;
    
    if (totalCount > 6) {
      alert('يمكنك إضافة 6 صور كحد أقصى.');
      return;
    }

    const nextNewImages = [...newImages];
    const nextNewPreviews = [...newPreviews];
    const nextNewModels = [...newImageModels];
    const nextNewCaptions = [...newImageCaptions];

    files.forEach(file => {
      nextNewImages.push(file);
      nextNewModels.push(''); // No model selected initially
      nextNewCaptions.push(''); // No caption initially
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    setNewImages(nextNewImages);
    setNewImageModels(nextNewModels);
    setNewImageCaptions(nextNewCaptions);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeExistingImage = (index: number) => {
    const url = editedImageUrls[index];
    setEditedImageUrls(editedImageUrls.filter((_, i) => i !== index));
    setEditedImageModels(editedImageModels.filter((_, i) => i !== index));
    setEditedImageCaptions(editedImageCaptions.filter((_, i) => i !== index));
    setRemovedImageUrls([...removedImageUrls, url]);
  };

  const removeNewImage = (index: number) => {
    setNewImages(newImages.filter((_, i) => i !== index));
    setNewPreviews(newPreviews.filter((_, i) => i !== index));
    setNewImageModels(newImageModels.filter((_, i) => i !== index));
    setNewImageCaptions(newImageCaptions.filter((_, i) => i !== index));
  };

  const imageUrls = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);
  const slides = imageUrls.map((url, i) => ({ 
    src: url,
    modelName: post.imageModels?.[i] || ''
  }));

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`relative mx-auto mb-2.5 w-full max-w-xl rounded-2xl border border-[#C1C3B8] bg-white transition-shadow hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${isDeleting ? 'opacity-50 grayscale pointer-events-none' : ''}`}
      >
        {/* Post Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-1" dir="rtl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-natural-primary to-natural-muted border border-natural-border shadow-md">
              {isPostFromAdmin && !isLocalPost ? (
                <img src={ADMIN_CONFIG.photoUrl} alt={displayName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="font-bold text-white uppercase">{avatarChar}</span>
              )}
            </div>
            {/* حجم الايميل للمستخدم */}
            <div className="text-right">
              <div className="flex items-center gap-1">
                <span className={`${isLocalPost ? 'text-[10px] font-semibold break-all' : 'text-sm font-bold'} text-natural-text`}>{displayName}</span>
              </div>
              
              {isLocalPost ? (
                <div className="flex flex-col gap-0.5 mt-0.5 mb-1">
                  <div className="text-[10px] font-medium text-[#7A7C73] bg-natural-secondary-bg px-1.5 py-0.5 rounded leading-none border border-natural-border/30 w-fit">
                    المسؤول: {personName}
                  </div>
                  {post.isPinned && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded leading-none border border-red-100/40 w-fit">
                      <Pin size={10} className="fill-red-500 text-red-600 shrink-0 select-none" />
                    </span>
                  )}
                </div>
              ) : (
                /* المسؤول ورمز التثبيت تحت الاسم لمنع التداخل */
                (isPostFromAdmin || post.isPinned) && (
                  <div className="flex items-center gap-1.5 mt-0.5 mb-1">
                    {isPostFromAdmin && (
                      <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded leading-none border border-red-100/40">
                        المسؤول
                      </span>
                    )}
                    {post.isPinned && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded leading-none border border-red-100/40">
                        <Pin size={10} className="fill-red-500 text-red-600 shrink-0 select-none" />
                     {/*كلمة مثبت كانت هنا*/}
                      </span>
                    )}
                  </div>
                )
              )}

              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-natural-muted mt-0.5">
                {(() => {
                  if (isLocalPost && post.createdAtMillis) {
                    const dateObj = new Date(post.createdAtMillis);
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - dateObj.getTime());
                    const diffDays = diffTime / (1000 * 60 * 60 * 24);
                    
                    if (diffDays > 3) {
                      const day = String(dateObj.getDate()).padStart(2, '0');
                      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                      const year = dateObj.getFullYear();
                      return `${day}/${month}/${year}`;
                    }
                    
                    return formatDistanceToNow(dateObj, { addSuffix: true, locale: ar });
                  }

                  if (!post.createdAt) return 'الآن';
                  const dateObj = post.createdAt.toDate();
                  const now = new Date();
                  const diffTime = Math.abs(now.getTime() - dateObj.getTime());
                  const diffDays = diffTime / (1000 * 60 * 60 * 24);
                  
                  if (diffDays > 3) {
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const year = dateObj.getFullYear();
                    return `${day}/${month}/${year}`;
                  }
                  
                  return formatDistanceToNow(dateObj, { addSuffix: true, locale: ar });
                })()} • {isLocalPost ? 'لوحة المستخدم' : boardName}
              </div>
            </div>
          </div>

          {hasManagePermissions && (
            <div className="absolute top-3 left-3 flex gap-0.5 z-10">
              {showDeleteConfirm ? (
                <div className="flex items-center gap-1 bg-red-50 rounded-lg px-2 py-0.5 animate-in fade-in slide-in-from-right-4 border border-red-200/40 shadow-xs">
                  <span className="text-[9px] font-bold text-red-600 ml-1">حذف؟</span>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="p-1 hover:bg-red-100 rounded text-red-600 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="p-1 hover:bg-zinc-200 rounded text-natural-muted transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleTogglePin}
                    disabled={isPinning}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      post.isPinned 
                        ? 'bg-red-50 hover:bg-red-100 text-red-600 shadow-xs' 
                        : 'hover:bg-natural-secondary-bg hover:text-natural-text text-natural-muted/70'
                    }`}
                    title={post.isPinned ? "إلغاء التثبيت" : "تثبيت المنشور في الأعلى"}
                  >
                    {isPinning ? (
                      <Loader2 size={14} className="animate-spin text-red-500" />
                    ) : (
                      <Pin size={14} className={post.isPinned ? 'fill-red-500 text-red-600' : ''} />
                    )}
                  </button>
                  <button 
                    onClick={() => setIsEditing(true)} 
                    className="p-1.5 hover:bg-natural-secondary-bg hover:text-natural-text rounded-lg text-natural-muted/70 transition-all cursor-pointer"
                    title="تعديل المنشور"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button 
                    onClick={() => setShowDeleteConfirm(true)} 
                    className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg text-red-400/80 transition-all cursor-pointer"
                    title="حذف المنشور"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Post Content */}
        <div className="relative px-3 pb-3 pt-1 sm:px-5 sm:pb-5 sm:pt-1 text-right" dir="rtl">
          {isEditing ? (
            <div className="space-y-4">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full resize-none rounded-xl border border-natural-border bg-natural-bg p-3 text-sm focus:ring-1 focus:ring-natural-primary"
                rows={4}
                autoFocus
                dir={isRtl(editedText) ? 'rtl' : 'ltr'}
                style={{ textAlign: isRtl(editedText) ? 'right' : 'left' }}
              />
              
              {/* Existing & New Images Preview in Edit Mode */}
              <div className="grid grid-cols-3 gap-2">
                {editedImageUrls.map((url, i) => (
                  <div key={`existing-${i}`} className="relative aspect-square overflow-hidden rounded-lg border border-natural-border">
                    <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    <button 
                      type="button"
                      onClick={() => removeExistingImage(i)}
                      className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:scale-110"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {newPreviews.map((prev, i) => (
                  <div key={`new-${i}`} className="relative aspect-square overflow-hidden rounded-lg border border-green-200 bg-green-50">
                    <img src={prev} alt="" className="h-full w-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => removeNewImage(i)}
                      className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:scale-110"
                    >
                      <X size={10} />
                    </button>
                    <div className="absolute bottom-1 left-1 bg-green-600 text-white text-[8px] px-1 rounded">جديد</div>
                  </div>
                ))}
                {(editedImageUrls.length + newImages.length < 6) && (
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-natural-border text-natural-muted hover:bg-natural-bg hover:text-natural-primary"
                  >
                    <Plus size={24} />
                  </button>
                )}
              </div>
              
              <input 
                type="file" 
                hidden 
                multiple 
                accept="image/*" 
                ref={fileInputRef} 
                onChange={handleImageAdd} 
              />

              {/* اختيار موديلات الصور عند التعديل */}
              {(editedImageUrls.length > 0 || newPreviews.length > 0) && (
                <div className="mt-4 border border-natural-border/30 rounded-xl bg-natural-bg/35 p-3 flex flex-col gap-3 text-right" dir="rtl">
                  <span className="text-xs font-black text-[#4A4A35] flex items-center gap-1.5">
                    ✨ اختيار موديل توليد كل صورة:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Pictures currently in the post */}
                    {editedImageUrls.map((url, index) => {
                      const models = ['gpt-image-2', 'nano-banana2', 'wan 2.7', 'grok'];
                      return (
                        <div key={`edit-model-exist-${index}`} className="flex flex-col gap-1.5 p-2 rounded-lg border border-natural-border/40 bg-zinc-50">
                          <div className="relative aspect-video overflow-hidden rounded-md border border-natural-border/20 bg-natural-bg">
                            <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          
                          {/* Caption Edit Field */}
                          <div className="flex flex-col gap-1 text-right">
                            <span className="text-[9px] font-bold text-[#4A4A35]">العبارة التعريفية للصورة (اختياري):</span>
                            <input
                              type="text"
                              placeholder="اكتب عبارة تعريفية لهذه الصورة..."
                              value={editedImageCaptions[index] || ''}
                              onChange={(e) => {
                                const updated = [...editedImageCaptions];
                                updated[index] = e.target.value;
                                setEditedImageCaptions(updated);
                              }}
                              className="w-full text-[10px] font-medium border border-natural-border/60 rounded-md px-2 py-1 bg-white text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-bold text-[#4A4A35]">موديل توليد الصورة:</span>
                            <div className="flex flex-wrap gap-1">
                              {models.map((model) => {
                                const isSelected = editedImageModels[index] === model;
                                return (
                                  <button
                                    key={model}
                                    type="button"
                                    onClick={() => {
                                      const updated = [...editedImageModels];
                                      updated[index] = isSelected ? '' : model;
                                      setEditedImageModels(updated);
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-black cursor-pointer transition-all border ${
                                      isSelected
                                        ? 'bg-[#4A4A35] text-white border-transparent'
                                        : 'bg-white text-natural-muted border-natural-border/60 hover:bg-natural-bg/80'
                                    }`}
                                  >
                                    {model}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Newly added images */}
                    {newPreviews.map((prev, index) => {
                      const models = ['gpt-image-2', 'nano-banana2', 'wan 2.7', 'grok'];
                      return (
                        <div key={`edit-model-new-${index}`} className="flex flex-col gap-1.5 p-2 rounded-lg border border-green-200 bg-green-50/20">
                          <div className="relative aspect-video overflow-hidden rounded-md border border-green-200/55 bg-white">
                            <img src={prev} alt="" className="h-full w-full object-cover" />
                            <div className="absolute bottom-1 left-1 bg-green-600 text-[8px] text-white px-1 rounded font-black">جديدة</div>
                          </div>

                          {/* New Image Caption Edit Field */}
                          <div className="flex flex-col gap-1 text-right">
                            <span className="text-[9px] font-bold text-green-700">العبارة التعريفية للصورة الجديدة (اختياري):</span>
                            <input
                              type="text"
                              placeholder="اكتب عبارة تعريفية لهذه الصورة..."
                              value={newImageCaptions[index] || ''}
                              onChange={(e) => {
                                const updated = [...newImageCaptions];
                                updated[index] = e.target.value;
                                setNewImageCaptions(updated);
                              }}
                              className="w-full text-[10px] font-medium border border-green-200 rounded-md px-2 py-1 bg-white text-natural-text focus:outline-none focus:ring-1 focus:ring-green-700"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-bold text-green-700">الموديل للصورة الجديدة:</span>
                            <div className="flex flex-wrap gap-1">
                              {models.map((model) => {
                                const isSelected = newImageModels[index] === model;
                                return (
                                  <button
                                    key={model}
                                    type="button"
                                    onClick={() => {
                                      const updated = [...newImageModels];
                                      updated[index] = isSelected ? '' : model;
                                      setNewImageModels(updated);
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-black cursor-pointer transition-all border ${
                                      isSelected
                                        ? 'bg-green-700 text-white border-transparent'
                                        : 'bg-white text-[#4A4A35] border-green-200 hover:bg-green-100/50'
                                    }`}
                                  >
                                    {model}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* خيار نقل المنشور لسبورة أخرى */}
              <div className="flex flex-col gap-2 rounded-xl border border-natural-border/30 bg-natural-bg/50 p-3.5 text-right" dir="rtl">
                <span className="text-xs font-black text-[#5C5C44] flex items-center gap-1.5">
                  📁 نقل المنشور إلى لوحة أخرى:
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => setEditedBoardId(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border cursor-pointer ${
                      editedBoardId === null
                        ? 'bg-[#4A4A35] text-[#F5F5EC] border-transparent shadow-sm'
                        : 'bg-white text-natural-muted border-natural-border/40 hover:bg-natural-bg'
                    }`}
                  >
                    اللوحة العامة (الرئيسية)
                  </button>

                  {boards && boards.map((board) => {
                    const isSelected = editedBoardId === board.id;
                    return (
                      <button
                        key={board.id}
                        type="button"
                        onClick={() => setEditedBoardId(board.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border cursor-pointer ${
                          isSelected
                            ? 'bg-[#4A4A35] text-[#F5F5EC] border-transparent shadow-sm'
                            : 'bg-white text-natural-muted border-natural-border/40 hover:bg-natural-bg'
                        }`}
                      >
                        {board.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 justify-start pt-2 border-t border-natural-border">
                <button 
                  type="button"
                  onClick={newImages.length > 0 && !getAccessToken() ? handleAuthorize : handleUpdate} 
                  disabled={isSaving}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white transition-colors disabled:opacity-50 ${
                    newImages.length > 0 && !getAccessToken() 
                      ? 'bg-amber-600 hover:bg-amber-700' 
                      : 'bg-natural-primary hover:bg-[#4A4A35]'
                  }`}
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : (newImages.length > 0 && !getAccessToken() ? <ImageIcon size={14} /> : <Check size={14} />)}
                  {isSaving ? (status || 'جاري الحفظ...') : (newImages.length > 0 && !getAccessToken() ? 'تفعيل Drive للحفظ' : 'حفظ التغييرات')}
                </button>
                <button 
                  type="button"
                  onClick={() => setIsEditing(false)} 
                  disabled={isSaving}
                  className="flex items-center gap-1 rounded-lg border border-natural-border px-4 py-2 text-xs font-bold text-natural-muted transition-colors hover:bg-natural-bg disabled:opacity-50"
                >
                  <X size={14} /> إلغاء
                </button>
              </div>
            </div>
          ) : (
            <div className="group relative overflow-hidden max-w-full">
              <div className={`cursor-pointer transition-all duration-300 ${!isTextExpanded ? 'line-clamp-3' : ''} overflow-hidden max-w-full`} onClick={() => setIsTextExpanded(!isTextExpanded)}>
                <p 
                  className="whitespace-pre-wrap leading-relaxed text-[#4A4A35] break-words"
                  dir={isRtl(post.text) ? 'rtl' : 'ltr'}
                  style={{ 
                    textAlign: isRtl(post.text) ? 'right' : 'left',
                    fontSize: `${fontSize}px`
                  }}
                >
                  {renderTextWithLinks(post.text)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between">
                {post.text.split('\n').length > 3 || post.text.length > 200 ? (
                  <button onClick={() => setIsTextExpanded(!isTextExpanded)} className="text-[10px] font-bold text-natural-primary hover:underline">
                    {isTextExpanded ? 'عرض أقل ↑' : 'عرض المزيد ↓'}
                  </button>
                ) : <div />}
                <div className="flex items-center gap-1 relative">
                  <button 
                    onClick={handleTestPromptClick} 
                    className="flex items-center gap-1 rounded-md bg-natural-primary/10 px-1 py-1 text-[10px] font-black text-natural-primary transition-all hover:bg-natural-primary hover:text-white"
                  >
                    <Sparkles size={11} className="text-natural-primary hover:text-white" />
                    <span>تجربة البرومبت</span>
                  </button>

                  <AnimatePresence>
                    {showDropdown && (
                      <div className="fixed inset-x-0 bottom-0 top-[115px] z-[120] flex items-start justify-center p-4 overflow-y-auto">
                        {/* Backdrop */}
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-x-0 bottom-0 top-[115px] bg-black/40 backdrop-blur-xs" 
                          onClick={() => setShowDropdown(false)} 
                        />

                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: 15 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 15 }}
                          transition={{ duration: 0.2 }}
                          className="relative w-full max-w-[500px] rounded-3xl border border-natural-border bg-white p-6 shadow-2xl text-right z-50 overflow-hidden my-2 flex flex-col max-h-[80vh]"
                          dir="rtl"
                        >
                          <div className="flex items-center justify-between border-b border-natural-border/40 pb-3 mb-3 shrink-0">
                            <div className="flex items-center gap-3">
                              <div className="h-7 w-7 rounded-lg bg-green-500/10 flex items-center justify-center text-green-600 shrink-0">
                                <Check size={16} className="animate-bounce" />
                              </div>
                              <div>
                                <h4 className="text-sm font-normal text-natural-text text-right leading-tight">
                                  البرومبت جاهز لتوليد الصورة
                                </h4>
                                <p className="text-xs text-green-600 font-bold text-center mt-0.5 leading-normal">
                                  تم نسخ النص للحافظة بنجاح
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowDropdown(false)}
                              className="p-1.5 px-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-500 transition-colors cursor-pointer shrink-0"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          {/* Copied text display frame (Read Only, Small) */}
                          <div className="mb-3 bg-neutral-50 rounded-xl p-3 border border-natural-border/50 text-xs text-[#4A4A35] font-mono whitespace-pre-wrap break-words max-h-24 overflow-y-auto shrink-0 leading-relaxed text-left" dir="ltr">
                            {post.text}
                          </div>

                          {/* Websites list - identical styling to PromptBuilder sites directory */}
                          <div className="space-y-1.5 overflow-y-auto pr-1 text-right flex-1 scrollbar-thin my-1">
                            {/* Render Default Sites first */}
                            {DEFAULT_SITES.map((site, index) => {
                              const isVisited = visitedTrialUrls.includes(site.url);
                              const cleanDisplayUrl = site.url.replace(/^https?:\/\/(www\.)?/i, '');
                              return (
                                <div
                                  key={`default-${index}`}
                                  className={`flex items-start justify-between gap-2.5 p-2 md:p-2.5 rounded-xl border transition-all ${
                                    isVisited
                                      ? 'bg-neutral-50/50 border-natural-border/80 opacity-90'
                                      : 'bg-green-50/5 border-natural-border/90 hover:bg-green-50/10'
                                  }`}
                                >
                                  <div className="flex items-start gap-2.5 flex-1 min-w-0 text-right">
                                    <span className="text-xs font-black text-[#4A4A35] w-5 h-5 flex items-center justify-center shrink-0 select-none bg-natural-primary/10 rounded-md">
                                      {index + 1}
                                    </span>
                                    <div className="flex-1 min-w-0 space-y-1.5 text-right overflow-hidden">
                                      <a
                                        href={site.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => {
                                          if (!visitedTrialUrls.includes(site.url)) {
                                            setVisitedTrialUrls(prev => [...prev, site.url]);
                                          }
                                          setShowDropdown(false);
                                        }}
                                        className={`block text-[14px] md:text-[14px] font-black hover:underline whitespace-nowrap overflow-hidden text-ellipsis text-left w-full transition-colors leading-normal cursor-pointer font-mono ${
                                          isVisited
                                            ? 'text-red-700 hover:text-red-800'
                                            : 'text-emerald-950 hover:text-emerald-950'
                                        }`}
                                        title={`اضغط لزيارة: ${site.url}`}
                                        dir="ltr"
                                      >
                                        {cleanDisplayUrl}
                                      </a>
                                      <div className="flex items-center gap-1 opacity-90 w-full bg-[#4A4A35]/5 border border-natural-border/50 rounded-lg px-1 py-1 text-right">
                                        <span className="text-[10px] text-[#4A4A35] font-black shrink-0 select-none"> الميزة : </span>
                                        <span className="text-[11px] font-bold text-[#3A3A28] py-0 text-right truncate select-all flex-1 min-w-0">{site.label}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Render Custom Sites next */}
                            {customSites.map((site, index) => {
                              const isVisited = visitedTrialUrls.includes(site.url);
                              const cleanDisplayUrl = site.url.replace(/^https?:\/\/(www\.)?/i, '');
                              const offsetIndex = DEFAULT_SITES.length + index;
                              return (
                                <div
                                  key={`custom-${index}`}
                                  className={`flex items-start justify-between gap-2.5 p-2 md:p-2.5 rounded-xl border transition-all ${
                                    isVisited
                                      ? 'bg-neutral-50/50 border-natural-border/80 opacity-90'
                                      : 'bg-green-50/5 border-natural-border/90 hover:bg-green-50/10'
                                  }`}
                                >
                                  <div className="flex items-start gap-2.5 flex-1 min-w-0 text-right">
                                    <span className="text-xs font-black text-[#4A4A35] w-5 h-5 flex items-center justify-center shrink-0 select-none bg-natural-primary/10 rounded-md">
                                      {offsetIndex + 1}
                                    </span>
                                    <div className="flex-1 min-w-0 space-y-1.5 text-right overflow-hidden">
                                      <a
                                        href={site.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => {
                                          if (!visitedTrialUrls.includes(site.url)) {
                                            setVisitedTrialUrls(prev => [...prev, site.url]);
                                          }
                                          setShowDropdown(false);
                                        }}
                                        className={`block text-[14px] md:text-[14px] font-black hover:underline whitespace-nowrap overflow-hidden text-ellipsis text-left w-full transition-colors leading-normal cursor-pointer font-mono ${
                                          isVisited
                                            ? 'text-red-700 hover:text-red-800'
                                            : 'text-emerald-950 hover:text-emerald-950'
                                        }`}
                                        title={`اضغط لزيارة: ${site.url}`}
                                        dir="ltr"
                                      >
                                        {cleanDisplayUrl}
                                      </a>
                                      <div className="flex items-center gap-1 opacity-90 w-full bg-[#4A4A35]/5 border border-natural-border/50 rounded-lg px-1 py-1 text-right">
                                        <span className="text-[10px] text-[#4A4A35] font-black shrink-0 select-none"> الميزة : </span>
                                        <input
                                          type="text"
                                          value={site.label || ''}
                                          onChange={(e) => handleEditCustomSiteLabel(site.url, e.target.value)}
                                          placeholder="اضغط لتسمية الموقع..."
                                          className="w-full bg-transparent text-[11px] font-bold text-[#3A3A28] focus:outline-none text-right border-none p-0 flex-1 min-w-0"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteCustomSite(site.url);
                                    }}
                                    className="p-1 px-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors border border-red-200/60 shrink-0 self-start mt-0.5 cursor-pointer"
                                    title="حذف هذا الموقع المخصص"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          {/* Add custom site form */}
                          <div className="mt-3 border-t border-natural-border/50 pt-3 space-y-2 shrink-0">
                            <div className="text-xs font-black text-natural-primary">
                              ➕ إضافة موقع تجريبي مخصص لملفك:
                            </div>
                            <div className="grid grid-cols-1 gap-1.5 text-right">
                              <input
                                type="text"
                                value={newSiteName}
                                onChange={(e) => setNewSiteName(e.target.value)}
                                placeholder="اسم الموقع المخصص (اختياري)"
                                className="w-full text-right rounded-xl border border-natural-border bg-natural-bg/30 px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-natural-primary focus:outline-none"
                              />
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  value={newSiteUrl}
                                  onChange={(e) => setNewSiteUrl(e.target.value)}
                                  placeholder="رابط الموقع (example.com)"
                                  className="flex-1 text-right rounded-xl border border-natural-border bg-natural-bg/30 px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-natural-primary focus:outline-none"
                                  dir="ltr"
                                />
                                <button
                                  onClick={handleSaveCustomSite}
                                  className="rounded-xl bg-natural-primary text-white px-4 py-2 text-xs font-black hover:bg-[#4A4A35] transition-all whitespace-nowrap shadow-sm hover:shadow active:scale-95 cursor-pointer"
                                >
                                  حفظ الموقع
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>

                  <button onClick={handleCopy} className="flex items-center gap-1 rounded-md bg-natural-bg px-2 py-1 text-[10px] font-bold text-natural-muted transition-all hover:bg-natural-secondary-bg hover:text-natural-primary">
                    {isCopied ? <><Check size={12} className="text-green-600" /><span className="text-green-600">تم النسخ</span></> : <><Copy size={12} /><span>نسخ النص</span></>}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Image Grid/Gallery */}
        <div className="grid gap-0.5 overflow-hidden bg-natural-border rounded-b-2xl">
          {imageUrls.length === 1 && (
            <div 
              className="relative aspect-video w-full bg-natural-secondary-bg overflow-hidden cursor-pointer"
              onClick={() => { setLightboxIndex(0); setLightboxOpen(true); }}
            >
              <img
                src={imageUrls[0]}
                alt="Post content"
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              {post.imageModels && post.imageModels[0] && (
                <div className="absolute bottom-1 right-1.5 bg-black/60 text-[#F5F5EC] border border-white/10 rounded px-1.5 py-0.5 backdrop-blur-xs select-none pointer-events-none z-10 font-sans font-bold" style={{ fontSize: '7px' }}>
                  ✨ {post.imageModels[0]}
                </div>
              )}
              {post.imageCaptions && post.imageCaptions[0] && (
                <div className="absolute bottom-1 left-1.5 bg-black/60 text-[#F5F5EC] border border-white/10 rounded-md px-1.5 py-0.5 backdrop-blur-xs select-text z-10" onClick={(e) => e.stopPropagation()}>
                  <p className="text-white font-bold leading-none drop-shadow-md" style={{ fontSize: '5px' }} dir="rtl">
                    {post.imageCaptions[0]}
                  </p>
                </div>
              )}
            </div>
          )}
          
          {imageUrls.length === 2 && (
            <div className="grid grid-cols-2 gap-0.5">
              {imageUrls.map((url, i) => (
                <div 
                  key={url + i} 
                  className="relative aspect-square bg-natural-secondary-bg overflow-hidden cursor-pointer"
                  onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  {post.imageModels && post.imageModels[i] && (
                    <div className="absolute bottom-1 right-1.5 bg-black/60 text-[#F5F5EC] border border-white/10 rounded px-1.5 py-0.5 backdrop-blur-xs select-none pointer-events-none z-10 font-sans font-bold" style={{ fontSize: '7px' }}>
                      ✨ {post.imageModels[i]}
                    </div>
                  )}
                  {post.imageCaptions && post.imageCaptions[i] && (
                    <div className="absolute bottom-1 left-1.5 bg-black/60 text-[#F5F5EC] border border-white/10 rounded-md px-1.5 py-0.5 backdrop-blur-xs select-text z-10" onClick={(e) => e.stopPropagation()}>
                      <p className="text-white font-bold leading-none drop-shadow-md" style={{ fontSize: '5px' }} dir="rtl">
                        {post.imageCaptions[i]}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {imageUrls.length === 3 && (
            <div className="grid grid-cols-2 gap-0.5">
              <div 
                className="relative aspect-square bg-natural-secondary-bg row-span-2 overflow-hidden cursor-pointer"
                onClick={() => { setLightboxIndex(0); setLightboxOpen(true); }}
              >
                <img src={imageUrls[0]} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                {post.imageModels && post.imageModels[0] && (
                  <div className="absolute bottom-1 right-1.5 bg-black/60 text-[#F5F5EC] border border-white/10 rounded px-1.5 py-0.5 backdrop-blur-xs select-none pointer-events-none z-10 font-sans font-bold" style={{ fontSize: '7px' }}>
                    ✨ {post.imageModels[0]}
                  </div>
                )}
                {post.imageCaptions && post.imageCaptions[0] && (
                  <div className="absolute bottom-1 left-1.5 bg-black/60 text-[#F5F5EC] border border-white/10 rounded-md px-1.5 py-0.5 backdrop-blur-xs select-text z-10" onClick={(e) => e.stopPropagation()}>
                    <p className="text-white font-bold leading-none drop-shadow-md" style={{ fontSize: '5px' }} dir="rtl">
                      {post.imageCaptions[0]}
                    </p>
                  </div>
                )}
              </div>
              <div className="grid grid-rows-2 gap-0.5">
                {imageUrls.slice(1).map((url, i) => {
                  const actualIndex = i + 1;
                  return (
                    <div 
                      key={url + actualIndex} 
                      className="relative aspect-square bg-natural-secondary-bg overflow-hidden cursor-pointer"
                      onClick={() => { setLightboxIndex(actualIndex); setLightboxOpen(true); }}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      {post.imageModels && post.imageModels[actualIndex] && (
                        <div className="absolute bottom-1 right-1.5 bg-black/60 text-[#F5F5EC] border border-white/10 rounded px-1.5 py-0.5 backdrop-blur-xs select-none pointer-events-none z-10 font-sans font-bold" style={{ fontSize: '7px' }}>
                          ✨ {post.imageModels[actualIndex]}
                        </div>
                      )}
                      {post.imageCaptions && post.imageCaptions[actualIndex] && (
                        <div className="absolute bottom-1 left-1.5 bg-black/60 text-[#F5F5EC] border border-white/10 rounded-md px-1.5 py-0.5 backdrop-blur-xs select-text z-10" onClick={(e) => e.stopPropagation()}>
                          <p className="text-white font-bold leading-none drop-shadow-md" style={{ fontSize: '5px' }} dir="rtl">
                            {post.imageCaptions[actualIndex]}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {imageUrls.length >= 4 && (
            <div className="grid grid-cols-2 gap-0.5">
              {imageUrls.slice(0, 4).map((url, i) => (
                <div 
                  key={url + i} 
                  className="relative aspect-square bg-natural-secondary-bg overflow-hidden cursor-pointer"
                  onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  {post.imageModels && post.imageModels[i] && (
                    <div className="absolute bottom-1 right-1.5 bg-black/60 text-[#F5F5EC] border border-white/10 rounded px-1.5 py-0.5 backdrop-blur-xs select-none pointer-events-none z-10 font-sans font-bold" style={{ fontSize: '7px' }}>
                      ✨ {post.imageModels[i]}
                    </div>
                  )}
                  {post.imageCaptions && post.imageCaptions[i] && (
                    <div className="absolute bottom-1 left-1.5 bg-black/60 text-[#F5F5EC] border border-white/10 rounded-md px-1.5 py-0.5 backdrop-blur-xs select-text z-10" onClick={(e) => e.stopPropagation()}>
                      <p className="text-white font-bold leading-none drop-shadow-md" style={{ fontSize: '5px' }} dir="rtl">
                        {post.imageCaptions[i]}
                      </p>
                    </div>
                  )}
                  {i === 3 && imageUrls.length > 4 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white font-bold text-xl pointer-events-none z-10">
                      +{imageUrls.length - 4}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        on={{ view: ({ index }) => setLightboxIndex(index) }}
        slides={slides}
        plugins={[Zoom]}
        carousel={{
          spacing: "0px",
          padding: "0px"
        }}
        controller={{ 
          closeOnBackdropClick: true,
          closeOnPullDown: true,
          closeOnPullUp: true 
        }}
        zoom={{
          maxZoomPixelRatio: 10,
          scrollToZoom: true,
          doubleTapDelay: 300,
          doubleClickDelay: 300,
          doubleClickMaxStops: 4,
          zoomInMultiplier: 1.25,
          keyboardMoveDistance: 50,
          wheelZoomDistanceFactor: 100,
          pinchZoomDistanceFactor: 100,
        }}
        render={{
          buttonPrev: slides.length <= 1 ? () => null : undefined,
          buttonNext: slides.length <= 1 ? () => null : undefined,
          controls: () => {
            const currentModel = post.imageModels?.[lightboxIndex];
            if (!currentModel) return null;
            return (
              <ImageModelBadge 
                modelName={currentModel} 
                slideSrc={imageUrls[lightboxIndex]} 
              />
            );
          }
        }}
      />
    </>
  );
}
