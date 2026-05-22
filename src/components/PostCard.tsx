import React, { useState, useEffect } from 'react';
import { Post, OperationType, Board } from '../types';
import { db } from '../lib/firebase';
import { doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { MoreHorizontal, Trash2, Edit3, Check, X, Clock, Copy, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError } from '../lib/error-handler';
import { deleteFromDrive } from '../lib/drive';
import { getAccessToken } from '../lib/auth';
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

  const handleUpdate = async () => {
    if (!editedText.trim() || editedText === post.text) {
      setIsEditing(false);
      return;
    }

    const postPath = `posts/${post.id}`;
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        text: editedText.trim(),
        updatedAt: serverTimestamp(),
      });
      setIsEditing(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, postPath);
    }
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
            <div className="space-y-3">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full resize-none rounded-xl border border-natural-border bg-natural-bg p-3 text-sm focus:ring-1 focus:ring-natural-primary"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2 justify-start">
                <button onClick={handleUpdate} className="flex items-center gap-1 rounded-lg bg-natural-primary px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#4A4A35]">
                  <Check size={14} /> حفظ
                </button>
                <button onClick={() => { setIsEditing(false); setEditedText(post.text); }} className="flex items-center gap-1 rounded-lg border border-natural-border px-4 py-1.5 text-xs font-bold text-natural-muted transition-colors hover:bg-natural-bg">
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
