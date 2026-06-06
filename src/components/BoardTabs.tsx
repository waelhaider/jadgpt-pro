import React, { useRef } from 'react';
import { Board } from '../types';
import { motion } from 'motion/react';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface BoardTabsProps {
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (boardId: string | null) => void;
  postCounts: Record<string, number>;
}

export default function BoardTabs({ boards, activeBoardId, onSelectBoard, postCounts }: BoardTabsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const sortedBoards = [...boards].sort((a, b) => a.order - b.order);

  return (
    <div className="relative group/tabs mb-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => scroll('right')}
          className="p-1 rounded-full hover:bg-white shadow-md bg-white/80 text-natural-primary z-10 transition-all active:scale-95"
        >
          <ChevronRight size={18} />
        </button>

        <div
          ref={scrollContainerRef}
          className="flex-1 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1.5"
          dir="rtl"
        >
          <button
            onClick={() => onSelectBoard(null)}
            className={`relative whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-all shadow-sm ${
              activeBoardId === null
                ? 'bg-natural-primary text-white scale-105 shadow-md'
                : 'bg-white text-natural-text hover:bg-natural-secondary-bg'
            }`}
          >
            الرئيسية
            {postCounts['null'] > 0 && (
              <span className="absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white border-2 border-white shadow-sm transition-transform active:scale-110">
                {postCounts['null']}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectBoard('try-prompt')}
            className={`relative whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-all shadow-sm ${
              activeBoardId === 'try-prompt'
                ? 'bg-amber-600 text-white scale-105 shadow-md'
                : 'bg-amber-500/10 text-amber-800 hover:bg-amber-500/20'
            }`}
          >
            🧪 تجرية البرومبت
          </button>


          {sortedBoards.map((board) => (
            <button
              key={board.id}
              onClick={() => onSelectBoard(board.id)}
              className={`relative whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-all shadow-sm ${
                activeBoardId === board.id
                  ? 'bg-natural-primary text-white scale-105 shadow-md'
                  : 'bg-white text-natural-text hover:bg-natural-secondary-bg'
              }`}
            >
              {board.name}
              {postCounts[board.id] > 0 && (
                <span className="absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white border-2 border-white shadow-sm transition-transform active:scale-110">
                  {postCounts[board.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => scroll('left')}
          className="p-1.5 rounded-full hover:bg-white shadow-md bg-white/80 text-natural-primary z-10 transition-all active:scale-95"
        >
          <ChevronLeft size={20} />
        </button>
      </div>
    </div>
  );
}
