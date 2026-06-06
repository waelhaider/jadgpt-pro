import React, { useState } from 'react';
import { editImageWithPrompt } from '../services/geminiService';
import { Sparkles, X, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  imageUrl: string;
  onClose: () => void;
  onUpdateImage: (newUrl: string) => void;
}

export const EditModal: React.FC<Props> = ({ imageUrl, onClose, onUpdateImage }) => {
  const [editPrompt, setEditPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEdit = async () => {
    if (!editPrompt.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const newImage = await editImageWithPrompt(imageUrl, editPrompt);
      onUpdateImage(newImage);
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to edit image");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 text-white font-sans" dir="rtl">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
          <h3 className="text-base font-black text-amber-500 flex items-center gap-2">
            <Sparkles className="w-5 h-5 animate-pulse" />
            المحرر السحري للذكاء الاصطناعي
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="aspect-video w-full bg-gray-950 rounded-xl overflow-hidden flex items-center justify-center border border-gray-800 relative shadow-inner">
             <img src={imageUrl} alt="الصورة المراد تعديلها" className="max-h-full max-w-full object-contain" />
             {isLoading && (
                 <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 text-center p-6">
                     <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                     <span className="text-amber-500 font-bold animate-pulse text-sm">جاري تعديل اللقطة ودمج التغييرات الفنية...</span>
                 </div>
             )}
          </div>
          
          <div className="text-right">
            <label className="block text-xs font-bold text-gray-400 mb-2">ما هي التعديلات التي تريد تطبيقها؟</label>
            <textarea 
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="مثال: اجعل الصورة باللونين الأبيض والأسود، أضف نظارة شمسية، غيّر الخلفية لتصبح في الغابة..."
              className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3.5 text-white focus:ring-2 focus:ring-amber-500 text-sm focus:outline-none h-24 resize-none placeholder:text-gray-600"
            />
          </div>
          
          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-950/40 border border-red-900/30 p-3 rounded-xl text-xs font-semibold text-right">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        
        <div className="p-4 bg-gray-950 border-t border-gray-800 flex justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-xl text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            إلغاء
          </button>
          <button 
            type="button"
            onClick={handleEdit}
            disabled={isLoading || !editPrompt.trim()}
            className="px-6 py-2.5 text-sm rounded-xl bg-amber-600 font-bold text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 cursor-pointer"
          >
            {isLoading ? 'جاري التعديل...' : 'تطبيق التعديل الفني'}
          </button>
        </div>
      </div>
    </div>
  );
};
