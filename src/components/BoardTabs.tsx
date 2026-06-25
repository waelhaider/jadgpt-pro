import React from 'react';
import { Board } from '../types';
import { getLocalUserPostsIndexedDB } from '../lib/indexedDbService';

interface BoardTabsProps {
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (boardId: string | null) => void;
  postCounts: Record<string, number>;
}

export default function BoardTabs({ boards, activeBoardId, onSelectBoard, postCounts }: BoardTabsProps) {
  const [localCount, setLocalCount] = React.useState(0);
  React.useEffect(() => {
    const updateLocalCount = async () => {
      try {
        const parsed = await getLocalUserPostsIndexedDB();
        setLocalCount(parsed.length);
      } catch (err) {
        setLocalCount(0);
      }
    };
    updateLocalCount();
    window.addEventListener('reload_local_posts', updateLocalCount);
    return () => {
      window.removeEventListener('reload_local_posts', updateLocalCount);
    };
  }, []);

  const handleTabClick = (boardId: string | null | 'prompt-builder') => {
    onSelectBoard(boardId);
  };

  return (
    <div className="w-full max-w-xl mx-auto py-1.5 select-none px-2" dir="rtl">
      <div className="grid grid-cols-3 gap-2 w-full">
        {/* 1. صانع البرومبت */}
        <button
          onClick={() => handleTabClick('prompt-builder')}
          className={`relative flex items-center justify-center rounded-full px-1 py-1 text-[12px] sm:text-[13px] md:text-[14px] font-normal transition-all shadow-xs cursor-pointer ${
            activeBoardId === 'prompt-builder'
              ? 'bg-natural-primary text-white scale-[1.03] shadow-sm'
              : 'bg-white text-natural-text hover:bg-natural-secondary-bg border border-natural-border/30'
          }`}
        >
          صانع البرومبت
        </button>

        {/* 2. لوحة المستخدم */}
        <button
          onClick={() => handleTabClick('user-board')}
          className={`relative flex items-center justify-center rounded-full px-1 py-1 text-[12px] sm:text-[13px] md:text-[14px] font-normal transition-all shadow-xs cursor-pointer ${
            activeBoardId === 'user-board'
              ? 'bg-natural-primary text-white scale-[1.03] shadow-sm'
              : 'bg-white text-natural-text hover:bg-natural-secondary-bg border border-natural-border/30'
          }`}
        >
          <span>لوحة المستخدم</span>
          {localCount > 0 && (
            <span className="absolute -top-1 -left-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-500 text-[9px] sm:text-[10px] font-normal text-white border border-white shadow-xs">
              {localCount}
            </span>
          )}
        </button>

        {/* 3. الرئيسية */}
        <button
          onClick={() => handleTabClick(null)}
          className={`relative flex items-center justify-center rounded-full px-1 py-1 text-[13px] sm:text-[13px] md:text-[14px] font-normal transition-all shadow-xs cursor-pointer ${
            activeBoardId === null
              ? 'bg-natural-primary text-white scale-[1.03] shadow-sm'
              : 'bg-white text-natural-text hover:bg-natural-secondary-bg border border-natural-border/30'
          }`}
        >
          <span>الرئيسية</span>
          {postCounts['null'] > 0 && (
            <span className="absolute -top-1 -left-1 flex h-5 w-5 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-500 text-[9px] sm:text-[10px] font-normal text-white border border-white shadow-xs">
              {postCounts['null']}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
