import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { Post, OperationType, Board } from '../types';
import PostCard from './PostCard';
import { Loader2, CameraOff } from 'lucide-react';
import { handleFirestoreError } from '../lib/error-handler';
import { AnimatePresence } from 'motion/react';
import { getLocalUserPostsIndexedDB } from '../lib/indexedDbService';

interface FeedProps {
  isAdmin: boolean;
  boardId: string | null;
  boards: Board[];
  onTestPrompt: (text: string) => void;
  isDarkMode?: boolean;
}

export default function Feed({ isAdmin, boardId, boards, onTestPrompt, isDarkMode }: FeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    if (boardId === 'user-board') {
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
            createdAt: {
              toMillis: () => p.createdAtMillis || Date.now(),
              toDate: () => new Date(p.createdAtMillis || Date.now()),
              seconds: Math.floor((p.createdAtMillis || Date.now()) / 1000),
              nanoseconds: 0,
            } as any,
          }));

          mapped.sort((a, b) => {
            const pinA = a.isPinned ? 1 : 0;
            const pinB = b.isPinned ? 1 : 0;
            if (pinA !== pinB) {
              return pinB - pinA;
            }
            const timeA = a.createdAt?.toMillis() || 0;
            const timeB = b.createdAt?.toMillis() || 0;
            return timeB - timeA;
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
      
      // Sort pinned posts first, then sort by createdAt desc
      postsData.sort((a, b) => {
        const pinA = a.isPinned ? 1 : 0;
        const pinB = b.isPinned ? 1 : 0;
        if (pinA !== pinB) {
          return pinB - pinA; // Pinned goes first
        }
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA; // Newest first
      });

      setPosts(postsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [boardId]);

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
        {posts.map((post) => (
          <div key={post.id}>
            <PostCard post={post} isAdmin={isAdmin} boards={boards} onTestPrompt={onTestPrompt} isDarkMode={isDarkMode} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
