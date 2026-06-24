import React, { useRef } from 'react';
import { Board } from '../types';

interface BoardTabsProps {
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (boardId: string | null) => void;
  postCounts: Record<string, number>;
}

export default function BoardTabs({ boards, activeBoardId, onSelectBoard, postCounts }: BoardTabsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const hasMoved = useRef(false);

  // Inertia / momentum tracking
  const velocity = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const animationFrameId = useRef<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollContainerRef.current) return;
    
    // Stop any ongoing momentum animation immediately
    if (animationFrameId.current !== null) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }

    isDown.current = true;
    hasMoved.current = false;

    // Temporarily turn off smooth layout scroll so dragging mirrors mouse instantly
    scrollContainerRef.current.classList.remove('scroll-smooth');

    startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeft.current = scrollContainerRef.current.scrollLeft;

    lastX.current = e.pageX;
    lastTime.current = Date.now();
    velocity.current = 0;

    scrollContainerRef.current.style.cursor = 'grabbing';
    scrollContainerRef.current.style.userSelect = 'none';
  };

  const handleMouseLeave = () => {
    handleMouseUpOrLeave();
  };

  const handleMouseUp = () => {
    handleMouseUpOrLeave();
  };

  const handleMouseUpOrLeave = () => {
    if (!isDown.current) return;
    isDown.current = false;
    
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = 'grab';
      scrollContainerRef.current.style.removeProperty('user-select');
      scrollContainerRef.current.classList.add('scroll-smooth');
    }

    // Apply inertia/momentum if there is real speed after let-go
    if (hasMoved.current && Math.abs(velocity.current) > 0.1 && scrollContainerRef.current) {
      let speed = velocity.current * 16; // multiplier for sliding strength
      
      const momentumScroll = () => {
        if (!scrollContainerRef.current) return;
        
        scrollContainerRef.current.classList.remove('scroll-smooth');
        scrollContainerRef.current.scrollLeft -= speed;
        speed *= 0.93; // decay factor (friction)

        if (Math.abs(speed) > 0.15) {
          animationFrameId.current = requestAnimationFrame(momentumScroll);
        } else {
          scrollContainerRef.current.classList.add('scroll-smooth');
          animationFrameId.current = null;
        }
      };

      animationFrameId.current = requestAnimationFrame(momentumScroll);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDown.current || !scrollContainerRef.current) return;
    e.preventDefault();
    
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Walk multiplier
    
    if (Math.abs(walk) > 5) {
      hasMoved.current = true;
    }
    
    scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;

    // Direct tracking of instantaneous velocity
    const now = Date.now();
    const elapsed = now - lastTime.current;
    if (elapsed > 0) {
      const deltaX = e.pageX - lastX.current;
      velocity.current = deltaX / elapsed;
      lastX.current = e.pageX;
      lastTime.current = now;
    }
  };

  const handleTabClick = (e: React.MouseEvent, boardId: string | null | 'prompt-builder') => {
    if (hasMoved.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onSelectBoard(boardId);
  };

  const sortedBoards = [...boards].sort((a, b) => a.order - b.order);

  return (
    <div className="relative group/tabs mb-1 select-none">
      <div className="flex items-center w-full">
        <div
          ref={scrollContainerRef}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          className="flex-1 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1.5 cursor-grab active:cursor-grabbing select-none"
          dir="rtl"
        >
          <button
            onClick={(e) => handleTabClick(e, 'prompt-builder')}
            className={`relative whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-all shadow-sm cursor-pointer ${
              activeBoardId === 'prompt-builder'
                ? 'bg-natural-primary text-white scale-105 shadow-md'
                : 'bg-white text-natural-text hover:bg-natural-secondary-bg'
            }`}
          >
            صانع البرومبت
          </button>

          <button
            onClick={(e) => handleTabClick(e, null)}
            className={`relative whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-all shadow-sm cursor-pointer ${
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

          {sortedBoards.map((board) => (
            <button
              key={board.id}
              onClick={(e) => handleTabClick(e, board.id)}
              className={`relative whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-all shadow-sm cursor-pointer ${
                activeBoardId === board.id
                  ? 'bg-natural-primary text-white scale-105 shadow-md'
                  : 'bg-white text-natural-text hover:bg-natural-secondary-bg'
              }`}
            >
              <span className="flex items-center gap-1">
                {board.locked && <span className="text-xs shrink-0 select-none">🔒</span>}
                <span>{board.name}</span>
              </span>
              {postCounts[board.id] > 0 && (
                <span className="absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white border-2 border-white shadow-sm transition-transform active:scale-110">
                  {postCounts[board.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
