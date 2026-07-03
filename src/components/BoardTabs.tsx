import React from 'react';
import { Board } from '../types';
import { getLocalUserPostsIndexedDB } from '../lib/indexedDbService';

interface BoardTabsProps {
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (boardId: string | null) => void;
  postCounts: Record<string, number>;
  lastDynamicBoardId?: string | null;
  isDarkMode?: boolean;
}

export default function BoardTabs({ boards, activeBoardId, onSelectBoard, postCounts, lastDynamicBoardId, isDarkMode }: BoardTabsProps) {
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

  const dynamicBoard = lastDynamicBoardId ? boards.find(b => b.id === lastDynamicBoardId) : null;
  
  // Responsive text sizes depending on whether we have 3 or 4 tabs
  const buttonTextClass = dynamicBoard
    ? `text-[13.5px] sm:text-[14px] md:text-[15px] px-1.5 py-1.5 sm:py-2 ${isDarkMode ? 'font-normal' : 'font-normal'}`
    : `text-[14.5px] sm:text-[15.5px] md:text-[16.5px] px-1.5 py-1.5 sm:py-2 ${isDarkMode ? 'font-normal' : 'font-normal'}`;

  return (
    <div className="w-full max-w-xl mx-auto py-0.5 select-none px-1.5 font-sans" dir="rtl">
      <div className={`grid ${dynamicBoard ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5 w-full`}>
        {/* 1. صانع البرومبت */}
        <button
          onClick={() => handleTabClick('prompt-builder')}
          className={`relative flex items-center justify-center rounded-full transition-all shadow-xs cursor-pointer ${buttonTextClass} ${
            activeBoardId === 'prompt-builder'
              ? isDarkMode
                ? 'bg-[#fdf2e3] text-[#ca3500] scale-[1.03] border border-[#dbb47f]'
                : 'bg-orange-50 text-orange-700 border border-orange-300/80 scale-[1.03] shadow-xs'
              : isDarkMode
                ? 'bg-[#1A212E] text-[#16af75] border border-[#2C374E] hover:bg-[#212B3B]'
                : 'bg-white text-natural-text hover:bg-natural-secondary-bg border border-[#B5B8AB]'
          }`}
        >
          <span className="text-center break-words leading-tight">صانع البرومبت</span>
        </button>

        {/* 2. لوحة شخصية */}
        <button
          onClick={() => handleTabClick('user-board')}
          className={`relative flex items-center justify-center rounded-full transition-all shadow-xs cursor-pointer ${buttonTextClass} ${
            activeBoardId === 'user-board'
              ? isDarkMode
                ? 'bg-[#fdf2e3] text-[#ca3500] scale-[1.03] border border-[#dbb47f]'
                : 'bg-orange-50 text-orange-700 border border-orange-300/80 scale-[1.03] shadow-xs'
              : isDarkMode
                ? 'bg-[#1A212E] text-[#16af75] border border-[#2C374E] hover:bg-[#212B3B]'
                : 'bg-white text-natural-text hover:bg-natural-secondary-bg border border-[#B5B8AB]'
          }`}
        >
          <span className="text-center break-words leading-tight">لوحة شخصية</span>
          {localCount > 0 && (
            <span className="absolute -top-1 -left-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-500 text-[9px] sm:text-[10px] font-bold text-white shadow-xs">
              {localCount}
            </span>
          )}
        </button>

        {/* 3. الرئيسية */}
        <button
          onClick={() => handleTabClick(null)}
          className={`relative flex items-center justify-center rounded-full transition-all shadow-xs cursor-pointer ${buttonTextClass} ${
            activeBoardId === null
              ? isDarkMode
                ? 'bg-[#fdf2e3] text-[#ca3500] scale-[1.03] border border-[#dbb47f]'
                : 'bg-orange-50 text-orange-700 border border-orange-300/80 scale-[1.03] shadow-xs'
              : isDarkMode
                ? 'bg-[#1A212E] text-[#16af75] border border-[#2C374E] hover:bg-[#212B3B]'
                : 'bg-white text-natural-text hover:bg-natural-secondary-bg border border-[#B5B8AB]'
          }`}
        >
          <span className="text-center break-words leading-tight">الرئيسية</span>
          {postCounts['null'] > 0 && (
            <span className="absolute -top-1 -left-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-500 text-[9px] sm:text-[10px] font-bold text-white shadow-xs">
              {postCounts['null']}
            </span>
          )}
        </button>

        {/* 4. التبويب الديناميكي (النشط حالياً أو المختار مؤخراً) */}
        {dynamicBoard && (
          <button
            onClick={() => handleTabClick(dynamicBoard.id)}
            className={`relative flex items-center justify-center rounded-full transition-all shadow-xs cursor-pointer ${buttonTextClass} ${
              activeBoardId === dynamicBoard.id
                ? isDarkMode
                  ? 'bg-[#fdf2e3] text-[#ca3500] scale-[1.03] border border-[#dbb47f]'
                  : 'bg-orange-50 text-orange-700 border border-orange-300/80 scale-[1.03] shadow-xs'
                : isDarkMode
                  ? 'bg-[#1A212E] text-[#16af75] border border-[#2C374E] hover:bg-[#212B3B]'
                  : 'bg-white text-natural-text hover:bg-natural-secondary-bg border border-[#B5B8AB]'
            }`}
          >
            <span className="text-center break-words leading-tight">{dynamicBoard.name}</span>
            {postCounts[dynamicBoard.id] > 0 && (
              <span className="absolute -top-1 -left-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-500 text-[9px] sm:text-[10px] font-bold text-white shadow-xs">
                {postCounts[dynamicBoard.id]}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
