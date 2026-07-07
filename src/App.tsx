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
import PromptBuilder from './components/PromptBuilder';
import { auth, db } from './lib/firebase';
import { User } from 'firebase/auth';
import { initAuth, logout, googleSignIn } from './lib/auth';
import { collection, query, orderBy, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Board, GlobalSettings, License } from './types';
import { handleFirestoreError } from './lib/error-handler';
import { OperationType } from './types';
import { ADMIN_CONFIG } from './config';
import { Share2, Sparkles, PlusCircle, X, FileText, Lock, LogIn } from 'lucide-react';
import OwnerLicensePanel from './components/OwnerLicensePanel';
import LockScreen from './components/LockScreen';
import ToastContainer, { showToast } from './components/Toast';
import { updateAppBadge, sendLocalNotification } from './lib/notifications';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [lastDynamicBoardId, setLastDynamicBoardId] = useState<string | null>(null);
  const [postCounts, setPostCounts] = useState<Record<string, number>>({});
  const [incomingShareText, setIncomingShareText] = useState<string | null>(null);

  // Access control & trial period states
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    ownerEmail: ADMIN_CONFIG.email,
    trialDays: 7,
    allFree: false
  });
  const [userLicense, setUserLicense] = useState<License | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [showActivationForce, setShowActivationForce] = useState(false);

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('jadgpt_dark_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('jadgpt_dark_mode', String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // 1. Listen to global settings in real-time
  useEffect(() => {
    const docRef = doc(db, 'settings', 'global');
    const unsubscribeSettings = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setGlobalSettings(snapshot.data() as GlobalSettings);
      } else {
        const defaultSettings: GlobalSettings = {
          ownerEmail: ADMIN_CONFIG.email,
          trialDays: 7,
          allFree: false
        };
        setDoc(docRef, defaultSettings).catch(err => console.warn('Failed to bootstrap settings:', err));
        setGlobalSettings(defaultSettings);
      }
    });

    return () => unsubscribeSettings();
  }, []);

  // Track Visibility & Reset Badge when user active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateAppBadge(0);
        localStorage.setItem('jadgpt_last_viewed_time', String(Date.now()));
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Initial clear
    if (document.visibilityState === 'visible') {
      updateAppBadge(0);
      localStorage.setItem('jadgpt_last_viewed_time', String(Date.now()));
    }
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 2. Listen to user license once user is loaded
  useEffect(() => {
    if (loading) return;

    if (!user || !user.email) {
      setUserLicense(null);
      setLicenseLoading(false);
      return;
    }

    setLicenseLoading(true);
    const emailId = user.email.trim().toLowerCase();
    const docRef = doc(db, 'licenses', emailId);

    const unsubscribeLicense = onSnapshot(docRef, async (snapshot) => {
      if (snapshot.exists()) {
        setUserLicense(snapshot.data() as License);
        setLicenseLoading(false);
      } else {
        const newLicense: License = {
          email: emailId,
          activationCode: '',
          activated: false,
          trialStartDate: Date.now(),
          expiryDate: null,
          activatedAt: null
        };
        try {
          await setDoc(docRef, newLicense);
          setUserLicense(newLicense);
        } catch (err) {
          console.error('Failed to create user license doc:', err);
        } finally {
          setLicenseLoading(false);
        }
      }
    }, (err) => {
      console.error('Failed to listen to license:', err);
      setLicenseLoading(false);
    });

    return () => unsubscribeLicense();
  }, [user, loading]);

  const handleUpdateSettings = async (newSettings: Partial<GlobalSettings>) => {
    try {
      await updateDoc(doc(db, 'settings', 'global'), newSettings);
    } catch (err) {
      console.error('Failed to update global settings:', err);
      throw err;
    }
  };

  useEffect(() => {
    const handleSwitchToPromptBuilder = () => {
      setActiveBoardId('prompt-builder');
    };
    window.addEventListener('switch_to_prompt_builder', handleSwitchToPromptBuilder);
    return () => {
      window.removeEventListener('switch_to_prompt_builder', handleSwitchToPromptBuilder);
    };
  }, []);

  useEffect(() => {
    // Check for shared content from Web Share Target
    const searchParams = new URLSearchParams(window.location.search);
    const isShared = searchParams.get('shared') === 'true';
    const sharedTitle = searchParams.get('title');
    const sharedText = searchParams.get('text');
    const sharedUrl = searchParams.get('url');

    if (isShared || sharedTitle || sharedText || sharedUrl) {
      // Force switch to user-board so user can see and submit the post
      setActiveBoardId('user-board');

      if (sharedTitle || sharedText || sharedUrl) {
        let combined = '';
        if (sharedTitle) combined += sharedTitle + '\n';
        if (sharedText) combined += sharedText + '\n';
        if (sharedUrl) combined += sharedUrl;
        
        combined = combined.trim();
        
        if (combined) {
          localStorage.setItem('shared_incoming_post', combined);
        }
      }

      // Dispatch custom event to notify UploadPost to grab shared content (from caches or localStorage)
      setTimeout(() => {
        window.dispatchEvent(new Event('check_shared_post'));
      }, 300);

      // Remove query parameters from address bar to avoid re-triggering on refresh
      const newUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  useEffect(() => {
    if (activeBoardId !== null && activeBoardId !== 'user-board' && activeBoardId !== 'prompt-builder' && activeBoardId !== 'merged-app') {
      setLastDynamicBoardId(activeBoardId);
    }
  }, [activeBoardId]);

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

    // Fetch Post Counts & Handle PWA Badges/Notifications in real-time
    const qPosts = query(collection(db, 'posts'));
    let isInitialLoad = true;
    const unsubscribePosts = onSnapshot(qPosts, (snapshot) => {
      const counts: Record<string, number> = {};
      
      const lastViewedTimeStr = localStorage.getItem('jadgpt_last_viewed_time');
      const lastViewedTime = lastViewedTimeStr ? parseInt(lastViewedTimeStr, 10) : 0;
      
      let newPostsCount = 0;
      let latestPostText = '';
      let latestPostTime = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const boardId = data.boardId || 'null';
        counts[boardId] = (counts[boardId] || 0) + 1;
        
        // Count unread posts on regular public boards (ignore local user draft board if any)
        if (boardId !== 'user-board') {
          const createdAt = data.createdAt;
          const createdAtMillis = createdAt?.toMillis ? createdAt.toMillis() : (createdAt?.seconds ? createdAt.seconds * 1000 : 0);
          if (createdAtMillis > lastViewedTime) {
            newPostsCount++;
            if (createdAtMillis > latestPostTime) {
              latestPostTime = createdAtMillis;
              latestPostText = data.text || '';
            }
          }
        }
      });
      
      setPostCounts(counts);

      // Handle App Badges & System Notifications
      if (document.visibilityState === 'visible') {
        updateAppBadge(0);
        localStorage.setItem('jadgpt_last_viewed_time', String(Date.now()));
      } else {
        updateAppBadge(newPostsCount);
        
        // Trigger actual system notification if user permitted and it's not the initial load
        if (!isInitialLoad && newPostsCount > 0 && latestPostTime > lastViewedTime) {
          sendLocalNotification('منشور جديد مضاف! 📣', {
            body: latestPostText ? (latestPostText.substring(0, 80) + '...') : 'تمت إضافة محتوى وصور جديدة في اللوحات.',
            tag: 'new-post-alert',
          });
        }
      }
      
      isInitialLoad = false;
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'posts-count');
    });

    return () => {
      unsubscribe();
      unsubscribeBoards();
      unsubscribePosts();
    };
  }, []);

  const isOwner = user?.email?.trim().toLowerCase() === globalSettings.ownerEmail.trim().toLowerCase();
  const isAdmin = isOwner;

  const elapsed = userLicense ? (Date.now() - userLicense.trialStartDate) : 0;
  const trialDuration = globalSettings.trialDays * 24 * 60 * 60 * 1000;
  const timeLeft = trialDuration - elapsed;
  const trialDaysLeft = Math.max(0, Math.ceil(timeLeft / (24 * 60 * 60 * 1000)));
  const isInTrial = userLicense ? (timeLeft > 0) : false;

  const hasFullAccess = isOwner || globalSettings.allFree || (userLicense?.activated === true);
  const hasTrialAccess = hasFullAccess || isInTrial;

  const isTrialExpired = !!user && !licenseLoading && !hasFullAccess && !isInTrial;

  const currentBoard = boards.find(b => b.id === activeBoardId);

  if (loading || (user && licenseLoading)) {
    return (
      <div className={`flex min-h-screen items-center justify-center transition-colors ${isDarkMode ? 'bg-[#121824]' : 'bg-natural-bg'}`}>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-natural-primary shadow-xl animate-pulse overflow-hidden">
          <img src="/logo.png" className="h-full w-full object-cover" alt="Loading" onError={(e) => (e.target as HTMLElement).style.display = 'none'} />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans selection:bg-natural-primary/20 selection:text-natural-primary transition-colors duration-300 ${isDarkMode ? 'bg-[#121824]' : 'bg-natural-bg'}`}>
      <Header 
        user={user} 
        isAdmin={isAdmin} 
        currentBoard={currentBoard} 
        activeBoardId={activeBoardId}
        boards={boards} 
        onSelectBoard={setActiveBoardId}
        globalSettings={globalSettings}
        onUpdateSettings={handleUpdateSettings}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        userLicense={userLicense}
      />
      
      {/* 1. AllFree (Gift) Banner */}
      {globalSettings.allFree && !isOwner && (
        <div className="bg-emerald-50 border-b border-emerald-200/40 py-2.5 text-center px-4 animate-fadeIn" dir="rtl">
          <p className="text-xs font-black text-emerald-800 flex items-center justify-center gap-1.5">
            <span>🎁</span>
            <span>تم تفعيل النسخة الكاملة مجاناً لفترة محدودة لجميع الزوار كهدية من المالك!</span>
          </p>
        </div>
      )}

      {/* 2. Trial Period Days Left Banner */}
      {user && !hasFullAccess && isInTrial && (
        <div className="bg-amber-50 border-b border-amber-200/40 py-2.5 text-center px-4 animate-fadeIn" dir="rtl">
          <p className="text-xs font-black text-amber-800 flex items-center justify-center gap-1.5 flex-wrap">
            <span className="animate-pulse">⏳</span>
            <span>متبقي {trialDaysLeft} {trialDaysLeft === 1 ? 'يوم' : 'أيام'} على نهاية الفترة التجريبية المجانية.</span>
            <button 
              onClick={() => setShowActivationForce(true)}
              className="text-[10px] text-amber-600 font-bold underline cursor-pointer hover:text-amber-800 bg-transparent border-none ml-1 p-0 font-sans"
            >
              أدخل كود تفعيل النسخة الكاملة الآن 🔑
            </button>
          </p>
        </div>
      )}

      <main className="container mx-auto px-1 max-w-5xl">

        <div className={`sticky top-12 z-30 pt-1.5 pb-0.5 border-b mb-1 transition-colors ${
          isDarkMode ? 'bg-[#121824]/95 border-[#2C374E]/30' : 'bg-natural-bg/95 border-natural-border/20'
        }`}>
          <BoardTabs 
            boards={boards} 
            activeBoardId={activeBoardId} 
            onSelectBoard={setActiveBoardId} 
            postCounts={postCounts}
            lastDynamicBoardId={lastDynamicBoardId}
            isDarkMode={isDarkMode}
          />
        </div>

        {/* 4. Determine Render Mode based on subscription & locked boards */}
        {isTrialExpired ? (
          <div className="mt-6">
            <LockScreen 
              userEmail={user.email!} 
              userLicense={userLicense} 
              onLogout={async () => {
                await logout();
                setUser(null);
                setUserLicense(null);
              }}
              onActivationSuccess={() => {
                showToast('🎉 مبارك! تم تفعيل النسخة الكاملة بنجاح!');
              }}
            />
          </div>
        ) : (currentBoard?.locked && !hasTrialAccess) ? (
          /* Render Locked Board View for Non-Activated / Guest Users */
          <div className="mt-10 max-w-md mx-auto text-center bg-white p-8 rounded-3xl border border-natural-border shadow-xl space-y-5" dir="rtl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FCFAF2] text-natural-primary border border-natural-primary/20 shadow-sm">
              <Lock size={24} />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-md font-black text-[#4A4A35]">هذه اللوحة مقفولة 🔒</h3>
              <p className="text-xs text-natural-muted font-bold leading-relaxed px-2">
                محتوى لوحة <span className="text-[#4A4A35] font-black">"{currentBoard.name}"</span> مخصص للمشتركين ذوي التراخيص النشطة فقط. يرجى تسجيل الدخول للحصول على فترة تجريبية مجانية أو استخدام كود تفعيل النسخة الكاملة.
              </p>
            </div>
            {!user ? (
              <button
                onClick={() => {
                  googleSignIn().then(res => {
                    if (res) window.location.reload();
                  }).catch(err => {
                    showToast('فشل الدخول، يرجى استخدام زر تسجيل الدخول في القائمة الجانبية.');
                  });
                }}
                className="w-full bg-natural-primary text-white py-3 rounded-2xl text-xs font-black shadow-md hover:bg-[#3d3d2a] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <LogIn size={16} />
                <span>تسجيل الدخول الفوري للوصول 🔑</span>
              </button>
            ) : (
              <button
                onClick={() => setShowActivationForce(true)}
                className="w-full bg-[#4A4A35] text-white py-3 rounded-2xl text-xs font-black shadow-md hover:bg-natural-primary transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles size={16} />
                <span>أدخل كود التفعيل للفتح الآن 🔑</span>
              </button>
            )}
          </div>
        ) : (
          /* Normal Access Allowed! */
          <>
            <AnimatePresence mode="wait">
              {(isAdmin || activeBoardId === 'user-board') && activeBoardId !== 'merged-app' && activeBoardId !== 'prompt-builder' && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  key="admin-upload"
                >
                  <UploadPost 
                    activeBoardId={activeBoardId} 
                    activeBoardName={activeBoardId === 'user-board' ? "لوحة المستخدم" : currentBoard?.name} 
                    boards={boards}
                    isDarkMode={isDarkMode}
                    onUploadSuccess={(boardId) => {
                      if (boardId !== undefined) {
                        setActiveBoardId(boardId);
                      }
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-1.5">
              {activeBoardId === 'prompt-builder' ? (
                <PromptBuilder isDarkMode={isDarkMode} />
              ) : (
                <Feed 
                  isAdmin={isAdmin} 
                  boardId={activeBoardId} 
                  boards={boards} 
                  onTestPrompt={() => {}} 
                  isDarkMode={isDarkMode}
                />
              )}
            </div>
          </>
        )}
      </main>

      <ScrollToTop />
      <ToastContainer />

      {/* Web Share Target Incoming Content Modal */}
      <AnimatePresence>
        {incomingShareText && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIncomingShareText(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 text-right border border-natural-border z-10 flex flex-col max-h-[80vh]"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-natural-border/30 pb-3.5 mb-4">
                <div className="flex items-center gap-2 text-[#4A4A35]">
                  <Share2 className="text-natural-primary animate-pulse" size={20} />
                  <h3 className="text-md font-black">محتوى تمت مشاركته من تطبيق خارجي 📥</h3>
                </div>
                <button
                  onClick={() => setIncomingShareText(null)}
                  className="p-1.5 text-natural-muted hover:bg-natural-secondary-bg rounded-lg transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto mb-5 space-y-3">
                <p className="text-xs text-natural-muted font-bold">
                  لقد استقبلنا النص التالي من مشاركة خارجية . اختر أين تود توجيهه:
                </p>
                <div className="border border-neutral-100 bg-[#FAF9F5] p-4 rounded-2xl text-xs leading-relaxed font-mono whitespace-pre-wrap text-[#4A4A35] max-h-48 overflow-y-auto shadow-inner text-right">
                  {incomingShareText}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('shared_incoming_prompt', incomingShareText);
                    setActiveBoardId('prompt-builder');
                    setIncomingShareText(null);
                    // Dispatch custom event to let the builder component know immediately
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('check_shared_prompt'));
                    }, 100);
                  }}
                  className="bg-natural-primary text-white hover:bg-[#3d3d2a] font-black text-xs px-4 py-3.5 rounded-2xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} />
                  <span>✍️ توجيه إلى صانع البرومبت</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('shared_incoming_post', incomingShareText);
                    // Default to first board if available, otherwise 'null'
                    const defaultBoardId = boards.length > 0 ? boards[0].id : null;
                    setActiveBoardId(defaultBoardId);
                    setIncomingShareText(null);
                    // Dispatch custom event to let UploadPost component know immediately
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('check_shared_post'));
                    }, 100);
                  }}
                  className="bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-100 font-black text-xs px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  <PlusCircle size={16} />
                  <span>📁 توجيه لإنشاء منشور جديد</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIncomingShareText(null)}
                className="mt-3 text-[11px] text-natural-muted hover:text-red-500 font-bold underline transition-colors"
              >
                تجاهل المحتوى المشارك ومتابعة التصفح
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. Force Show Activation Modal (if clicked from trial bar) */}
      <AnimatePresence>
        {showActivationForce && user && (
          <LockScreen 
            userEmail={user.email!} 
            userLicense={userLicense} 
            onLogout={async () => {
              await logout();
              setUser(null);
              setUserLicense(null);
              setShowActivationForce(false);
            }}
            onActivationSuccess={() => {
              setShowActivationForce(false);
              showToast('🎉 مبارك! تم تفعيل النسخة الكاملة بنجاح!');
            }}
            onClose={() => setShowActivationForce(false)}
          />
        )}
      </AnimatePresence>

      <footer className="py-8 bg-white border-t border-natural-border text-center">
        <p className="text-[10px] text-natural-muted font-medium tracking-widest uppercase">
          نظام إدارة المحتوى المتطور • {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
