import React, { useState, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Image as ImageIcon, Send, X, Loader2, RefreshCw } from 'lucide-react';
import { googleSignIn, getAccessToken, getCurrentUser } from '../lib/auth';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError } from '../lib/error-handler';
import { OperationType } from '../types';

import { uploadToDrive } from '../lib/drive';
import { ADMIN_CONFIG } from '../config';

interface UploadPostProps {
  activeBoardId: string | null;
  activeBoardName?: string;
}

export default function UploadPost({ activeBoardId, activeBoardName }: UploadPostProps) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    if (images.length + files.length > 6) {
      alert('يمكنك إضافة 6 صور كحد أقصى في المنشور الواحد.');
      return;
    }

    const newImages = [...images];
    const newPreviews = [...previews];

    files.forEach(file => {
      newImages.push(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    setImages(newImages);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setImages(newImages);
    setPreviews(newPreviews);
  };

  const [status, setStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<{message: string, showRefresh: boolean} | null>(null);

  const currentToken = getAccessToken();
  const hasDriveAccess = !!currentToken && currentToken !== 'local-dummy-token';

  const handleAuthorize = async () => {
    setLoading(true);
    setStatus('جاري طلب صلاحية الوصول...');
    try {
      await googleSignIn();
      setUploadError(null);
    } catch (err) {
      console.error('Sign in failed:', err);
      alert('فشل الحصول على صلاحية الوصول. يرجى التأكد من السماح بالنوافذ المنبثقة.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    const hasText = text.trim().length > 0;
    const hasImages = images.length > 0;

    if (!hasText && !hasImages) {
      alert('لا يمكن نشر منشور فارغ (برجاء كتابة نص أو إضافة صورة)');
      return;
    }

    const currentToken = getAccessToken();

    if (hasImages && (!currentToken || currentToken === 'local-dummy-token')) {
      handleAuthorize();
      return;
    }

    setLoading(true);
    setUploadError(null);
    
    try {
      // 1. Upload all to Drive if any
      const driveUrls: string[] = [];
      if (images.length > 0 && currentToken) {
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          const currentStatus = `جاري رفع الصورة ${i + 1} من ${images.length}...`;
          console.log(`[UploadPost] Status: ${currentStatus}`);
          setStatus(currentStatus);
          const url = await uploadToDrive(file, currentToken);
          driveUrls.push(url);
        }
      }

      // 2. Save document to Firestore
      const postsPath = 'posts';
      const currentStatusSave = 'جاري الحفظ في قاعدة البيانات...';
      console.log(`[UploadPost] Status: ${currentStatusSave}`);
      setStatus(currentStatusSave);
      
      const payload = {
        text: text.trim(),
        imageUrl: driveUrls.length > 0 ? driveUrls[0] : null,
        imageUrls: driveUrls,
        boardId: activeBoardId || null, // Explicitly null for main feed
        authorId: currentUser.uid,
        authorEmail: currentUser.email,
        createdAt: serverTimestamp(),
      };

      console.log('[UploadPost] Payload to Firestore:', payload);
      
      try {
        const docRef = await addDoc(collection(db, postsPath), payload);
        console.log('[UploadPost] Success! Doc ID:', docRef.id);
      } catch (err) {
        console.error('[UploadPost] Firestore Save Internal Error:', err);
        handleFirestoreError(err, OperationType.CREATE, postsPath);
      }

      // Reset form
      setText('');
      setImages([]);
      setPreviews([]);
      setStatus('');
      alert('تم النشر بنجاح! 🎉');
    } catch (error) {
      console.error('Final upload error track:', error);
      const msg = error instanceof Error ? error.message : String(error);
      
      let finalMsg = msg;
      let showRefreshButton = false;

      if (msg.includes('SERVICE_DISABLED')) {
        finalMsg = 'يجب تفعيل Google Drive API أولاً. يرجى الضغط على الرابط في رسالة الخطأ لتفعيله في حسابك.';
      } else if (msg.includes('401') || msg.includes('403') || msg.includes('expired') || msg.includes('token')) {
        finalMsg = 'انتهت صلاحية الوصول إلى Google Drive. يرجى الضغط على الزر أدناه لتجديدها بضغطة واحدة.';
        showRefreshButton = true;
      }
      
      setUploadError({ message: finalMsg, showRefresh: showRefreshButton });
      alert(`حدث خطأ: ${finalMsg}`);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const handleRefreshToken = async () => {
    setLoading(true);
    setStatus('جاري تجديد الصلاحيات...');
    try {
      await googleSignIn();
      setUploadError(null);
      alert('تم تجديد الصلاحية بنجاح! يمكنك الآن النشر.');
    } catch (err) {
      console.error('Manual refresh failed:', err);
      alert('فشل تجديد الصلاحية. يرجى التأكد من السماح بالنوافذ المنبثقة.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="mx-auto mt-4 w-full max-w-xl">
      <div className="overflow-hidden rounded-2xl border border-natural-border bg-white shadow-[0_4px_12px_rgba(90,90,64,0.05)]">
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 text-right">
          {uploadError && (
            <div className="mb-4 rounded-lg bg-red-50 p-4" dir="rtl">
              <div className="flex items-start gap-3">
                <span className="text-lg">⚠️</span>
                <div className="flex-1">
                  <p className="text-xs text-red-700 font-bold mb-2">{uploadError.message}</p>
                  {uploadError.showRefresh && (
                    <button
                      type="button"
                      onClick={handleRefreshToken}
                      className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-[10px] font-bold text-white transition-all hover:bg-red-700"
                    >
                      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                      تجديد الصلاحية الآن
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-4">
            <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border border-natural-border bg-[#E8EAE3] shadow-md">
              <img src={ADMIN_CONFIG.photoUrl} alt="Admin" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="flex-1">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={activeBoardName ? `النشر في لوحة: ${activeBoardName}...` : "النشر في اللوحة الرئيسية..."}
                className="w-full resize-none rounded-xl border-none bg-natural-bg p-3 text-sm font-medium text-natural-text placeholder-[#A1A18E] focus:ring-1 focus:ring-natural-primary"
                rows={3}
                dir="rtl"
              />
            </div>
          </div>

          <AnimatePresence>
            {previews.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-4 grid grid-cols-2 gap-2"
              >
                {previews.map((prev, index) => (
                  <div key={index} className="relative aspect-video overflow-hidden rounded-xl border border-natural-border bg-natural-bg">
                    <img src={prev} alt={`Preview ${index + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur shadow-sm transition-transform hover:scale-110 active:scale-95"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 flex items-center justify-between border-t border-natural-border pt-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= 6}
              className="group flex items-center gap-2 rounded-lg border border-natural-border px-3 py-1.5 text-xs font-medium text-natural-primary transition-all hover:bg-natural-bg disabled:opacity-50"
            >
              <ImageIcon size={16} />
              إضافة صور ({images.length}/6)
            </button>
            <input
              type="file"
              hidden
              multiple
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageChange}
            />

            <button
              type="submit"
              disabled={loading || (!text.trim() && images.length === 0)}
              className={`px-6 py-1.5 rounded-lg text-sm font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                !hasDriveAccess && images.length > 0 
                  ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                  : 'bg-natural-primary hover:bg-[#4A4A35] text-white'
              }`}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin" />
                  {status || 'جاري النشر...'}
                </div>
              ) : (
                !hasDriveAccess && images.length > 0 ? 'تفعيل Google Drive للنشر' : 'نشر الآن'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
