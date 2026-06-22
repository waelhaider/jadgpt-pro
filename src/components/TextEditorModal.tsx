import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeftRight, Copy, Loader2 } from 'lucide-react';

interface TextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  activeBoardId: string | null;
}

export default function TextEditorModal({ isOpen, onClose }: TextEditorModalProps) {
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [srcLang, setSrcLang] = useState('auto');
  const [tgtLang, setTgtLang] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);

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
      alert('النص فارغ!');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      alert(`تم نسخ ${label} بنجاح! 📋`);
    } catch (err) {
      console.error('Failed to copy text:', err);
      alert('فشل نسخ النص.');
    }
  };

  if (!isOpen) return null;

  const isOriginalRtl = isRtl(originalText);
  const isTranslatedRtl = isRtl(translatedText);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
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
          className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-natural-border overflow-hidden flex flex-col max-h-[90vh]"
          dir="rtl"
        >
          {/* Header Area */}
          <div className="px-4 py-2 bg-natural-bg/50 border-b border-natural-border flex items-center justify-between gap-2">
            
            {/* Right Side: Original Text Label & Language Selector */}
            <div className="flex-1 text-right flex flex-col items-start justify-center">
              <span className="text-xs font-black text-[#4A4A35]">النص الأصلي</span>
              <select
                value={srcLang}
                onChange={(e) => setSrcLang(e.target.value)}
                className="mt-1 text-[11px] rounded-md border border-natural-border px-2 py-1 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary cursor-pointer w-full max-w-[140px]"
              >
                <option value="auto">تحديد تلقائي (Auto)</option>
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

            {/* Middle Side: Close button (X) and Swap button between Original text and translation */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSwap}
                title="تبديل النصوص واللغات"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-natural-primary/5 text-natural-primary hover:bg-natural-primary hover:text-white transition-all shadow-sm border border-natural-primary/10"
              >
                <ArrowLeftRight size={14} />
              </button>

              <button
                type="button"
                onClick={onClose}
                title="إغلاق النافذة"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-all shadow-sm border border-red-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* Left Side: Translation Label & Language Selector */}
            <div className="flex-1 text-left flex flex-col items-end justify-center">
              <span className="text-xs font-black text-[#4A4A35] block w-full max-w-[140px] text-right">الترجمة</span>
              <select
                value={tgtLang}
                onChange={(e) => setTgtLang(e.target.value)}
                className="mt-1 text-[11px] rounded-md border border-natural-border px-2 py-1 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary cursor-pointer w-full max-w-[140px] text-right"
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

          {/* Text Areas Section (Strictly grid-cols-2 side-by-side for parallel comparison) */}
          <div className="flex-1 p-3 grid grid-cols-2 gap-3 overflow-y-auto">
            
            {/* Right Column: Original Input Area */}
            <div className="flex flex-col h-full min-h-[320px] md:min-h-[420px]">
              <textarea
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                placeholder="لصق أو كتابة النص الأصلي هنا..."
                dir={isOriginalRtl ? 'rtl' : 'ltr'}
                className={`w-full flex-1 p-3 rounded-lg border border-natural-border focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm md:text-base font-medium leading-relaxed bg-neutral-50/50 resize-none ${
                  isOriginalRtl ? 'text-right' : 'text-left'
                }`}
                maxLength={20000}
              />
            </div>

            {/* Left Column: Translation View Area */}
            <div className="flex flex-col h-full min-h-[320px] md:min-h-[420px]">
              <div className="relative w-full flex-1 flex flex-col">
                <textarea
                  readOnly
                  value={translatedText}
                  placeholder="الترجمة اللحظية ستظهر هنا..."
                  dir={isTranslatedRtl ? 'rtl' : 'ltr'}
                  className={`w-full flex-1 p-3 rounded-lg border border-natural-border bg-neutral-100/50 text-sm md:text-base font-medium leading-relaxed resize-none focus:outline-none ${
                    isTranslatedRtl ? 'text-right' : 'text-left'
                  }`}
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

          {/* Footer Action Buttons Section in a single row - Only copy buttons remain */}
          <div className="px-4 py-2 bg-natural-bg border-t border-natural-border flex flex-row items-center justify-center gap-2.5">
            
            {/* نسخ الأصلي */}
            <button
              type="button"
              onClick={() => copyText(originalText, 'النص الأصلي')}
              disabled={!originalText.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white border border-natural-border hover:bg-neutral-50 text-natural-text text-xs font-bold px-3 py-1.5 shadow-sm transition-all disabled:opacity-50 active:scale-95 cursor-pointer shrink-0"
            >
              <Copy size={13} className="text-natural-muted" />
              نسخ الأصلي
            </button>

            {/* نسخ الترجمة */}
            <button
              type="button"
              onClick={() => copyText(translatedText, 'النص المترجم')}
              disabled={!translatedText.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white border border-natural-border hover:bg-neutral-50 text-natural-text text-xs font-bold px-3 py-1.5 shadow-sm transition-all disabled:opacity-50 active:scale-95 cursor-pointer shrink-0"
            >
              <Copy size={13} className="text-natural-muted" />
              نسخ الترجمة
            </button>

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}

