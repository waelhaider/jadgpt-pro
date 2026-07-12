import React, { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  // Show button when page is scrolled down
  const toggleVisibility = () => {
    if (window.pageYOffset > 300) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const openBoards = () => {
    window.dispatchEvent(new Event('open_boards_drawer'));
  };

  useEffect(() => {
    window.addEventListener('scroll', toggleVisibility);
    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, []);

  useEffect(() => {
    const checkPopup = () => {
      const hasHiddenBody = document.body.style.overflow === 'hidden';
      setIsPopupOpen(hasHiddenBody);
    };

    const observer = new MutationObserver(() => {
      checkPopup();
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    checkPopup();

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <AnimatePresence>
      {isVisible && !isPopupOpen && (
        <>
          {/* Back to top button - now on the Left side */}
          <motion.button
            key="scroll-to-top-btn"
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            onClick={scrollToTop}
            className="fixed bottom-6 left-6 p-3 bg-[#5A5A40]/30 text-white rounded-full shadow-lg hover:shadow-xl hover:bg-[#5A5A40]/80 backdrop-blur-md transition-all z-50 flex items-center justify-center group cursor-pointer"
            title="العودة للأعلى"
          >
            <ChevronUp size={24} className="group-hover:-translate-y-0.5 transition-transform" />
          </motion.button>

          {/* Boards floating button - now on the Right side */}
          <motion.button
            key="floating-boards-btn"
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            onClick={openBoards}
            className="fixed bottom-6 right-6 px-4 py-2.5 bg-[#5A5A40]/30 text-white font-black rounded-full shadow-lg hover:shadow-xl hover:bg-[#5A5A40]/80 backdrop-blur-md transition-all z-50 flex items-center justify-center gap-1.5 cursor-pointer text-xs"
            title="اللوحات الكاملة"
            dir="rtl"
          >
            <span>اللوحات</span>
          </motion.button>
        </>
      )}
    </AnimatePresence>
  );
}
