import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { Post, OperationType, Board } from '../types';
import PostCard from './PostCard';
import { Loader2, CameraOff } from 'lucide-react';
import { handleFirestoreError } from '../lib/error-handler';
import { AnimatePresence } from 'motion/react';
import { getLocalUserPostsIndexedDB, saveLocalUserPostsIndexedDB } from '../lib/indexedDbService';

interface FeedProps {
  isAdmin: boolean;
  boardId: string | null;
  boards: Board[];
  onTestPrompt: (text: string) => void;
  isDarkMode?: boolean;
}

const boardScrollPositions: Record<string, number> = {};

export default function Feed({ isAdmin, boardId, boards, onTestPrompt, isDarkMode }: FeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const getPostMillis = (p: Post) => {
    if (!p.createdAt) return p.createdAtMillis || Date.now();
    if (typeof p.createdAt === 'number') return p.createdAt;
    if (typeof p.createdAt.toMillis === 'function') {
      try {
        return p.createdAt.toMillis();
      } catch (e) {}
    }
    if (typeof p.createdAt.toDate === 'function') {
      try {
        return p.createdAt.toDate().getTime();
      } catch (e) {}
    }
    const anyCreated = p.createdAt as any;
    if (anyCreated.seconds !== undefined) {
      return anyCreated.seconds * 1000 + (anyCreated.nanoseconds || 0) / 1000000;
    }
    if (p.createdAt instanceof Date) {
      return p.createdAt.getTime();
    }
    return p.createdAtMillis || Date.now();
  };

  const getSortValue = (p: Post) => {
    if (p.customOrder !== undefined) return p.customOrder;
    return (p.isPinned ? 1e13 : 0) + getPostMillis(p);
  };

  const handleMovePost = async (postId: string, direction: 'up' | 'down') => {
    // Find index of the post in the current posts array
    const idx = posts.findIndex(p => p.id === postId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= posts.length) return; // Out of bounds

    const currentPost = posts[idx];
    const siblingPost = posts[targetIdx];

    let currentVal = getSortValue(currentPost);
    let siblingVal = getSortValue(siblingPost);

    // If they are identical, we offset them slightly
    if (currentVal === siblingVal) {
      if (direction === 'up') {
        siblingVal += 1000;
      } else {
        siblingVal -= 1000;
      }
    }

    // Swap their customOrder values!
    const newCurrentOrder = siblingVal;
    const newSiblingOrder = currentVal;

    // 1. Optimistic UI Update: immediately swap positions in state for absolute zero latency
    const updatedPosts = [...posts];
    updatedPosts[idx] = { ...currentPost, customOrder: newCurrentOrder };
    updatedPosts[targetIdx] = { ...siblingPost, customOrder: newSiblingOrder };
    
    // Sort descending
    updatedPosts.sort((a, b) => {
      const orderA = getSortValue(a);
      const orderB = getSortValue(b);
      return orderB - orderA;
    });
    setPosts(updatedPosts);

    try {
      if (boardId === 'user-board') {
        const parsed = await getLocalUserPostsIndexedDB();
        const updated = parsed.map((p: any) => {
          if (p.id === currentPost.id) {
            return { ...p, customOrder: newCurrentOrder };
          }
          if (p.id === siblingPost.id) {
            return { ...p, customOrder: newSiblingOrder };
          }
          return p;
        });
        await saveLocalUserPostsIndexedDB(updated);
        window.dispatchEvent(new Event('reload_local_posts'));
      } else {
        const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore');
        
        // Update both in Firestore atomically using a writeBatch to prevent intermediate inconsistent renders
        const batch = writeBatch(db);
        batch.update(doc(db, 'posts', currentPost.id), { 
          customOrder: newCurrentOrder,
          updatedAt: serverTimestamp()
        });
        batch.update(doc(db, 'posts', siblingPost.id), { 
          customOrder: newSiblingOrder,
          updatedAt: serverTimestamp()
        });
        await batch.commit();
      }
    } catch (err) {
      console.error('[Feed] Error reordering posts:', err);
      // Revert in case of failure
      setPosts(posts);
    }
  };

  useEffect(() => {
    if (boardId === 'user-board') {
      setLoading(true);
      const loadLocalPosts = async () => {
        try {
          const parsed = await getLocalUserPostsIndexedDB();
          const mapped: Post[] = parsed.map((p: any) => ({
            id: p.id,
            text: p.text,
            imageUrl: p.imageUrl,
            imageUrls: p.imageUrls || (p.imageUrl ? [p.imageUrl] : []),
            imageModels: p.imageModels || [],
            imageCaptions: p.imageCaptions || [],
            boardId: 'user-board',
            authorId: p.authorId || 'local-user',
            authorEmail: p.authorEmail || 'local-user@local.com',
            isPinned: !!p.isPinned,
            customOrder: p.customOrder,
            createdAt: {
              toMillis: () => p.createdAtMillis || Date.now(),
              toDate: () => new Date(p.createdAtMillis || Date.now()),
              seconds: Math.floor((p.createdAtMillis || Date.now()) / 1000),
              nanoseconds: 0,
            } as any,
          }));

          mapped.sort((a, b) => {
            const orderA = getSortValue(a);
            const orderB = getSortValue(b);
            return orderB - orderA;
          });

          setPosts(mapped);
          setLoading(false);
        } catch (err) {
          console.error(err);
          setPosts([]);
          setLoading(false);
        }
      };

      loadLocalPosts();
      window.addEventListener('reload_local_posts', loadLocalPosts);
      return () => {
        window.removeEventListener('reload_local_posts', loadLocalPosts);
      };
    }

    let initialCachedLoaded = false;
    if (boardId) {
      try {
        const cached = localStorage.getItem(`posts_cache_${boardId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPosts(parsed);
            setLoading(false);
            initialCachedLoaded = true;
          }
        }
      } catch (e) {
        console.warn('[Feed] Error reading local posts cache:', e);
      }
    }

    if (!initialCachedLoaded) {
      setLoading(true);
    }

    const postsCollection = collection(db, 'posts');
    
    const q = query(
      postsCollection, 
      where('boardId', '==', boardId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData: Post[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Post));
      
      postsData.sort((a, b) => {
        const orderA = getSortValue(a);
        const orderB = getSortValue(b);
        return orderB - orderA;
      });

      setPosts(postsData);
      setLoading(false);

      if (boardId) {
        try {
          localStorage.setItem(`posts_cache_${boardId}`, JSON.stringify(postsData));
        } catch (e) {
          console.warn('[Feed] Error saving posts cache:', e);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [boardId]);

  // Save scroll position on scroll
  useEffect(() => {
    if (loading) return;

    const handleScroll = () => {
      if (boardId) {
        boardScrollPositions[boardId] = window.scrollY;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [boardId, loading]);

  // Restore scroll position when loading finishes
  useEffect(() => {
    if (!loading && boardId && posts.length > 0) {
      const savedScroll = boardScrollPositions[boardId];
      if (savedScroll !== undefined && savedScroll > 0) {
        // Try scrolling immediately
        window.scrollTo(0, savedScroll);
        
        // Also schedule a micro-task or timeout to ensure layout has updated
        const timer = setTimeout(() => {
          window.scrollTo({
            top: savedScroll,
            behavior: 'instant' as any
          });
        }, 60);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, boardId, posts]);

  if (loading) {
    return (
      <div className={`flex h-64 flex-col items-center justify-center gap-3 transition-colors ${isDarkMode ? 'text-[#B4C6D8]' : 'text-natural-muted'}`}>
        <Loader2 className="animate-spin" size={32} />
        <p className="text-sm font-black">جاري تحميل الخلاصة...</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className={`mx-auto mt-12 flex max-w-sm flex-col items-center justify-center rounded-3xl border-2 border-dashed p-12 text-center transition-colors ${
        isDarkMode 
          ? 'border-[#2C374E] bg-[#111822]' 
          : 'border-natural-border bg-white'
      }`} dir="rtl">
        <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
          isDarkMode ? 'bg-[#1A212E] text-[#B4C6D8]' : 'bg-natural-bg text-natural-muted'
        }`}>
          <CameraOff size={32} />
        </div>
        <h3 className={`mb-1 text-lg font-black ${isDarkMode ? 'text-white' : 'text-natural-text'}`}>لا توجد منشورات بعد</h3>
        <p className={`text-sm ${isDarkMode ? 'text-[#B4C6D8]' : 'text-natural-muted'}`}>
          {isAdmin 
            ? "لم تقم بمشاركة أي شيء بعد. ابدأ بإنشاء منشورك الأول أعلاه!" 
            : "لم يقم المسؤول بمشاركة أي تحديثات مؤخراً. عُد لاحقاً!"}
        </p>
      </div>
    );
  }

  return (
    <div className="pb-12">
      <AnimatePresence mode="popLayout">
        {posts.map((post, index) => (
          <div key={post.id}>
            <PostCard 
              post={post} 
              isAdmin={isAdmin} 
              boards={boards} 
              onTestPrompt={onTestPrompt} 
              isDarkMode={isDarkMode} 
              onMovePost={handleMovePost}
              canMoveUp={index > 0}
              canMoveDown={index < posts.length - 1}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
