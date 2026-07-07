import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check } from 'lucide-react';

export interface ToastEventDetail {
  message: string;
  duration?: number;
}

export function showToast(message: string, duration = 2500) {
  const event = new CustomEvent<ToastEventDetail>('show-toast', {
    detail: { message, duration }
  });
  window.dispatchEvent(event);
}

export default function ToastContainer() {
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastEventDetail>;
      const { message, duration = 2500 } = customEvent.detail;
      const id = Date.now();
      
      setToast({ message, id });

      const timer = setTimeout(() => {
        setToast((prev) => (prev?.id === id ? null : prev));
      }, duration);

      return () => clearTimeout(timer);
    };

    window.addEventListener('show-toast', handleToast);
    return () => {
      window.removeEventListener('show-toast', handleToast);
    };
  }, []);

  return (
    <AnimatePresence>
      {toast && (
        <div className="fixed inset-x-0 bottom-8 pointer-events-none z-[9999] flex items-end justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="pointer-events-auto flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl border border-emerald-500 max-w-sm text-center"
            dir="rtl"
          >
            <Check size={18} className="shrink-0 text-white" />
            <span className="text-xs font-bold leading-relaxed">{toast.message}</span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
