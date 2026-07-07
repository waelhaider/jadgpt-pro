import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeftRight, Copy, Loader2, Columns, Rows } from 'lucide-react';
import { showToast } from './Toast';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { Board } from '../types';

// ==========================================
// القيمة القابلة للتعديل لبعد النافذة عن أعلى الصفحة
// يمكنك تعديل هذه القيمة (مثلاً '10px' أو '15px' أو '30px') حسب رغبتك لاحقاً
// ==========================================
const MODAL_TOP_OFFSET = '20px';

interface TextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  activeBoardId: string | null;
  boards: Board[];
  user: User | null;
  onSelectBoard?: (id: string | null) => void;
}

export default function TextEditorModal({ isOpen, onClose, boards = [], user, onSelectBoard }: TextEditorModalProps) {
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [srcLang, setSrcLang] = useState('auto');
  const [tgtLang, setTgtLang] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);

  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('post_font_size');
    return saved ? parseInt(saved, 10) : 14;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isSaveDropdownOpen, setIsSaveDropdownOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'split' | 'stacked'>('split');

  // Back gesture / browser back history integration to close modal without exiting the app
  useEffect(() => {
    if (!isOpen) return;

    const modalState = { modalId: 'text-editor-' + Date.now() };
    window.history.pushState(modalState, '');

    const handlePopState = (e: PopStateEvent) => {
      onClose();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state && window.history.state.modalId === modalState.modalId) {
        window.history.back();
      }
    };
  }, [isOpen, onClose]);

  const handleSaveToBoard = async (boardId: string | null) => {
    setIsSaveDropdownOpen(false);
    
    const textToSave = originalText.trim();
    if (!textToSave) {
      showToast('⚠️ لا يوجد نص أصلي لحفظه!');
      return;
    }

    if (!user) {
      showToast('⚠️ يجب تسجيل الدخول لحفظ المنشور.');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Copy original text to clipboard
      try {
        await navigator.clipboard.writeText(textToSave);
      } catch (copyErr) {
        console.error('Failed to copy text on save:', copyErr);
      }

      // 2. Save original text as a new post to Firestore
      const payload = {
        text: textToSave,
        imageUrl: null,
        imageUrls: [],
        imageModels: [],
        imageCaptions: [],
        fileNames: [],
        fileTypes: [],
        boardId: boardId,
        authorId: user.uid,
        authorEmail: user.email || user.uid,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'posts'), payload);

      // 3. Transition to the selected board
      if (onSelectBoard) {
        onSelectBoard(boardId);
      }

      // 4. Close the modal
      onClose();

      // 5. Success toast
      showToast('📋 تم نسخ النص وحفظه بنجاح كمنشور جديد! 🎉');
    } catch (err) {
      console.error('Failed to save text to board:', err);
      showToast('⚠️ فشل حفظ المنشور في اللوحة.');
    } finally {
      setIsSaving(false);
    }
  };

  // Prevent background scrolling and content shifting when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

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

  // Auto-detect direction helper: returns true if Arabic/RTL is matched
  const isRtl = (text: string): boolean => {
    if (!text) return true; // Default to natural Arabic direction
    let arabicCount = 0;
    let englishCount = 0;
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
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
    // If equal or no letter characters, check if any Arabic exists
    const rtlChar = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\uFE70-\uFEFC]/;
    return rtlChar.test(text);
  };

  // Auto-switch target language based on typed original text
  useEffect(() => {
    if (!originalText.trim()) return;
    const isOrigArabic = /[\u0600-\u06FF]/.test(originalText);
    
    if (!isOrigArabic) {
      // Original text is English / Non-Arabic
      if (tgtLang === 'en') {
        setTgtLang('ar');
      }
    } else {
      // Original text is Arabic
      if (tgtLang === 'ar') {
        setTgtLang('en');
      }
    }
  }, [originalText]);

  // Auto-translate with debounce
  useEffect(() => {
    if (!originalText.trim()) {
      setTranslatedText('');
      return;
    }

    setIsTranslating(true);
    const timer = setTimeout(async () => {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcLang}&tl=${tgtLang}&dt=t&q=${encodeURIComponent(originalText)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Translation API error');
        
        const data = await response.json();
        if (data && data[0]) {
          const result = data[0]
            .map((item: any) => item[0])
            .filter(Boolean)
            .join('');
          setTranslatedText(result);
        }
      } catch (err) {
        console.error('Translation failed:', err);
      } finally {
        setIsTranslating(false);
      }
    }, 450); // 450ms debounce to prevent hitting rate limits

    return () => clearTimeout(timer);
  }, [originalText, srcLang, tgtLang]);

  const handleSwap = () => {
    const tempText = originalText;
    setOriginalText(translatedText);
    setTranslatedText(tempText);

    // Swap selected languages seamlessly
    const currentSrc = srcLang;
    const currentTgt = tgtLang;

    if (currentSrc === 'auto') {
      const detectedSrc = /[\u0600-\u06FF]/.test(tempText) ? 'ar' : 'en';
      setSrcLang(currentTgt);
      setTgtLang(detectedSrc);
    } else {
      setSrcLang(currentTgt);
      setTgtLang(currentSrc);
    }
  };

  const copyText = async (text: string, label: string) => {
    if (!text.trim()) {
      showToast('⚠️ النص فارغ!');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(`📋 تم نسخ ${label} بنجاح!`);
    } catch (err) {
      console.error('Failed to copy text:', err);
      showToast('⚠️ فشل نسخ النص.');
    }
  };

  if (!isOpen) return null;

  const isOriginalRtl = isRtl(originalText);
  const isTranslatedRtl = isRtl(translatedText);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-start justify-center p-2 sm:p-4 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Modal Panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', duration: 0.35 }}
          className="relative w-[98%] sm:w-[98%] max-w-[1450px] bg-white rounded-2xl shadow-2xl border border-natural-border overflow-hidden flex flex-col"
          style={{
            marginTop: MODAL_TOP_OFFSET,
            height: `calc(100dvh - ${MODAL_TOP_OFFSET} - 20px)`,
          }}
          dir="rtl"
        >
          {/* Close button for mobile - placed top-left of the container with padding 0 */}
          <button
            type="button"
            onClick={onClose}
            title="إغلاق النافذة"
            className="sm:hidden absolute top-0 left-0 p-0 flex h-10 w-10 items-center justify-center text-red-600 hover:text-red-800 hover:bg-red-50 transition-all z-50 cursor-pointer"
          >
            <X size={20} />
          </button>

          {/* Header Area */}
          <div className="px-2 py-1 bg-natural-bg/50 border-b border-natural-border flex items-center justify-between gap-2">
            
            {/* Right Side: Original Text Label & Language Selector */}
            <div className="flex-1 text-right flex flex-col items-start justify-center pt-6 pr-0 pb-0 pl-0 sm:p-0">
              <span className="text-xs font-bold text-[#016f4a] block w-full max-w-[140px] text-center">النص الأصلي</span>
              <select
                value={srcLang}
                onChange={(e) => setSrcLang(e.target.value)}
                className="mt-1 text-[11px] rounded-md border border-natural-border px-0.5 py-1 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary cursor-pointer w-full max-w-[140px]"
              >
                <option value="auto">تلقائي(Auto)</option>
                <option value="ar">العربية (Arabic)</option>
                <option value="en">الإنجليزية (English)</option>
                <option value="fr">الفرنسية (French)</option>
                <option value="tr">التركية (Turkish)</option>
                <option value="de">الألمانية (German)</option>
                <option value="es">الإسبانية (Spanish)</option>
                <option value="it">الإيطالية (Italian)</option>
                <option value="ru">الروسية (Russian)</option>
                <option value="zh">الصينية (Chinese)</option>
              </select>
            </div>

            {/* Middle Side: Swap button and Layout/Close controls */}
            <div className="flex items-center gap-1.5 pt-6 pr-0 pb-0 pl-0 sm:p-0">
              {/* Swap Button */}
              <button
                type="button"
                onClick={handleSwap}
                title="تبديل النصوص واللغات"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-natural-primary/5 text-natural-primary hover:bg-natural-primary hover:text-white transition-all shadow-sm border border-natural-primary/10 shrink-0 cursor-pointer"
              >
                <ArrowLeftRight size={14} />
              </button>

              {/* Layout Toggle Button - Visible in place of close button on mobile */}
              <button
                type="button"
                onClick={() => setLayoutMode(layoutMode === 'split' ? 'stacked' : 'split')}
                title={layoutMode === 'split' ? 'تبديل إلى عرض تحت بعض (Stacked)' : 'تبديل إلى عرض متقابل (Split)'}
                className="flex h-8 w-8 sm:hidden items-center justify-center rounded-lg bg-natural-primary/5 text-natural-primary hover:bg-natural-primary hover:text-white transition-all shadow-sm border border-natural-primary/10 shrink-0 cursor-pointer"
              >
                {layoutMode === 'split' ? <Rows size={14} /> : <Columns size={14} />}
              </button>

              {/* Close Button - Visible only on desktop here */}
              <button
                type="button"
                onClick={onClose}
                title="إغلاق النافذة"
                className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-all shadow-sm border border-red-200 shrink-0 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Left Side: Translation Label & Language Selector */}
            <div className="flex-1 text-left flex flex-col items-end justify-center pt-6 pr-0 pb-0 pl-0 sm:p-0">
              <span className="text-xs font-bold text-[#016f4a] block w-full max-w-[140px] text-center">الترجمة</span>
              <select
                value={tgtLang}
                onChange={(e) => setTgtLang(e.target.value)}
                className="mt-1 text-[11px] rounded-md border border-natural-border px-0.5 py-1 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary cursor-pointer w-full max-w-[140px] text-right"
              >
                <option value="en">الإنجليزية (English)</option>
                <option value="ar">العربية (Arabic)</option>
                <option value="fr">الفرنسية (French)</option>
                <option value="tr">التركية (Turkish)</option>
                <option value="de">الألمانية (German)</option>
                <option value="es">الإسبانية (Spanish)</option>
                <option value="it">الإيطالية (Italian)</option>
                <option value="ru">الروسية (Russian)</option>
                <option value="zh">الصينية (Chinese)</option>
              </select>
            </div>

          </div>

          {/* Text Areas Section */}
          <div className={`flex-1 p-1 overflow-y-auto ${
            layoutMode === 'stacked' 
              ? 'flex flex-col gap-1 h-full' 
              : 'grid grid-cols-2 gap-1'
          }`}>
            
            {/* Right Column/Row: Original Input Area */}
            <div className={`flex flex-col min-h-[120px] ${
              layoutMode === 'stacked' ? 'flex-1 h-1/2' : 'h-full'
            }`}>
              <textarea
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                placeholder="لصق أو كتابة النص الأصلي هنا..."
                dir={isOriginalRtl ? 'rtl' : 'ltr'}
                className={`w-full flex-1 p-3 rounded-lg border border-natural-border focus:outline-none focus:ring-1 focus:ring-natural-primary font-medium leading-relaxed bg-neutral-50/50 resize-none ${
                  isOriginalRtl ? 'text-right' : 'text-left'
                }`}
                maxLength={20000}
                style={{ fontSize: `${fontSize}px` }}
              />
            </div>

            {/* Left Column/Row: Translation View Area */}
            <div className={`flex flex-col min-h-[120px] ${
              layoutMode === 'stacked' ? 'flex-1 h-1/2' : 'h-full'
            }`}>
              <div className="relative w-full flex-1 flex flex-col h-full">
                <textarea
                  readOnly
                  value={translatedText}
                  placeholder="الترجمة اللحظية ستظهر هنا..."
                  dir={isTranslatedRtl ? 'rtl' : 'ltr'}
                  className={`w-full flex-1 p-3 rounded-lg border border-natural-border bg-neutral-100/50 font-medium leading-relaxed resize-none focus:outline-none ${
                    isTranslatedRtl ? 'text-right' : 'text-left'
                  }`}
                  style={{ fontSize: `${fontSize}px` }}
                />

                {/* Loading indicator inside translation field */}
                {isTranslating && (
                  <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px] flex items-center justify-center rounded-lg">
                    <div className="flex items-center gap-2 text-natural-primary bg-white px-3 py-1.5 rounded-lg shadow-md border border-natural-border">
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-xs font-bold">جاري الترجمة...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Footer Action Buttons Section in a single row - All three buttons are identical in size and height */}
          <div className="px-2 py-2 bg-natural-bg border-t border-natural-border flex flex-row items-center justify-between gap-3 w-full">
            
            {/* نسخ الأصلي */}
            <button
              type="button"
              onClick={() => copyText(originalText, 'النص الأصلي')}
              disabled={!originalText.trim()}
              className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg bg-white border border-natural-border hover:bg-neutral-50 text-natural-text text-xs sm:text-sm font-bold shadow-sm transition-all disabled:opacity-50 active:scale-95 cursor-pointer whitespace-nowrap min-w-0"
            >
              <Copy size={14} className="text-natural-muted shrink-0" />
              <span className="truncate">نسخ الأصلي</span>
            </button>

            {/* حفظ في لوحة */}
            <div className="relative flex-1 min-w-0 w-full">
              <button
                type="button"
                onClick={() => setIsSaveDropdownOpen(!isSaveDropdownOpen)}
                disabled={isSaving || !originalText.trim()}
                className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg bg-natural-primary text-white hover:bg-natural-primary/95 text-xs sm:text-sm font-bold shadow-sm transition-all disabled:opacity-50 active:scale-95 cursor-pointer whitespace-nowrap min-w-0"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin shrink-0" />
                    <span className="truncate">جاري الحفظ...</span>
                  </>
                ) : (
                  <span className="truncate">حفظ في لوحة</span>
                )}
              </button>

              <AnimatePresence>
                {isSaveDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsSaveDropdownOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 max-h-60 overflow-y-auto bg-white border border-natural-border rounded-xl shadow-xl z-20 py-1"
                    >
                      <div className="px-2 py-1 text-[10px] font-bold text-natural-muted text-center border-b border-natural-border/60 bg-neutral-50">
                        اختر لوحة لحفظ النص
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => handleSaveToBoard(null)}
                        className="w-full text-right px-3 py-2 text-xs font-bold text-[#c26700] hover:bg-[#fffaf5] transition-colors border-b border-neutral-100"
                      >
                        الرئيسية (العامة)
                      </button>

                      {boards.map((board) => (
                        <button
                          key={board.id}
                          type="button"
                          onClick={() => handleSaveToBoard(board.id)}
                          className="w-full text-right px-3 py-2 text-xs font-bold text-natural-text hover:bg-neutral-50 transition-colors truncate"
                          title={board.name}
                        >
                          {board.name}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* نسخ الترجمة */}
            <button
              type="button"
              onClick={() => copyText(translatedText, 'النص المترجم')}
              disabled={!translatedText.trim()}
              className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg bg-white border border-natural-border hover:bg-neutral-50 text-natural-text text-xs sm:text-sm font-bold shadow-sm transition-all disabled:opacity-50 active:scale-95 cursor-pointer whitespace-nowrap min-w-0"
            >
              <Copy size={14} className="text-natural-muted shrink-0" />
              <span className="truncate">نسخ الترجمة</span>
            </button>

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}

