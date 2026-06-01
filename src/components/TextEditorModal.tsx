import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw, Copy, Check, Save, Loader2 } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface TextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  activeBoardId: string | null;
}

export default function TextEditorModal({ isOpen, onClose, isAdmin, activeBoardId }: TextEditorModalProps) {
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [srcLang, setSrcLang] = useState('auto');
  const [tgtLang, setTgtLang] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSavingOriginal, setIsSavingOriginal] = useState(false);
  const [isSavingTranslated, setIsSavingTranslated] = useState(false);

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

    // Swap languages if source is not auto
    if (srcLang !== 'auto') {
      const tempLang = srcLang;
      setSrcLang(tgtLang);
      setTgtLang(tempLang);
    } else {
      // If auto, set source to Arabic and target to English or vice versa depending on target
      setSrcLang(tgtLang);
      setTgtLang('ar');
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

  const savePost = async (textToSave: string, label: string, isOriginal: boolean) => {
    if (!textToSave.trim()) {
      alert('النص الذي تريد حفظه فارغ!');
      return;
    }

    if (!auth.currentUser) {
      alert('عذراً، يرجى تسجيل الدخول أولاً لتتمكن من النشر.');
      return;
    }

    if (!isAdmin) {
      alert('عذراً، ميزة نشر المنشورات مضافة للمسؤول (الآدمين) فقط لتفادي كتابة محتوى عشوائي، يمكنك نسخ النص واستخدامه.');
      return;
    }

    const setSaving = isOriginal ? setIsSavingOriginal : setIsSavingTranslated;
    setSaving(true);

    try {
      const payload = {
        text: textToSave.trim(),
        imageUrl: null,
        imageUrls: [],
        boardId: activeBoardId || null,
        authorId: auth.currentUser.uid,
        authorEmail: auth.currentUser.email,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'posts'), payload);
      alert(`تم بنجاح حفظ ${label} كمنشور جديد في اللوحة الحالية! 🎉`);
    } catch (error) {
      console.error('Failed to save translated post:', error);
      alert('حدث خطأ أثناء الحفظ. يرجى مراجعة الصلاحيات.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
          <div className="px-6 py-4 bg-natural-bg/50 border-b border-natural-border flex items-center justify-between gap-4">
            
            {/* Right Side: Original Text Label & Language Selector */}
            <div className="flex-1 text-right flex flex-col items-start justify-center">
              <span className="text-sm font-black text-[#4A4A35]">النص الأصلي</span>
              <select
                value={srcLang}
                onChange={(e) => setSrcLang(e.target.value)}
                className="mt-1.5 text-xs rounded-lg border border-natural-border px-3 py-1.5 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary cursor-pointer w-full max-w-[170px]"
              >
                <option value="auto">تحديد تلقائي (Auto-Detect)</option>
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
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleSwap}
                title="تبديل النصوص واللغات"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-natural-primary/5 text-natural-primary hover:bg-natural-primary hover:text-white transition-all shadow-sm border border-natural-primary/10"
              >
                <RefreshCw size={18} />
              </button>

              <button
                type="button"
                onClick={onClose}
                title="إغلاق النافذة"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-all shadow-sm border border-red-200"
              >
                <X size={20} />
              </button>
            </div>

            {/* Left Side: Translation Label & Language Selector */}
            <div className="flex-1 text-left flex flex-col items-end justify-center">
              <span className="text-sm font-black text-[#4A4A35] block w-full max-w-[170px] text-right">الترجمة</span>
              <select
                value={tgtLang}
                onChange={(e) => setTgtLang(e.target.value)}
                className="mt-1.5 text-xs rounded-lg border border-natural-border px-3 py-1.5 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary cursor-pointer w-full max-w-[170px] text-right"
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
          <div className="flex-1 p-6 grid grid-cols-2 gap-6 overflow-y-auto">
            
            {/* Right Column: Original Input Area */}
            <div className="flex flex-col h-full min-h-[280px] md:min-h-[380px]">
              <textarea
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                placeholder="لصق أو كتابة النص الأصلي هنا..."
                className="w-full flex-1 p-4 rounded-xl border border-natural-border focus:outline-none focus:ring-1 focus:ring-natural-primary text-sm font-medium leading-relaxed bg-neutral-50/50 resize-none text-right"
                maxLength={10000}
              />
              <div className="flex justify-between items-center mt-2 px-1 text-xs text-natural-muted font-medium">
                <span>{originalText.length} حرف</span>
                <span className="text-[10px]">كتابة فورية للترجمة اللحظية</span>
              </div>
            </div>

            {/* Left Column: Translation View Area */}
            <div className="flex flex-col h-full min-h-[280px] md:min-h-[380px]">
              <div className="relative w-full flex-1 flex flex-col">
                <textarea
                  readOnly
                  value={translatedText}
                  placeholder="الترجمة اللحظية ستظهر هنا..."
                  className="w-full flex-1 p-4 rounded-xl border border-natural-border bg-neutral-100/50 text-sm font-medium leading-relaxed resize-none text-right focus:outline-none"
                />

                {/* Loading indicator inside translation field */}
                {isTranslating && (
                  <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
                    <div className="flex items-center gap-2 text-natural-primary bg-white px-4 py-2 rounded-xl shadow-md border border-natural-border">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-xs font-bold">جاري الترجمة فورياً...</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mt-2 px-1 text-xs text-natural-muted font-medium">
                <span>{translatedText.length} حرف</span>
                <span className="text-[10px]">ترجمة غوغل اللحظية</span>
              </div>
            </div>

          </div>

          {/* Footer Action Buttons Section in a single row */}
          {/* Order exactly as required: حفظ الاصلي ، نسخ الاصلي ، نسخ الترجمة ، حفظ الترجمة */}
          <div className="px-6 py-4 bg-natural-bg border-t border-natural-border flex flex-row items-center justify-center gap-3 overflow-x-auto whitespace-nowrap">
            
            {/* حفظ الأصلي */}
            <button
              type="button"
              onClick={() => savePost(originalText, 'النص الأصلي', true)}
              disabled={isSavingOriginal || !originalText.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-natural-primary text-white text-xs font-black tracking-wide px-4 py-2.5 shadow-md hover:bg-[#4A4A35] transition-all disabled:opacity-50 active:scale-95 cursor-pointer shrink-0"
            >
              {isSavingOriginal ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              حفظ الأصلي
            </button>

            {/* نسخ الأصلي */}
            <button
              type="button"
              onClick={() => copyText(originalText, 'النص الأصلي')}
              disabled={!originalText.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-white border border-natural-border hover:bg-neutral-50 text-natural-text text-xs font-black tracking-wide px-4 py-2.5 shadow-sm transition-all disabled:opacity-50 active:scale-95 cursor-pointer shrink-0"
            >
              <Copy size={14} className="text-natural-muted" />
              نسخ الأصلي
            </button>

            {/* نسخ الترجمة */}
            <button
              type="button"
              onClick={() => copyText(translatedText, 'النص المترجم')}
              disabled={!translatedText.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-white border border-natural-border hover:bg-neutral-50 text-natural-text text-xs font-black tracking-wide px-4 py-2.5 shadow-sm transition-all disabled:opacity-50 active:scale-95 cursor-pointer shrink-0"
            >
              <Copy size={14} className="text-natural-muted" />
              نسخ الترجمة
            </button>

            {/* حفظ الترجمة */}
            <button
              type="button"
              onClick={() => savePost(translatedText, 'النص المترجم', false)}
              disabled={isSavingTranslated || !translatedText.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-natural-primary text-white text-xs font-black tracking-wide px-4 py-2.5 shadow-md hover:bg-[#4A4A35] transition-all disabled:opacity-50 active:scale-95 cursor-pointer shrink-0"
            >
              {isSavingTranslated ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              حفظ الترجمة
            </button>

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
