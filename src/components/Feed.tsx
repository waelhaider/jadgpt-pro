import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { Post, OperationType, Board } from '../types';
import PostCard from './PostCard';
import { Loader2, CameraOff } from 'lucide-react';
import { handleFirestoreError } from '../lib/error-handler';
import { AnimatePresence } from 'motion/react';

interface FeedProps {
  isAdmin: boolean;
  boardId: string | null;
  boards: Board[];
}

export default function Feed({ isAdmin, boardId, boards }: FeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
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
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-natural-muted">
        <Loader2 className="animate-spin" size={32} />
        <p className="text-sm font-medium">جاري تحميل الخلاصة...</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="mx-auto mt-12 flex max-w-sm flex-col items-center justify-center rounded-3xl border-2 border-dashed border-natural-border bg-white p-12 text-center" dir="rtl">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-natural-bg text-natural-muted">
          <CameraOff size={32} />
        </div>
        <h3 className="mb-1 text-lg font-bold text-natural-text">لا توجد منشورات بعد</h3>
        <p className="text-sm text-natural-muted">
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
            <PostCard post={post} isAdmin={isAdmin} boards={boards} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
