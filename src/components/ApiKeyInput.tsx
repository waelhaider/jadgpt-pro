import React, { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, CheckCircle } from 'lucide-react';

interface Props {
  onKeyUpdate: (hasKey: boolean) => void;
}

export const ApiKeyInput: React.FC<Props> = ({ onKeyUpdate }) => {
  const [key, setKey] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("GEMINI_API_KEY");
    if (stored) {
      setKey(stored);
      onKeyUpdate(true);
      setIsSaved(true);
    } else {
      onKeyUpdate(false);
      setIsSaved(false);
    }
  }, [onKeyUpdate]);

  const handleSave = () => {
    if (key.trim()) {
      localStorage.setItem("GEMINI_API_KEY", key.trim());
      onKeyUpdate(true);
      setIsSaved(true);
      alert("تم حفظ مفتاح API بنجاح! يمكنك الآن تجربة توليد الصور الفنية الأربعة بالتوازي.");
    } else {
      localStorage.removeItem("GEMINI_API_KEY");
      onKeyUpdate(false);
      setIsSaved(false);
      alert("تمت إزالة المفتاح.");
    }
  };

  return (
    <div className="bg-[#111827] border border-gray-800 p-5 rounded-2xl mb-6 shadow-xl text-right" dir="rtl">
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
        <div className="flex-grow">
          <div className="flex items-center gap-2 mb-2">
            <Key className="text-amber-500 w-4 h-4" />
            <label className="block text-xs font-black text-gray-300 uppercase tracking-wider">
              مفتاح API الخاص بك لـ Gemini (AI Studio Key)
            </label>
            {isSaved && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-green-500/20 text-green-400 font-bold px-2 py-0.5 rounded-full">
                <CheckCircle size={10} /> نشط وجاهز
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type={isVisible ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="ألصق مفتاح Gemini هنا (AI Studio Key)..."
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-left placeholder:text-right placeholder:text-gray-600 text-sm"
            />
            <button
              onClick={() => setIsVisible(!isVisible)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1.5 transition-colors"
            >
              {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleSave}
            className="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-amber-900/20 active:scale-95 text-sm"
          >
            حفظ المفتاح
          </button>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-gray-500 leading-relaxed">
        ※ يتم حفظ هذا المفتاح محلياً بشكل آمن تماماً داخل متصفحك الخاص (localStorage) ويُستخدم في إرسال طلبات التوليد لشرائح Gemini مباشرة من جهازك دون مشاركته مع أي خادم خارجي.
      </p>
    </div>
  );
};
