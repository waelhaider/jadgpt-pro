/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import UploadPost from './components/UploadPost';
import Feed from './components/Feed';
import ScrollToTop from './components/ScrollToTop';
import BoardTabs from './components/BoardTabs';
import { auth, db } from './lib/firebase';
import { User } from 'firebase/auth';
import { initAuth } from './lib/auth';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Board } from './types';
import { handleFirestoreError } from './lib/error-handler';
import { OperationType } from './types';
import MergedAppWorkspace from './components/MergedAppWorkspace';

import { ADMIN_CONFIG } from './config';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [postCounts, setPostCounts] = useState<Record<string, number>>({});
  const [tryPromptText, setTryPromptText] = useState('');


  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser) => {
        setUser(currentUser as any);
        setLoading(false);
      },
      () => {
        setUser(null);
        setLoading(false);
      }
    );

    // Fetch Boards
    const q = query(collection(db, 'boards'), orderBy('order', 'asc'));
    const unsubscribeBoards = onSnapshot(q, (snapshot) => {
      const boardsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Board[];
      setBoards(boardsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'boards');
    });

    // Fetch Post Counts
    const qPosts = query(collection(db, 'posts'));
    const unsubscribePosts = onSnapshot(qPosts, (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        const boardId = doc.data().boardId || 'null';
        counts[boardId] = (counts[boardId] || 0) + 1;
      });
      setPostCounts(counts);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'posts-count');
    });

    return () => {
      unsubscribe();
      unsubscribeBoards();
      unsubscribePosts();
    };
  }, []);

  const isAdmin = user?.email === ADMIN_CONFIG.email;

  const currentBoard = boards.find(b => b.id === activeBoardId);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-natural-bg">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-natural-primary shadow-xl animate-pulse overflow-hidden">
          <img src="/logo.png" className="h-full w-full object-cover" alt="Loading" onError={(e) => (e.target as HTMLElement).style.display = 'none'} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-natural-bg font-sans selection:bg-natural-primary/20 selection:text-natural-primary">
      <Header 
        user={user} 
        isAdmin={isAdmin} 
        currentBoard={currentBoard} 
        boards={boards} 
        onSelectBoard={setActiveBoardId}
      />
      
      <main className="container mx-auto px-4 max-w-5xl">
        <div className="pt-2">
          <BoardTabs 
            boards={boards} 
            activeBoardId={activeBoardId} 
            onSelectBoard={setActiveBoardId} 
            postCounts={postCounts}
          />
        </div>

        <AnimatePresence mode="wait">
          {isAdmin && activeBoardId !== 'merged-app' && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              key="admin-upload"
            >
              <UploadPost activeBoardId={activeBoardId} activeBoardName={currentBoard?.name} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4">
          {activeBoardId === 'merged-app' ? (
            <MergedAppWorkspace initialPrompt={tryPromptText} />
          ) : (
            <Feed 
              isAdmin={isAdmin} 
              boardId={activeBoardId} 
              boards={boards} 
              onTestPrompt={(text) => {
                let successful = false;
                try {
                  const textArea = document.createElement('textarea');
                  textArea.value = text;
                  textArea.style.position = 'fixed';
                  textArea.style.top = '0';
                  textArea.style.left = '0';
                  textArea.style.width = '2em';
                  textArea.style.height = '2em';
                  textArea.style.padding = '0';
                  textArea.style.border = 'none';
                  textArea.style.outline = 'none';
                  textArea.style.boxShadow = 'none';
                  textArea.style.background = 'transparent';
                  textArea.style.opacity = '0';
                  document.body.appendChild(textArea);
                  textArea.focus();
                  textArea.select();
                  successful = document.execCommand('copy');
                  document.body.removeChild(textArea);
                } catch (err) {
                  console.warn('Fallback execCommand copy failed:', err);
                }

                if (!successful && navigator.clipboard && navigator.clipboard.writeText) {
                  try {
                    navigator.clipboard.writeText(text);
                    successful = true;
                  } catch (err) {
                    console.warn('Modern Clipboard API failed:', err);
                  }
                }

                setTryPromptText(text);
                setActiveBoardId('merged-app');
              }} 
            />
          )}
        </div>
      </main>

      <ScrollToTop />

      <footer className="py-8 bg-white border-t border-natural-border text-center">
        <p className="text-[10px] text-natural-muted font-medium tracking-widest uppercase">
          نظام إدارة المحتوى المتطور • {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
