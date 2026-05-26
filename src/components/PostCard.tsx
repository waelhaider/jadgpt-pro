import React, { useState, useEffect } from 'react';
import { Post, OperationType, Board } from '../types';
import { db } from '../lib/firebase';
import { doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { MoreHorizontal, Trash2, Edit3, Check, X, Clock, Copy, Loader2, Image as ImageIcon, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError } from '../lib/error-handler';
import { deleteFromDrive, uploadToDrive } from '../lib/drive';
import { getAccessToken, googleSignIn } from '../lib/auth';
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

interface PostCardProps {
  post: Post;
  isAdmin: boolean;
  boards: Board[];
}

import { ADMIN_CONFIG } from '../config';

export default function PostCard({ post, isAdmin, boards }: PostCardProps) {
  const isPostFromAdmin = post.authorEmail === ADMIN_CONFIG.email;
  const displayName = isPostFromAdmin ? ADMIN_CONFIG.displayName : post.authorEmail.split('@')[0];

  const boardName = post.boardId 
    ? boards.find(b => b.id === post.boardId)?.name || 'غير معروف'
    : 'عام';
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(post.text);
  const [editedImageUrls, setEditedImageUrls] = useState<string[]>(post.imageUrls || (post.imageUrl ? [post.imageUrl] : []));
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [removedImageUrls, setRemovedImageUrls] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const [isDeleting, setIsDeleting] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

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
      if (accessToken && (post.imageUrls || post.imageUrl)) {
        const urlsToDelete = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);
        for (const url of urlsToDelete) {
          try {
            await deleteFromDrive(url, accessToken);
          } catch (driveErr) {
            console.warn('[PostCard] Failed to delete image from Drive (continuing):', driveErr);
          }
        }
      }

      await deleteDoc(doc(db, 'posts', post.id));
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

    const accessToken = getAccessToken();
    if (newImages.length > 0 && !accessToken) {
      handleAuthorize();
      return;
    }

    setIsSaving(true);
    setStatus('جاري الحفظ...');

    try {
      const freshToken = getAccessToken();
      console.log('[PostCard] Access token status:', freshToken ? 'Available' : 'Missing');
      
      setStatus('جاري معالجة الصور...');
      const finalImageUrls = [...editedImageUrls];
      
      // 1. Upload new images if any
      if (newImages.length > 0 && freshToken) {
        for (let i = 0; i < newImages.length; i++) {
          setStatus(`جاري رفع الصورة ${i + 1}/${newImages.length}...`);
          const url = await uploadToDrive(newImages[i], freshToken);
          finalImageUrls.push(url);
        }
      }

      // 2. Delete removed images from Drive if token is available
      if (removedImageUrls.length > 0 && freshToken) {
        setStatus('جاري حذف الصور القديمة...');
        for (const url of removedImageUrls) {
          try {
            await deleteFromDrive(url, freshToken);
          } catch (deleteErr) {
            console.warn('[PostCard] Drive delete failed:', deleteErr);
          }
        }
      }

      setStatus('جاري الحفظ في Firestore...');
      // 3. Update Firestore
      await updateDoc(doc(db, 'posts', post.id), {
        text: editedText.trim(),
        imageUrls: finalImageUrls,
        imageUrl: finalImageUrls.length > 0 ? finalImageUrls[0] : null,
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
        className={`mx-auto mb-4 w-full max-w-xl overflow-hidden rounded-2xl border border-natural-border bg-white transition-shadow hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${isDeleting ? 'opacity-50 grayscale pointer-events-none' : ''}`}
      >
        {/* Post Header */}
        <div className="flex items-center justify-between p-4" dir="rtl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-natural-primary to-natural-muted border border-natural-border shadow-md">
              {isPostFromAdmin ? (
                <img src={ADMIN_CONFIG.photoUrl} alt={displayName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="font-bold text-white uppercase">{post.authorEmail.charAt(0)}</span>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-natural-text">
                {displayName} {isPostFromAdmin && <span className="text-[10px] font-normal text-natural-muted leading-none block opacity-70">(المسؤول)</span>}
              </p>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-natural-muted">
                {post.createdAt ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) : 'الآن'} • {boardName}
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
        <div className="relative p-4 sm:p-5 text-right" dir="rtl">
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
                <button onClick={handleCopy} className="flex items-center gap-1 rounded-md bg-natural-bg px-2 py-1 text-[10px] font-bold text-natural-muted transition-all hover:bg-natural-secondary-bg hover:text-natural-primary">
                  {isCopied ? <><Check size={12} className="text-green-600" /><span className="text-green-600">تم النسخ</span></> : <><Copy size={12} /><span>نسخ النص</span></>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Image Grid/Gallery */}
        <div className="grid gap-0.5 overflow-hidden bg-natural-border">
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
              </div>
              <div className="grid grid-rows-2 gap-0.5">
                {imageUrls.slice(1).map((url, i) => (
                  <div 
                    key={i} 
                    className="relative aspect-square bg-natural-secondary-bg overflow-hidden cursor-pointer"
                    onClick={() => { setLightboxIndex(i + 1); setLightboxOpen(true); }}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ))}
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
        slides={slides}
        plugins={[Zoom]}
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
          doubleClickMaxStops: 2,
          keyboardMoveDistance: 50,
          wheelZoomDistanceFactor: 100,
          pinchZoomDistanceFactor: 100,
        }}
        render={{
          buttonPrev: slides.length <= 1 ? () => null : undefined,
          buttonNext: slides.length <= 1 ? () => null : undefined,
        }}
      />
    </>
  );
}
