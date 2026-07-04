import React, { useState, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Image as ImageIcon, Send, X, Loader2, RefreshCw } from 'lucide-react';
import { getCurrentUser, googleSignIn, getAccessToken } from '../lib/auth';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError } from '../lib/error-handler';
import { OperationType, Board } from '../types';

import { uploadPostImage } from '../lib/upload-helper';
import { ADMIN_CONFIG } from '../config';
import { compressImage } from '../lib/imageCompressor';
import { saveLocalUserPostsIndexedDB, getLocalUserPostsIndexedDB } from '../lib/indexedDbService';
import { showToast } from './Toast';

interface UploadPostProps {
  activeBoardId: string | null;
  activeBoardName?: string;
  boards?: Board[];
  onUploadSuccess?: (boardId: string | null) => void;
  isDarkMode?: boolean;
}

export default function UploadPost({ activeBoardId, activeBoardName, boards = [], onUploadSuccess, isDarkMode }: UploadPostProps) {
  const [text, setText] = useState('');
  const [targetBoardId, setTargetBoardId] = useState<string | null>(activeBoardId || 'placeholder');

  const [currentUser, setCurrentUser] = useState<any>(auth.currentUser);

  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = currentUser?.email === ADMIN_CONFIG.email;

  React.useEffect(() => {
    setTargetBoardId(activeBoardId || 'placeholder');
  }, [activeBoardId]);

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
  const [images, setImages] = useState<(File | string)[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [imageCaptions, setImageCaptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processTextForImageUrls = (inputText: string) => {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const matches = inputText.match(urlRegex);
    if (!matches) {
      setText(inputText);
      return;
    }

    let cleanText = inputText;
    const detectedUrls: string[] = [];

    for (const match of matches) {
      const href = match.toLowerCase().startsWith('www.') ? `https://${match}` : match;
      const cleanUrl = href.split('?')[0].split('#')[0];
      const isImg = /\.(jpeg|jpg|gif|png|webp|bmp|svg|tiff)$/i.test(cleanUrl);
      
      if (isImg && images.length + detectedUrls.length < 6) {
        detectedUrls.push(href);
        cleanText = cleanText.replace(match, '');
      }
    }

    if (detectedUrls.length > 0) {
      cleanText = cleanText
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      setImages(prev => [...prev, ...detectedUrls]);
      setPreviews(prev => [...prev, ...detectedUrls]);
      setSelectedModels(prev => [...prev, ...Array(detectedUrls.length).fill('')]);
      setImageCaptions(prev => [...prev, ...Array(detectedUrls.length).fill('')]);
      setText(cleanText);
      showToast('📸 تم التعرف على رابط الصورة وإضافتها للمرفقات تلقائياً!');
    } else {
      setText(inputText);
    }
  };

  React.useEffect(() => {
    const checkIncomingShare = async () => {
      // 1. Check local storage for simple text shares
      const sharedText = localStorage.getItem('shared_incoming_post');
      if (sharedText) {
        setText(sharedText);
        localStorage.removeItem('shared_incoming_post');
        showToast('تم جلب النص بنجاح إلى حقل كتابة المنشور! ✍️');
      }

      // 2. Check Cache Storage for PWA Web Share Target (images & metadata)
      if ('caches' in window) {
        try {
          const cache = await caches.open('shared-data');
          const metaRes = await cache.match('shared-meta');
          
          if (metaRes) {
            const meta = await metaRes.json();
            console.log('[PWA Share Target] Found metadata:', meta);
            
            let combinedText = meta.text || '';
            if (meta.title && meta.title !== 'undefined' && meta.title !== '') {
              combinedText = `${meta.title}\n${combinedText}`.trim();
            }
            
            if (combinedText) {
              setText(combinedText);
            }
            
            // Delete metadata from cache
            await cache.delete('shared-meta');
            
            // Get shared file (image)
            const fileRes = await cache.match('shared-file');
            if (fileRes) {
              const blob = await fileRes.blob();
              // Construct a valid File object
              const file = new File([blob], `shared_${Date.now()}.png`, { type: blob.type || 'image/png' });
              
              setImages([file]);
              setSelectedModels(['']);
              setImageCaptions(['']);
              
              const reader = new FileReader();
              reader.onloadend = () => {
                setPreviews([reader.result as string]);
              };
              reader.readAsDataURL(file);
              
              // Delete cached file
              await cache.delete('shared-file');
            }
            
            showToast('📥 تم جلب الصور والنصوص بنجاح!');
          }
        } catch (err) {
          console.error('[PWA Share Target] Error checking cache:', err);
        }
      }
    };

    window.addEventListener('storage', checkIncomingShare);
    checkIncomingShare();

    window.addEventListener('check_shared_post', checkIncomingShare);

    return () => {
      window.removeEventListener('storage', checkIncomingShare);
      window.removeEventListener('check_shared_post', checkIncomingShare);
    };
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    if (images.length + files.length > 6) {
      showToast('يمكنك إضافة 6 صور كحد أقصى في المنشور الواحد.');
      return;
    }

    const newImages = [...images];
    const newPreviews = [...previews];
    const newModels = [...selectedModels];
    const newCaptions = [...imageCaptions];

    files.forEach(file => {
      newImages.push(file);
      newModels.push(''); // No model selected initially
      newCaptions.push(''); // No caption initially
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    setImages(newImages);
    setSelectedModels(newModels);
    setImageCaptions(newCaptions);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    const newModels = selectedModels.filter((_, i) => i !== index);
    const newCaptions = imageCaptions.filter((_, i) => i !== index);
    setImages(newImages);
    setPreviews(newPreviews);
    setSelectedModels(newModels);
    setImageCaptions(newCaptions);
  };

  const [status, setStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<{message: string, showRefresh?: boolean} | null>(null);

  const handleAuthorize = async (shouldSetLoadingState = true): Promise<boolean> => {
    if (shouldSetLoadingState) setLoading(true);
    setStatus('طلب صلاحيات G-Drive للرفع والحفظ ');
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
      showToast('فشل الحصول على صلاحية الوصول. يرجى التأكد من السماح بالنوافذ المنبثقة.');
      return false;
    } finally {
      if (shouldSetLoadingState) {
        setLoading(false);
        setStatus('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let currentUser = getCurrentUser();
    
    const hasText = text.trim().length > 0;
    const hasImages = images.length > 0;

    if (!hasText && !hasImages) {
      showToast('لا يمكن نشر منشور فارغ (برجاء كتابة نص أو إضافة صورة)');
      return;
    }

    setLoading(true);
    setUploadError(null);

    // Intercept local posts
    if (targetBoardId === 'user-board') {
      try {
        const imageUrls: string[] = [];
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          if (typeof file === 'string') {
            imageUrls.push(file);
          } else {
            const base64 = await compressImage(file);
            imageUrls.push(base64);
          }
        }

        const payload = {
          id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          text: text.trim(),
          imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
          imageUrls: imageUrls,
          imageModels: selectedModels,
          imageCaptions: imageCaptions,
          boardId: 'user-board',
          authorId: currentUser?.uid || 'local-user',
          authorEmail: currentUser?.email || 'local-user@local.com',
          createdAtMillis: Date.now(),
        };

        const parsed = await getLocalUserPostsIndexedDB();
        parsed.unshift(payload);
        
        const isSaved = await saveLocalUserPostsIndexedDB(parsed);
        if (isSaved) {
          setText('');
          setImages([]);
          setPreviews([]);
          setSelectedModels([]);
          setImageCaptions([]);
          setStatus('');
          window.dispatchEvent(new Event('reload_local_posts'));
          if (onUploadSuccess) {
            onUploadSuccess('user-board');
          }
          showToast('تم الحفظ والنشر في لوحتك الشخصية محلياً 🎉');
        }
      } catch (err: any) {
        console.error(err);
        showToast('حدث خطأ أثناء الحفظ محلياً: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!currentUser) {
      showToast('يجب تسجيل الدخول لنشر منشور في اللوحات العامة.');
      setLoading(false);
      return;
    }

    // If we have images, check if we need to request authorization
    const hasFilesToUpload = images.some(img => typeof img !== 'string');
    if (hasFilesToUpload) {
      const activeToken = getAccessToken();
      if (!activeToken || activeToken === 'local-dummy-token') {
        const authorized = await handleAuthorize(false);
        if (!authorized) {
          setLoading(false);
          setStatus('');
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
          if (typeof file === 'string') {
            imageUrls.push(file);
            continue;
          }
          const currentStatus = `يتم رفع الصور ${i + 1} من ${images.length} إلى G-Drive`;
          console.log(`[UploadPost] Status: ${currentStatus}`);
          setStatus(currentStatus);
          try {
            const url = await uploadPostImage(file, currentUser.uid);
            imageUrls.push(url);
          } catch (uploadErr: any) {
            console.warn('[UploadPost] File upload error:', uploadErr);
            if (uploadErr.message === 'AUTH_REQUIRED' || uploadErr.message === 'AUTH_EXPIRED') {
              const authorized = await handleAuthorize(false);
              if (authorized) {
                currentUser = getCurrentUser(); // Refresh user after re-auth popup
                const retryUrl = await uploadPostImage(file, currentUser.uid);
                imageUrls.push(retryUrl);
                continue;
              } else {
                setLoading(false);
                setStatus('');
                return;
              }
            }
            throw uploadErr;
          }
        }
      }

      // 2. Save document to Firestore
      const postsPath = 'posts';
      const currentStatusSave = 'جاري الحفظ في قاعدة البيانات';
      console.log(`[UploadPost] Status: ${currentStatusSave}`);
      setStatus(currentStatusSave);
      
      // Always get the absolute latest user credentials before Firestore payload construction
      currentUser = getCurrentUser();
      
      const payload = {
        text: text.trim(),
        imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
        imageUrls: imageUrls,
        imageModels: selectedModels,
        imageCaptions: imageCaptions,
        boardId: (targetBoardId === 'placeholder' || targetBoardId === 'main-feed' || !targetBoardId) ? null : targetBoardId, // Explicitly null for main feed
        authorId: currentUser.uid,
        authorEmail: currentUser.email,
        createdAt: serverTimestamp(),
      };

      console.log('[UploadPost] Payload to Firestore:', payload);
      
      try {
        const docRef = await addDoc(collection(db, postsPath), payload);
        console.log('[UploadPost] Success! Doc ID:', docRef.id);
        if (onUploadSuccess) {
          const successId = (targetBoardId === 'placeholder' || targetBoardId === 'main-feed') ? null : targetBoardId;
          onUploadSuccess(successId);
        }
      } catch (err) {
        console.error('[UploadPost] Firestore Save Internal Error:', err);
        handleFirestoreError(err, OperationType.CREATE, postsPath);
      }

      // Reset form
      setText('');
      setImages([]);
      setPreviews([]);
      setSelectedModels([]);
      setImageCaptions([]);
      setStatus('');
      showToast('🎉تم نشر وحفظ الصور بكامل جودتها');
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
      showToast(`حدث خطأ أثناء النشر: ${msg}`);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const getTargetBoardName = () => {
    if (targetBoardId === 'user-board') return 'لوحة شخصية';
    if (targetBoardId === null || targetBoardId === 'placeholder' || targetBoardId === 'main-feed') return 'الرئيسية';
    return boards.find(b => b.id === targetBoardId)?.name || 'غير معروف';
  };
   {/* كلاس لوحة النشر كاملا*/}
  return (
    <div className="mx-auto mt-1 w-full max-w-xl">
      <div className={`overflow-hidden rounded-2xl border transition-colors relative ${
        isDarkMode 
          ? 'border-[#6980b0] bg-[#111822] shadow-[0_4px_12px_rgba(0,0,0,0.2)]' 
          : 'border-[#C1C3B8] bg-white shadow-[0_4px_12px_rgba(90,90,64,0.05)]'
      }`}>
        {/* Full Card Loading Overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-6 backdrop-blur-md transition-all ${
                isDarkMode 
                  ? 'bg-[#111822]/95 text-white' 
                  : 'bg-white/95 text-[#c26700]'
              }`}
            >
              <div className="flex flex-col items-center gap-4 text-center max-w-sm px-4">
                <Loader2 size={36} className={`animate-spin ${isDarkMode ? 'text-[#16af75]' : 'text-[#c26700]'}`} />
                <p className={`text-sm sm:text-base font-extrabold leading-relaxed ${isDarkMode ? 'text-[#16af75]' : 'text-[#c26700]'}`} dir="rtl">
                  {status || 'جاري معالجة المنشور ونشره...'}
                </p>
                <span className={`text-[11px] font-medium leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-[#4A4A35]/80'}`}>
                  برجاء عدم إغلاق الصفحة حتى تكتمل العملية بنجاح.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="p-2 sm:p-2 text-right">
          {uploadError && (
            <div className={`mb-4 rounded-lg p-4 border transition-all ${
              isDarkMode 
                ? 'bg-red-950/40 border-red-900/50 text-red-200' 
                : 'bg-red-50 border-red-200 text-red-800'
            }`} dir="rtl">
              <div className="flex items-start gap-3">
                <span className="text-lg">⚠️</span>
                <div className="flex-1">
                  <p className={`text-xs font-bold mb-2 ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{uploadError.message}</p>
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
        <AnimatePresence>
          {previews.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              {previews.map((prev, index) => {
                const models = ['gpt-2', 'grok', 'banana-2', 'flux', 'wan 2.7'];
                return (
                  <div
                    key={index}
                    className={`flex flex-col gap-2 p-2 rounded-xl border transition-colors relative ${
                      isDarkMode 
                        ? 'border-[#2C374E] bg-[#111822]/40' 
                        : 'border-natural-border/60 bg-natural-bg/30'
                    }`}
                    dir="rtl"
                  >
                    {/* Upper row: Image and Model Selector side by side using a robust 2-column grid */}
                    <div className="grid grid-cols-2 gap-3 w-full items-stretch">
                      {/* Right side: Uploaded Image */}
                      <div className="relative w-full aspect-video overflow-hidden rounded-lg border border-natural-border/30 bg-black/5 flex items-center justify-center shrink-0">
                        <img src={prev} alt={`Preview ${index + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => removeImage(index)}
                          className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur shadow-sm transition-transform hover:scale-110 active:scale-95 disabled:opacity-50 cursor-pointer z-10"
                        >
                          <X size={10} />
                        </button>
                      </div>

                      {/* Left side: Model Selector attached next to it */}
                      <div className="flex flex-col gap-1 text-right justify-center min-w-0" dir="rtl">
                        <span className={`text-[10px] font-black select-none ${isDarkMode ? 'text-gray-400' : 'text-[#4A4A35]'}`}>موديل توليد الصورة:</span>
                        <div className="grid grid-cols-2 gap-1 w-full">
                          {models.map((model, mIdx) => {
                            const isSelected = selectedModels[index] === model;
                            const isLastOdd = mIdx === models.length - 1 && models.length % 2 !== 0;
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
                                className={`px-1 py-1 rounded text-[9px] font-bold cursor-pointer transition-all border text-center truncate whitespace-nowrap overflow-hidden ${
                                  isLastOdd ? 'col-span-2' : ''
                                } ${
                                  isSelected
                                    ? isDarkMode
                                      ? 'bg-[#16af75] text-white border-transparent shadow-sm'
                                      : 'bg-[#4A4A35] text-white border-transparent shadow-sm'
                                    : isDarkMode
                                      ? 'bg-[#1a212e] text-gray-300 border-[#656c74]/50 hover:bg-[#2C374E]'
                                      : 'bg-white text-natural-muted border-natural-border/60 hover:bg-natural-bg/80'
                                }`}
                                title={model}
                              >
                                {model}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Lower row: Note input under the image */}
                    <div className="flex flex-col gap-1 text-right" dir="rtl">
                      <span className={`text-[10px] font-black select-none ${isDarkMode ? 'text-gray-400' : 'text-[#4A4A35]'}`}>ملاحظة حول الصورة:</span>
                      <input
                        type="text"
                        placeholder="اكتب ملاحظة لهذه الصورة"
                        value={imageCaptions[index] || ''}
                        onChange={(e) => {
                          const updated = [...imageCaptions];
                          updated[index] = e.target.value;
                          setImageCaptions(updated);
                        }}
                        disabled={loading}
                        className={`w-full text-[11px] font-medium border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 ${
                          isDarkMode
                            ? 'border-[#2C374E] bg-[#1a212e] text-white placeholder-gray-500 focus:ring-[#16af75]'
                            : 'border-natural-border/60 bg-white text-natural-text placeholder-[#A1A18E] focus:ring-natural-primary'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full mt-2 mb-2">
          <textarea
            value={text}
            onChange={(e) => processTextForImageUrls(e.target.value)}
            placeholder={` الصق النص للنشر في لوحة : ${getTargetBoardName()}`}
            className={`w-full resize-none rounded-xl border px-4 py-4 text-sm leading-normal focus:ring-1 focus:outline-none transition-all ${
              isDarkMode
                ? 'font-normal border-[#2C374E] bg-[#FCFAF2] text-[#1A212E] placeholder-[#8E8B7A] focus:ring-[#008D75]'
                : 'font-normal border-[#C1C3B8] bg-natural-bg text-natural-text placeholder-[#A1A18E] focus:ring-natural-primary'
            }`}
            rows={3}
            dir={isRtl(text) ? 'rtl' : 'ltr'}
            style={{ textAlign: isRtl(text) ? 'right' : 'left', lineHeight: '1.8' }}
            disabled={loading}
          />
        </div>

          <div className={`mt-0 gap-1 flex items-center justify-between pt-1 transition-colors ${isDarkMode ? 'border-[#2C374E]' : 'border-natural-border'}`}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || images.length >= 6}
              className={`group flex-[1.1] min-w-0 flex items-center justify-center gap-1 rounded-lg px-1.5 sm:px-3 h-10 py-0 text-xs sm:text-sm font-bold whitespace-nowrap transition-all disabled:opacity-50 cursor-pointer ${
                isDarkMode 
                  ? 'border border-[#656c74] text-[#16af75] bg-[#111822] hover:bg-[#1a212e]' 
                  : 'text-[#c26700] bg-[#fffaf5] shadow-md hover:bg-[#fef3e6] hover:border-[#c26700]/40 border border-[#cbd5e1]'
              }`}
            >
              <ImageIcon size={16} className={`hidden sm:inline-block ${isDarkMode ? "text-[#16af75]" : "text-[#c26700]"}`} />
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

            {isAdmin && (
              <select
                value={targetBoardId === null ? 'placeholder' : targetBoardId}
                onChange={(e) => {
                  const val = e.target.value;
                  setTargetBoardId(val === 'placeholder' ? null : val);
                }}
                className={`flex-[1.4] min-w-0 rounded-lg border pl-2 pr-2 sm:px-2.5 h-10 py-0 text-xs sm:text-sm font-bold whitespace-nowrap focus:outline-none cursor-pointer transition-all shadow-md text-center ${
                  isDarkMode 
                    ? 'border-[#656c74] bg-[#111822] text-[#16af75] hover:bg-[#1a212e] focus:ring-1 focus:ring-[#16af75]' 
                    : 'border-[#cbd5e1] bg-[#fffaf5] text-[#c26700] hover:bg-[#fef3e6] hover:border-[#c26700]/40 focus:ring-1 focus:ring-[#cbd5e1]'
                }`}
              >
                <option value="placeholder" style={{ color: '#dc2626', fontWeight: 'bold' }} className="text-red-600 font-bold bg-white dark:bg-[#111822]">
                  تحديد لوحة النشر
                </option>
                <option value="user-board" className={isDarkMode ? 'text-white bg-[#111822]' : 'text-natural-text bg-white'}>
                  لوحة شخصية
                </option>
                <option value="main-feed" className={isDarkMode ? 'text-white bg-[#111822]' : 'text-natural-text bg-white'}>
                  الرئيسية
                </option>
                {boards && boards.map((b) => (
                  <option key={b.id} value={b.id} className={isDarkMode ? 'text-white bg-[#111822]' : 'text-natural-text bg-white'}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="submit"
              disabled={loading || (!text.trim() && images.length === 0)}
              className={`flex-[0.8] min-w-0 px-1 sm:px-3 h-10 py-0 flex items-center justify-center rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer ${
                isDarkMode 
                  ? 'border border-[#656c74] text-[#16af75] bg-[#111822] hover:bg-[#1a212e] shadow-md' 
                  : 'text-[#c26700] bg-[#fffaf5] shadow-md hover:bg-[#fef3e6] hover:border-[#c26700]/40 border border-[#cbd5e1]'
              }`}
            >
              {loading ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 size={16} className="animate-spin" />
                  <span>انتظر...</span>
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
