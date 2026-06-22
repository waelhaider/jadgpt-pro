import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Edit2, Move } from 'lucide-react';
import { Board } from '../types';

interface BoardModalsProps {
  isOpen: boolean;
  type: 'create' | 'edit' | 'reorder';
  board?: Board;
  boards?: Board[];
  onClose: () => void;
  onSubmit: (data: any) => void;
}

export default function BoardModals({ isOpen, type, board, boards, onClose, onSubmit }: BoardModalsProps) {
  const [name, setName] = useState('');
  const [orderedBoards, setOrderedBoards] = useState<Board[]>([]);

  useEffect(() => {
    if (isOpen) {
      setName(board?.name || '');
      setOrderedBoards(boards || []);
    }
  }, [isOpen, board, boards]);

  const handleReorder = (draggedId: string, overId: string) => {
    const items = [...orderedBoards];
    const fromIndex = items.findIndex(i => i.id === draggedId);
    const toIndex = items.findIndex(i => i.id === overId);
    const [removed] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, removed);
    setOrderedBoards(items);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
          dir="rtl"
        >
          <div className="flex items-center justify-between border-b border-natural-border px-6 py-4">
            <h3 className="text-lg font-bold text-natural-text">
              {type === 'create' && 'إنشاء لوحة جديدة'}
              {type === 'edit' && 'تعديل اسم اللوحة'}
              {type === 'reorder' && 'ترتيب اللوحات'}
            </h3>
            <button onClick={onClose} className="text-natural-muted hover:text-natural-text">
              <X size={20} />
            </button>
          </div>

          <div className="p-6">
            {(type === 'create' || type === 'edit') && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-natural-text mb-2">اسم اللوحة</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-natural-border bg-natural-secondary-bg p-3 text-right focus:border-natural-primary focus:outline-none"
                    placeholder="مثال: استوديو، أطفال..."
                  />
                </div>
                <button
                  onClick={() => onSubmit({ name })}
                  className="w-full rounded-xl bg-natural-primary py-3 font-bold text-white shadow-sm transition-all hover:bg-[#4A4A35] active:scale-95"
                >
                  {type === 'create' ? 'إنشاء' : 'حفظ التعديلات'}
                </button>
              </div>
            )}

            {type === 'reorder' && (
              <div className="space-y-4">
                <p className="text-xs text-natural-muted mb-4">يمكنك تغيير ترتيب اللوحات كما يظهر في الواجهة الرئيسية.</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {orderedBoards.map((b, idx) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-xl border border-natural-border p-3 bg-natural-secondary-bg"
                    >
                      <div className="flex items-center gap-3">
                        <Move size={16} className="text-natural-muted" />
                        <span className="font-bold text-sm">{b.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          disabled={idx === 0}
                          onClick={() => handleReorder(b.id, orderedBoards[idx - 1].id)}
                          className="px-2 py-1 bg-white rounded border border-natural-border text-xs disabled:opacity-30"
                        >
                          أعلى
                        </button>
                        <button
                          disabled={idx === orderedBoards.length - 1}
                          onClick={() => handleReorder(b.id, orderedBoards[idx + 1].id)}
                          className="px-2 py-1 bg-white rounded border border-natural-border text-xs disabled:opacity-30"
                        >
                          أسفل
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => onSubmit(orderedBoards.map((b, i) => ({ id: b.id, order: i })))}
                  className="w-full rounded-xl bg-natural-primary py-3 font-bold text-white shadow-sm transition-all hover:bg-[#4A4A35] active:scale-95 mt-4"
                >
                  حفظ الترتيب
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
