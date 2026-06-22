import React, { useState, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Image as ImageIcon, Send, X, Loader2, RefreshCw } from 'lucide-react';
import { getCurrentUser, googleSignIn, getAccessToken } from '../lib/auth';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError } from '../lib/error-handler';
import { OperationType } from '../types';

import { uploadPostImage } from '../lib/upload-helper';
import { ADMIN_CONFIG } from '../config';

interface UploadPostProps {
  activeBoardId: string | null;
  activeBoardName?: string;
}

export default function UploadPost({ activeBoardId, activeBoardName }: UploadPostProps) {
  const [text, setText] = useState('');

  // Auto-detect direction helper: returns true if Arabic/RTL is matched
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
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
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
    const newModels = [...selectedModels];

    files.forEach(file => {
      newImages.push(file);
      newModels.push(''); // No model selected initially
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    setImages(newImages);
    setSelectedModels(newModels);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    const newModels = selectedModels.filter((_, i) => i !== index);
    setImages(newImages);
    setPreviews(newPreviews);
    setSelectedModels(newModels);
  };

  const [status, setStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<{message: string, showRefresh?: boolean} | null>(null);

  const handleAuthorize = async (): Promise<boolean> => {
    setLoading(true);
    setStatus('جاري طلب صلاحيات Google Drive للرفع والحفظ ');
    try {
      await googleSignIn();
      setUploadError(null);
      return true;
    } catch (err) {
      console.error('Sign in failed:', err);
      setUploadError({
        message: 'فشل الحصول على صلاحية الوصول إلى Google Drive. يرجى التأكد من السماح بالنوافذ المنبثقة من المتصفح والموافقة.',
        showRefresh: true
      });
      alert('فشل الحصول على صلاحية الوصول. يرجى التأكد من السماح بالنوافذ المنبثقة.');
      return false;
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let currentUser = getCurrentUser();
    if (!currentUser) return;
    
    const hasText = text.trim().length > 0;
    const hasImages = images.length > 0;

    if (!hasText && !hasImages) {
      alert('لا يمكن نشر منشور فارغ (برجاء كتابة نص أو إضافة صورة)');
      return;
    }

    setLoading(true);
    setUploadError(null);

    // If we have images, check if we need to request authorization
    if (hasImages) {
      const activeToken = getAccessToken();
      if (!activeToken || activeToken === 'local-dummy-token') {
        const authorized = await handleAuthorize();
        if (!authorized) {
          setLoading(false);
          return;
        }
        // Refresh session after Google login completes
        currentUser = getCurrentUser();
      }
    }
    
    setLoading(true);
    setUploadError(null);
    
    try {
      // 1. Upload all to Google Drive
      const imageUrls: string[] = [];
      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          const currentStatus = `جاري رفع الصورة ${i + 1} من ${images.length} إلى Google Drive...`;
          console.log(`[UploadPost] Status: ${currentStatus}`);
          setStatus(currentStatus);
          try {
            const url = await uploadPostImage(file, currentUser.uid);
            imageUrls.push(url);
          } catch (uploadErr: any) {
            console.warn('[UploadPost] File upload error:', uploadErr);
            if (uploadErr.message === 'AUTH_REQUIRED' || uploadErr.message === 'AUTH_EXPIRED') {
              const authorized = await handleAuthorize();
              if (authorized) {
                currentUser = getCurrentUser(); // Refresh user after re-auth popup
                const retryUrl = await uploadPostImage(file, currentUser.uid);
                imageUrls.push(retryUrl);
                continue;
              }
            }
            throw uploadErr;
          }
        }
      }

      // 2. Save document to Firestore
      const postsPath = 'posts';
      const currentStatusSave = 'جاري الحفظ في قاعدة البيانات...';
      console.log(`[UploadPost] Status: ${currentStatusSave}`);
      setStatus(currentStatusSave);
      
      // Always get the absolute latest user credentials before Firestore payload construction
      currentUser = getCurrentUser();
      
      const payload = {
        text: text.trim(),
        imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
        imageUrls: imageUrls,
        imageModels: selectedModels,
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
      setSelectedModels([]);
      setStatus('');
      alert('تم النشر ورفع الصور بكامل جودتها وابعادها الاصلية إلى Google Drive وحفظها بنجاح! 🎉');
    } catch (error) {
      console.error('Final upload error track:', error);
      const msg = error instanceof Error ? error.message : String(error);
      let isAuthErr = msg.includes('AUTH_REQUIRED') || msg.includes('AUTH_EXPIRED') || msg.includes('401') || msg.includes('403') || msg.includes('expired') || msg.includes('token');
      
      setUploadError({ 
        message: isAuthErr 
          ? 'انتهت صلاحية الاتصال بـ Google Drive أو لم يتم السماح بالوصول بالشكل الصحيح. الرجاء تجديد الصلاحية بضغطة واحدة للمحاولة مجدداً.' 
          : `حدث خطأ أثناء النشر والرفع: ${msg}`,
        showRefresh: isAuthErr
      });
      alert(`حدث خطأ أثناء النشر: ${msg}`);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="mx-auto mt-1 w-full max-w-xl">
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
                      onClick={() => handleAuthorize()}
                      className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-[10px] font-bold text-white transition-all hover:bg-red-700 mt-2"
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
                dir={isRtl(text) ? 'rtl' : 'ltr'}
                style={{ textAlign: isRtl(text) ? 'right' : 'left' }}
                disabled={loading}
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
                {previews.map((prev, index) => {
                  const models = ['gpt-image-2', 'nano-banana2', 'wan 2.7', 'grok'];
                  return (
                    <div key={index} className="flex flex-col gap-1.5 p-1.5 rounded-xl border border-natural-border/60 bg-natural-bg/30 relative">
                      <div className="relative aspect-video overflow-hidden rounded-lg border border-natural-border/30 bg-natural-bg">
                        <img src={prev} alt={`Preview ${index + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => removeImage(index)}
                          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur shadow-sm transition-transform hover:scale-110 active:scale-95 disabled:opacity-50 cursor-pointer z-10"
                        >
                          <X size={12} />
                        </button>
                      </div>

                      {/* Model Selector Pills */}
                      <div className="flex flex-col gap-1 text-right" dir="rtl">
                        <span className="text-[10px] font-black text-[#4A4A35] select-none">موديل توليد الصورة:</span>
                        <div className="flex flex-wrap gap-1">
                          {models.map((model) => {
                            const isSelected = selectedModels[index] === model;
                            return (
                              <button
                                key={model}
                                type="button"
                                disabled={loading}
                                onClick={() => {
                                  const updated = [...selectedModels];
                                  updated[index] = isSelected ? '' : model;
                                  setSelectedModels(updated);
                                }}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-all border ${
                                  isSelected
                                    ? 'bg-[#4A4A35] text-white border-transparent shadow-sm'
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
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 flex items-center justify-between border-t border-natural-border pt-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || images.length >= 6}
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
              disabled={loading}
            />

            <button
              type="submit"
              disabled={loading || (!text.trim() && images.length === 0)}
              className="px-6 py-1.5 rounded-lg text-sm font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-natural-primary hover:bg-[#4A4A35] text-white"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin" />
                  {status || 'جاري النشر...'}
                </div>
              ) : (
                'نشر الآن'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
