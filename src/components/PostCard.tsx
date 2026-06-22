import React, { useState, useEffect } from 'react';
import { Post, OperationType, Board } from '../types';
import { db } from '../lib/firebase';
import { doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { MoreHorizontal, Trash2, Edit3, Check, X, Clock, Copy, Loader2, Image as ImageIcon, Plus, Sparkles, Pin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError } from '../lib/error-handler';
import { uploadPostImage, deletePostImage } from '../lib/upload-helper';
import { getAccessToken, googleSignIn } from '../lib/auth';
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

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
  const isPostFromAdmin = post.authorEmail === ADMIN_CONFIG.email;
  const displayName = isPostFromAdmin ? ADMIN_CONFIG.displayName : post.authorEmail.split('@')[0];

  const boardName = post.boardId 
    ? boards.find(b => b.id === post.boardId)?.name || 'غير معروف'
    : 'عام';
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(post.text);
  const [editedImageUrls, setEditedImageUrls] = useState<string[]>(post.imageUrls || (post.imageUrl ? [post.imageUrl] : []));
  const [editedBoardId, setEditedBoardId] = useState<string | null>(post.boardId || null);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [removedImageUrls, setRemovedImageUrls] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const [isDeleting, setIsDeleting] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPinning, setIsPinning] = useState(false);

  const handleTogglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) return;
    try {
      setIsPinning(true);
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
      setEditedImageUrls(post.imageUrls || (post.imageUrl ? [post.imageUrl] : []));
      setEditedBoardId(post.boardId || null);
      setNewImages([]);
      setNewPreviews([]);
      setRemovedImageUrls([]);
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
      const accessToken = getAccessToken();
      const urlsToDelete = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);
      
      if (urlsToDelete.length > 0) {
        for (const url of urlsToDelete) {
          try {
            await deletePostImage(url, accessToken);
          } catch (err) {
            console.warn('[PostCard] Failed to delete image:', err);
          }
        }
      }

      await deleteDoc(doc(db, 'posts', post.id));
      alert('تم حذف المنشور بنجاح! 🗑️');
    } catch (err) {
      console.error('Delete error:', err);
      alert('حدث خطأ أثناء الحذف: ' + (err instanceof Error ? err.message : String(err)));
      handleFirestoreError(err, OperationType.DELETE, postPath);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleAuthorize = async () => {
    setIsSaving(true);
    setStatus('جاري طلب صلاحية الوصول...');
    try {
      await googleSignIn();
    } catch (err) {
      console.error('[PostCard] Authorization failed:', err);
      alert('فشل الحصول على صلاحية الوصول. يرجى التأكد من السماح بالنوافذ المنبثقة.');
    } finally {
      setIsSaving(false);
      setStatus('');
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
      setStatus('جاري معالجة الصور...');
      const finalImageUrls = [...editedImageUrls];
      
      // 1. Upload new images if any
      if (newImages.length > 0) {
        const activeToken = getAccessToken();
        if (!activeToken || activeToken === 'local-dummy-token') {
          alert('يتطلب رفع صور جديدة تسجيل الدخول إلى Google Drive.');
          await handleAuthorize();
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
              await handleAuthorize();
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
      await updateDoc(doc(db, 'posts', post.id), {
        text: editedText.trim(),
        imageUrls: finalImageUrls,
        imageUrl: finalImageUrls.length > 0 ? finalImageUrls[0] : null,
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

    files.forEach(file => {
      nextNewImages.push(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    setNewImages(nextNewImages);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeExistingImage = (url: string) => {
    setEditedImageUrls(editedImageUrls.filter(u => u !== url));
    setRemovedImageUrls([...removedImageUrls, url]);
  };

  const removeNewImage = (index: number) => {
    setNewImages(newImages.filter((_, i) => i !== index));
    setNewPreviews(newPreviews.filter((_, i) => i !== index));
  };

  const imageUrls = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);
  const slides = imageUrls.map(url => ({ src: url }));

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`mx-auto mb-2.5 w-full max-w-xl rounded-2xl border border-[#C1C3B8] bg-white transition-shadow hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${isDeleting ? 'opacity-50 grayscale pointer-events-none' : ''}`}
      >
        {/* Post Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-1" dir="rtl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-natural-primary to-natural-muted border border-natural-border shadow-md">
              {isPostFromAdmin ? (
                <img src={ADMIN_CONFIG.photoUrl} alt={displayName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="font-bold text-white uppercase">{post.authorEmail.charAt(0)}</span>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-natural-text">{displayName}</span>
                {isPostFromAdmin && <span className="text-[10px] font-normal text-natural-muted leading-none opacity-70 relative -top-[1px]">(المسؤول)</span>}
                {post.isPinned && (
                  <Pin size={11} className="fill-red-500 text-red-600 shrink-0 select-none relative -top-[1px]" title="منشور مثبت" />
                )}
              </div>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-natural-muted">
                {(() => {
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
                  
                  return formatDistanceToNow(dateObj, { addSuffix: true });
                })()} • {boardName}
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-2">
              {showDeleteConfirm ? (
                <div className="flex items-center gap-1 bg-red-50 rounded-lg px-2 py-1 animate-in fade-in slide-in-from-right-4">
                  <span className="text-[10px] font-bold text-red-600 ml-1">تأكيد الحذف؟</span>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="p-1.5 hover:bg-red-100 rounded-md text-red-600 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="p-1.5 hover:bg-natural-secondary-bg rounded-md text-natural-muted transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleTogglePin}
                    disabled={isPinning}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      post.isPinned 
                        ? 'bg-red-50 hover:bg-red-100/80 text-red-600' 
                        : 'hover:bg-natural-secondary-bg text-natural-muted'
                    }`}
                    title={post.isPinned ? "إلغاء التثبيت" : "تثبيت المنشور في الأعلى"}
                  >
                    {isPinning ? (
                      <Loader2 size={16} className="animate-spin text-red-500" />
                    ) : (
                      <Pin size={16} className={post.isPinned ? 'fill-red-500 text-red-600' : ''} />
                    )}
                  </button>
                  <button onClick={() => setIsEditing(true)} className="p-2 hover:bg-natural-secondary-bg rounded-lg text-natural-muted transition-colors">
                    <Edit3 size={16} />
                  </button>
                  <button onClick={() => setShowDeleteConfirm(true)} className="p-2 hover:bg-red-50 rounded-lg text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Post Content */}
        <div className="relative px-4 pb-4 pt-1 sm:px-5 sm:pb-5 sm:pt-1 text-right" dir="rtl">
          {isEditing ? (
            <div className="space-y-4">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full resize-none rounded-xl border border-natural-border bg-natural-bg p-3 text-sm focus:ring-1 focus:ring-natural-primary"
                rows={4}
                autoFocus
              />
              
              {/* Existing & New Images Preview in Edit Mode */}
              <div className="grid grid-cols-3 gap-2">
                {editedImageUrls.map((url, i) => (
                  <div key={`existing-${i}`} className="relative aspect-square overflow-hidden rounded-lg border border-natural-border">
                    <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    <button 
                      type="button"
                      onClick={() => removeExistingImage(url)}
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
            <div className="group relative">
              <div className={`cursor-pointer transition-all duration-300 ${!isTextExpanded ? 'line-clamp-3' : ''}`} onClick={() => setIsTextExpanded(!isTextExpanded)}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4A4A35]">{post.text}</p>
              </div>
              <div className="mt-2 flex items-center justify-between">
                {post.text.split('\n').length > 3 || post.text.length > 200 ? (
                  <button onClick={() => setIsTextExpanded(!isTextExpanded)} className="text-[10px] font-bold text-natural-primary hover:underline">
                    {isTextExpanded ? 'عرض أقل ↑' : 'عرض المزيد ↓'}
                  </button>
                ) : <div />}
                <div className="flex items-center gap-1.5 relative">
                  <button 
                    onClick={handleTestPromptClick} 
                    className="flex items-center gap-1 rounded-md bg-natural-primary/10 px-2.5 py-1 text-[10px] font-black text-natural-primary transition-all hover:bg-natural-primary hover:text-white"
                  >
                    <Sparkles size={11} className="text-natural-primary hover:text-white" />
                    <span>تجريب البرومبت</span>
                  </button>

                  <AnimatePresence>
                    {showDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full mt-2 left-0 sm:left-auto sm:right-0 z-[100] w-80 rounded-2xl border border-natural-border bg-white p-3 shadow-2xl text-right overflow-hidden"
                        dir="rtl"
                      >
                        <div className="flex items-center justify-between border-b border-natural-border/50 pb-2 mb-2">
                          <p className="text-[11px] font-black text-[#4A4A35] flex items-center gap-1">
                            <Sparkles size={12} className="text-amber-500 animate-pulse" />
                            <span>اختر موقعاً لتوليد الصورة</span>
                          </p>
                          <button
                            onClick={() => setShowDropdown(false)}
                            className="p-1 rounded-md hover:bg-natural-bg text-natural-muted transition-colors cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </div>

                        {/* Copied feedback banner */}
                        <div className="mb-2.5 rounded-lg bg-green-50 border border-green-200/50 p-1.5 text-center text-[10px] text-green-700 font-bold select-none">
                          📋 تم نسخ البرومبت بنجاح وجاهز للصق!
                        </div>

                        {/* Websites list - identical styling to PromptBuilder sites directory */}
                        <div className="space-y-1.5 max-h-64 overflow-y-auto no-scrollbar pr-0.5">
                          {/* Render Default Sites first */}
                          {DEFAULT_SITES.map((site, index) => {
                            const isVisited = visitedTrialUrls.includes(site.url);
                            const cleanDisplayUrl = site.url.replace(/^https?:\/\/(www\.)?/i, '');
                            return (
                              <div
                                key={`default-${index}`}
                                className={`flex items-start justify-between gap-1.5 p-2 rounded-xl border transition-all ${
                                  isVisited
                                    ? 'bg-neutral-50/50 border-natural-border/80 opacity-90'
                                    : 'bg-green-50/5 border-natural-border/90 hover:bg-green-50/10'
                                }`}
                              >
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <span className="text-[10px] font-black text-[#4A4A35] min-w-[16px] mt-0.5 text-center select-none bg-natural-primary/10 rounded-md py-0.5 px-0.5">
                                    {index + 1}
                                  </span>
                                  <div className="flex-1 min-w-0 space-y-1">
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
                                      className={`inline-block text-xs font-black hover:underline break-all transition-colors leading-tight cursor-pointer font-mono ${
                                        isVisited
                                          ? 'text-red-700 hover:text-red-800'
                                          : 'text-emerald-900 hover:text-emerald-950 font-black'
                                      }`}
                                      title={`اضغط لزيارة: ${site.url}`}
                                      dir="ltr"
                                    >
                                      {cleanDisplayUrl}
                                    </a>
                                    <div className="flex items-center gap-1.5 opacity-95 max-w-xs bg-[#4A4A35]/5 border border-natural-border/50 rounded-lg px-2 py-0.5">
                                      <span className="text-[9px] text-[#4A4A35] font-black shrink-0 select-none font-sans"> الميزة  : </span>
                                      <span className="text-[10px] font-extrabold text-[#3A3A28] py-0 text-right font-sans truncate select-all">{site.label}</span>
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
                                className={`flex items-start justify-between gap-1.5 p-2 rounded-xl border transition-all ${
                                  isVisited
                                    ? 'bg-neutral-50/50 border-natural-border/80 opacity-90'
                                    : 'bg-green-50/5 border-natural-border/90 hover:bg-green-50/10'
                                }`}
                              >
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <span className="text-[10px] font-black text-[#4A4A35] min-w-[16px] mt-0.5 text-center select-none bg-natural-primary/10 rounded-md py-0.5 px-0.5">
                                    {offsetIndex + 1}
                                  </span>
                                  <div className="flex-1 min-w-0 space-y-1">
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
                                      className={`inline-block text-xs font-black hover:underline break-all transition-colors leading-tight cursor-pointer font-mono ${
                                        isVisited
                                          ? 'text-red-700 hover:text-red-800'
                                          : 'text-emerald-900 hover:text-emerald-950 font-black'
                                      }`}
                                      title={`اضغط لزيارة: ${site.url}`}
                                      dir="ltr"
                                    >
                                      {cleanDisplayUrl}
                                    </a>
                                    <div className="flex items-center gap-1.5 opacity-90 max-w-xs bg-[#4A4A35]/5 border border-natural-border/50 rounded-lg px-2 py-0.5">
                                      <span className="text-[9px] text-[#4A4A35] font-black shrink-0 select-none font-sans font-black"> الميزة  : </span>
                                      <input
                                        type="text"
                                        value={site.label || ''}
                                        onChange={(e) => handleEditCustomSiteLabel(site.url, e.target.value)}
                                        placeholder="اضغط لتسمية الموقع..."
                                        className="w-full bg-transparent text-[10px] font-extrabold text-[#3A3A28] focus:outline-none py-0 text-right font-sans border-none"
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
                                  className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 shrink-0 cursor-pointer self-start mt-0.5"
                                  title="حذف هذا الموقع المخصص"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {/* Add custom site form */}
                        <div className="mt-3 border-t border-natural-border/50 pt-2.5 space-y-2">
                          <div className="text-[10px] font-black text-natural-primary">
                            ➕ إضافة موقع تجريبي مخصص لملفك:
                          </div>
                          <div className="grid grid-cols-1 gap-1.5 text-right">
                            <input
                              type="text"
                              value={newSiteName}
                              onChange={(e) => setNewSiteName(e.target.value)}
                              placeholder="اسم الموقع المخصص (اختياري)"
                              className="w-full text-right rounded-xl border border-natural-border bg-natural-bg/30 px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-natural-primary focus:outline-none"
                            />
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                value={newSiteUrl}
                                onChange={(e) => setNewSiteUrl(e.target.value)}
                                placeholder="رابط الموقع (example.com)"
                                className="flex-1 text-right rounded-xl border border-natural-border bg-natural-bg/30 px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-natural-primary focus:outline-none"
                                dir="ltr"
                              />
                              <button
                                onClick={handleSaveCustomSite}
                                className="rounded-xl bg-natural-primary text-white px-3 py-1.5 text-xs font-black hover:bg-[#4A4A35] transition-all cursor-pointer whitespace-nowrap shadow-sm hover:shadow active:scale-95"
                              >
                                حفظ الموقع
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
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
                <div className="absolute bottom-2 right-2 bg-black/60 text-[#F5F5EC] border border-white/10 rounded-md px-2 py-0.5 text-[9px] font-black backdrop-blur-xs select-none pointer-events-none z-10 font-sans tracking-wide">
                  ✨ {post.imageModels[0]}
                </div>
              )}
            </div>
          )}
          
          {imageUrls.length === 2 && (
            <div className="grid grid-cols-2 gap-0.5">
              {imageUrls.map((url, i) => (
                <div 
                  key={i} 
                  className="relative aspect-square bg-natural-secondary-bg overflow-hidden cursor-pointer"
                  onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  {post.imageModels && post.imageModels[i] && (
                    <div className="absolute bottom-2 right-2 bg-black/60 text-[#F5F5EC] border border-white/10 rounded-md px-2 py-0.5 text-[9px] font-black backdrop-blur-xs select-none pointer-events-none z-10 font-sans tracking-wide">
                      ✨ {post.imageModels[i]}
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
                  <div className="absolute bottom-2 right-2 bg-black/60 text-[#F5F5EC] border border-white/10 rounded-md px-2 py-0.5 text-[9px] font-black backdrop-blur-xs select-none pointer-events-none z-10 font-sans tracking-wide">
                    ✨ {post.imageModels[0]}
                  </div>
                )}
              </div>
              <div className="grid grid-rows-2 gap-0.5">
                {imageUrls.slice(1).map((url, i) => {
                  const actualIndex = i + 1;
                  return (
                    <div 
                      key={i} 
                      className="relative aspect-square bg-natural-secondary-bg overflow-hidden cursor-pointer"
                      onClick={() => { setLightboxIndex(actualIndex); setLightboxOpen(true); }}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      {post.imageModels && post.imageModels[actualIndex] && (
                        <div className="absolute bottom-2 right-2 bg-black/60 text-[#F5F5EC] border border-white/10 rounded-md px-2 py-0.5 text-[9px] font-black backdrop-blur-xs select-none pointer-events-none z-10 font-sans tracking-wide">
                          ✨ {post.imageModels[actualIndex]}
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
                  key={i} 
                  className="relative aspect-square bg-natural-secondary-bg overflow-hidden cursor-pointer"
                  onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  {post.imageModels && post.imageModels[i] && (
                    <div className="absolute bottom-2 right-2 bg-black/60 text-[#F5F5EC] border border-white/10 rounded-md px-2 py-0.5 text-[9px] font-black backdrop-blur-xs select-none pointer-events-none z-10 font-sans tracking-wide">
                      ✨ {post.imageModels[i]}
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
              <div className="absolute bottom-30 right-3 bg-black/75 text-[#F5F5EC] border border-white/50 rounded-full px-3.5 py-1.5 text-xs font-black backdrop-blur-md select-none pointer-events-none z-50 font-sans tracking-wide shadow-lg flex items-center gap-1.5 animate-fade-in" dir="rtl">
                <span>موديل التوليد :</span>
                <span className="text-amber-200">{currentModel}</span>
              </div>
            );
          }
        }}
      />
    </>
  );
}
