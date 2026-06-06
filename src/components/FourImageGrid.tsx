import React, { useState } from 'react';
import { GeneratedImage } from '../types';
import { EditModal } from './EditModal';
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

interface Props {
  images: Record<string, GeneratedImage>;
  onUpdateImage: (id: string, newUrl: string) => void;
  onRegenerateImage?: (id: string) => void;
}

export const FourImageGrid: React.FC<Props> = ({ images, onUpdateImage, onRegenerateImage }) => {
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const list = Object.values(images) as GeneratedImage[];

  const handleDownload = (url: string, title: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (list.length === 0) return null;

  // Gather completed images for lightbox previewing
  const completedImages = list.filter(img => img.status === 'completed' && img.imageUrl);
  const slides = completedImages.map(img => ({ src: img.imageUrl! }));

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <h3 className="text-xl font-bold text-white border-r-4 border-amber-500 pr-3">المشاهد الفنية الناتجة</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {list.map((img) => (
          <div key={img.id} className="bg-gray-900 border border-gray-850 rounded-xl overflow-hidden shadow-lg flex flex-col">
            
            {/* عنوان نوع اللقطة */}
            <div className="p-3 bg-gray-950 border-b border-gray-800 text-gray-300 text-sm font-semibold flex justify-between items-center">
              <span>{img.title}</span>
              <span className={`w-2.5 h-2.5 rounded-full ${img.status === 'completed' ? 'bg-green-500 animate-pulse' : img.status === 'loading' ? 'bg-amber-500 animate-ping' : 'bg-gray-700'}`}></span>
            </div>

            {/* الصورة أو حالة التحميل */}
            <div className="aspect-video w-full bg-gray-950 flex items-center justify-center relative overflow-hidden group">
              {img.status === 'loading' ? (
                <div className="flex flex-col items-center gap-3 p-4 text-center">
                  <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs text-amber-500 animate-pulse">جاري رسم اللقطة بالذكاء الاصطناعي...</p>
                </div>
              ) : img.status === 'failed' ? (
                <div className="p-4 text-center text-red-400 space-y-3 flex flex-col items-center justify-center h-full w-full">
                  <span className="text-2xl animate-bounce">⚠️</span>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-red-300">لم تنجح معالجة هذه اللقطة</p>
                    <p className="text-[10px] text-red-400/80 max-w-[200px] line-clamp-2">{img.error || "فشل التوليد"}</p>
                  </div>
                  {onRegenerateImage && (
                    <button
                      onClick={() => onRegenerateImage(img.id)}
                      className="px-4 py-1.5 text-[11px] font-bold rounded-lg bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      🔄 إعادة التوليد
                    </button>
                  )}
                </div>
              ) : img.imageUrl ? (
                <div 
                  className="w-full h-full relative overflow-hidden cursor-pointer"
                  onClick={() => {
                    const idx = completedImages.findIndex(c => c.id === img.id);
                    if (idx !== -1) {
                      setLightboxIndex(idx);
                      setLightboxOpen(true);
                    }
                  }}
                >
                  <img src={img.imageUrl} alt={img.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                     <span className="bg-black/70 px-4 py-1.5 rounded-full text-xs text-gray-200">🔍 اضغط للتكبير واستعراض التفاصيل</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 p-4 text-center">
                  <span className="text-xl animate-pulse">⏳</span>
                  <p className="text-xs text-gray-500 animate-pulse font-medium">قيد الانتظار في صف الجدولة التلقائية...</p>
                  <p className="text-[10px] text-gray-600">سيتم البدء فور اكتمال اللقطة السابقة لضمان أعلى جودة ودقة.</p>
                </div>
              )}
            </div>

            {/* أزرار التحكم بالتنزيل والتعديل السحري */}
            {img.status === 'completed' && img.imageUrl && (
              <div className="p-3 bg-gray-950 border-t border-gray-850 flex gap-2">
                <button
                  onClick={() => handleDownload(img.imageUrl!, img.title)}
                  className="flex-1 py-2 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  📥 تنزيل الصورة
                </button>
                <button
                  onClick={() => setActiveEditId(img.id)}
                  className="flex-1 py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  ✨ تعديل اللقطة
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* نافذة التعديل الفني النشطة */}
      {activeEditId && images[activeEditId]?.imageUrl && (
        <EditModal
          imageUrl={images[activeEditId].imageUrl!}
          onClose={() => setActiveEditId(null)}
          onUpdateImage={(newUrl) => onUpdateImage(activeEditId, newUrl)}
        />
      )}

      {/* Lightbox Preview */}
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
    </div>
  );
};
