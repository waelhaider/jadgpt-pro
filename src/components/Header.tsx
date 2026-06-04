import React, { useState } from 'react';
import { auth, googleProvider } from '../lib/firebase';
import { googleSignIn, emailSignIn, logout as authLogout } from '../lib/auth';
import { safeStorage } from '../lib/safe-storage';
import { User } from 'firebase/auth';
import { LogIn, LogOut, ShieldCheck, User as UserIcon, Menu, X, PlusCircle, Edit, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Board } from '../types';
import BoardModals from './BoardModals';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError } from '../lib/error-handler';
import { OperationType } from '../types';
import TextEditorModal from './TextEditorModal';
import { ADMIN_CONFIG } from '../config';

interface HeaderProps {
  user: User | null;
  isAdmin: boolean;
  currentBoard?: Board;
  boards: Board[];
  onSelectBoard: (id: string | null) => void;
}

export default function Header({ user, isAdmin, currentBoard, boards, onSelectBoard }: HeaderProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTranslatorOpen, setIsTranslatorOpen] = useState(false);
  const [modalState, setModalState] = useState<{isOpen: boolean, type: 'create' | 'edit' | 'reorder'}>({
    isOpen: false,
    type: 'create'
  });
  const [sidebarKey, setSidebarKey] = useState(safeStorage.getItem('user_gemini_api_key') || '');
  const [isEditingKey, setIsEditingKey] = useState(false);
  
  // Fast email login state
  const [fastEmail, setFastEmail] = useState('');
  const [fastName, setFastName] = useState('');

  // Custom Iframe / Fast login modal state (Bypassing browser prompt restrictions in sandboxed iframe)
  const [iframeLoginOpen, setIframeLoginOpen] = useState(false);
  const [iframeEmail, setIframeEmail] = useState(ADMIN_CONFIG.email);
  const [iframeName, setIframeName] = useState(ADMIN_CONFIG.displayName);
  const [iframeLoginError, setIframeLoginError] = useState('');
  const [iframeLoginSuccess, setIframeLoginSuccess] = useState('');

  React.useEffect(() => {
    if (isSidebarOpen) {
      setSidebarKey(safeStorage.getItem('user_gemini_api_key') || '');
    }
  }, [isSidebarOpen]);

  const handleLogin = async () => {
    // Check if running inside an iframe (such as the AI Studio integrated preview)
    const isIframe = window.self !== window.top;
    if (isIframe) {
      setIframeEmail(ADMIN_CONFIG.email);
      setIframeName(ADMIN_CONFIG.displayName);
      setIframeLoginError('');
      setIframeLoginSuccess('');
      setIframeLoginOpen(true);
      return;
    }

    try {
      const res = await googleSignIn();
      if (res) {
        alert('تم تسجيل الدخول بنجاح! 🎉');
        window.location.reload();
      }
      setIsSidebarOpen(false);
    } catch (error: any) {
      console.error('Login failed:', error);
      const isPopupBlocked = error?.code === 'auth/popup-blocked' || error?.message?.toLowerCase().includes('popup-blocked') || error?.message?.toLowerCase().includes('popup');
      const isUnauthorizedDomain = error?.code === 'auth/unauthorized-domain' || error?.message?.toLowerCase().includes('unauthorized-domain');
      
      if (isUnauthorizedDomain) {
        // Open custom login modal directly to avoid prompt/confirm iframe restrictions
        setIframeEmail(ADMIN_CONFIG.email);
        setIframeName(ADMIN_CONFIG.displayName);
        setIframeLoginError('تم اكتشاف خطأ في عنوان النطاق غير الموثق للنظام (Unauthorized Domain). يمكنك استخدام نموذج الدخول المباشر بالأسفل كبديل فوري وبسيط.');
        setIframeLoginSuccess('');
        setIframeLoginOpen(true);
      } else if (isPopupBlocked) {
        // Open custom login modal directly as fallback
        setIframeEmail(ADMIN_CONFIG.email);
        setIframeName(ADMIN_CONFIG.displayName);
        setIframeLoginError('تم حظر النافذة المنبثقة لـ Google OAuth. يمكنك تسجيل الدخول المباشر فوراً بالأسفل دون الحاجة للنوافذ المنبثقة.');
        setIframeLoginSuccess('');
        setIframeLoginOpen(true);
      } else {
        alert(`❌ فشل تسجيل الدخول: ${error?.message || error}`);
      }
    }
  };

  const handleFastLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fastEmail.trim()) {
      alert('يرجى كتابة بريدك الإلكتروني أولاً.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fastEmail.trim())) {
      alert('يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }

    try {
      const res = await emailSignIn(fastEmail.trim(), fastName.trim());
      if (res) {
        alert('🎉 تم الدخول السريع بنجاح! حصة سيرفر JADGPT المجانية نشطة لك الآن لتوليد وتعديل الصور.');
        window.location.reload();
      }
      setIsSidebarOpen(false);
    } catch (err: any) {
      alert(`خطأ أثناء الدخول السريع: ${err.message || err}`);
    }
  };

  const handleLogout = async () => {
    try {
      await authLogout();
      setIsSidebarOpen(false);
      window.location.reload();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleBoardSubmit = async (data: any) => {
    console.log('Attempting board submit:', modalState.type, data);
    try {
      if (modalState.type === 'create') {
        if (!data.name?.trim()) {
          alert('يرجى إدخال اسم اللوحة');
          return;
        }
        const boardData = {
          name: data.name.trim(),
          order: boards.length,
          createdAt: serverTimestamp()
        };
        console.log('Creating board with data:', boardData);
        const docRef = await addDoc(collection(db, 'boards'), boardData);
        onSelectBoard(docRef.id);
        alert('تم إنشاء اللوحة بنجاح! تم الانتقال إليها الآن.');
      } else if (modalState.type === 'edit' && currentBoard) {
        if (!data.name?.trim()) {
          alert('يرجى إدخال اسم اللوحة');
          return;
        }
        await updateDoc(doc(db, 'boards', currentBoard.id), {
          name: data.name.trim()
        });
        alert('تم تعديل اسم اللوحة بنجاح!');
      } else if (modalState.type === 'reorder') {
        console.log('Reordering boards:', data);
        // data is array of {id, order}
        for (const b of data) {
          await updateDoc(doc(db, 'boards', b.id), { order: b.order });
        }
        alert('تم حفظ الترتيب الجديد بنجاح!');
      }
      setModalState({ ...modalState, isOpen: false });
    } catch (error) {
      console.error('Board operation error detail:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`فشل تنفيذ العملية: ${msg}`);
      handleFirestoreError(error, OperationType.WRITE, 'boards');
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-natural-border bg-white/80 backdrop-blur-md shadow-sm shrink-0">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          {/* Menu Button (Right side for RTL feel, or Left side) */}
          {/* User expects mobile style, usually top-left or top-right. Let's put it on the left since logo is on the right for Arabic? 
              Actually line 43 in previous version had logo on the left of its container. 
              Let's put Menu on one side and Logo on the other. */}
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-natural-primary hover:bg-natural-secondary-bg rounded-full transition-colors"
          >
            <Menu size={24} />
          </button>

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-natural-primary shadow-sm border border-natural-border/20">
              <img 
                src="/logo.png" 
                alt="JADGPT Logo" 
                className="h-full w-full object-cover"
                onError={(e) => {
                  // Fallback to stylized letter if image fails
                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="text-white font-black text-xl">J</div>';
                }}
              />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-[#4A4A35]">
              JADGPT
            </h1>
          </div>
          
          {/* Spacer for centering logic if needed, but justify-between is fine */}
          <div className="w-10" /> 
        </div>
      </header>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl"
              dir="rtl"
            >
              <div className="flex flex-col h-full">
                {/* Sidebar Header */}
                <div className="flex items-center justify-between p-6 border-b border-natural-border">
                  <h2 className="text-lg font-bold text-natural-text">القائمة</h2>
                  <button 
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-2 text-natural-muted hover:bg-natural-secondary-bg rounded-md transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Sidebar Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {user ? (
                    <div className="space-y-8">
                      {/* User Info */}
                      <div className="flex flex-col items-center text-center space-y-3">
                        <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-natural-secondary-bg shadow-sm">
                          {user.photoURL ? (
                            <img src={user.photoURL} alt={user.displayName || 'User'} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-natural-bg text-natural-muted">
                              <UserIcon size={32} />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-lg font-bold text-natural-text">{user.displayName}</p>
                          <p className="text-xs text-natural-muted">{user.email}</p>
                        </div>
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-natural-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-natural-primary">
                            <ShieldCheck size={12} /> المسؤول
                          </span>
                        )}
                      </div>

                      <div className="border-t border-natural-border pt-6 space-y-4">
                        {/* Always available tool for all logged-in users */}
                        <div className="space-y-2 w-full">
                          <h4 className="text-[10px] text-natural-muted font-bold uppercase tracking-widest text-right mb-2">الأدوات العامة</h4>
                          <button
                            onClick={() => {
                              setIsSidebarOpen(false);
                              setIsTranslatorOpen(true);
                            }}
                            className="flex w-full items-center gap-3 p-3 rounded-xl hover:bg-natural-secondary-bg text-natural-text transition-colors border border-dashed border-natural-border hover:border-natural-primary"
                          >
                            <Edit size={18} className="text-natural-primary animate-pulse" />
                            <span className="text-sm font-bold col-span-1">تعديل النص</span>
                          </button>


                        </div>

                        {isAdmin && (
                          <div className="space-y-2 w-full pt-4 border-t border-natural-border">
                            <h4 className="text-[10px] text-natural-muted font-bold uppercase tracking-widest text-right mb-2">إدارة اللوحات</h4>
                            <button
                              onClick={() => {
                                setIsSidebarOpen(false);
                                setModalState({ isOpen: true, type: 'create' });
                              }}
                              className="flex w-full items-center gap-3 p-3 rounded-xl hover:bg-natural-secondary-bg text-natural-text transition-colors"
                            >
                              <PlusCircle size={18} className="text-natural-primary" />
                              <span className="text-sm font-bold">إنشاء لوحة جديدة</span>
                            </button>
                            <button
                              disabled={!currentBoard}
                              onClick={() => {
                                setIsSidebarOpen(false);
                                setModalState({ isOpen: true, type: 'edit' });
                              }}
                              className="flex w-full items-center gap-3 p-3 rounded-xl hover:bg-natural-secondary-bg text-natural-text transition-colors disabled:opacity-50"
                            >
                              <Edit size={18} className="text-natural-primary" />
                              <span className="text-sm font-bold">تعديل اسم اللوحة الحالية</span>
                            </button>
                            <button
                              onClick={() => {
                                setIsSidebarOpen(false);
                                setModalState({ isOpen: true, type: 'reorder' });
                              }}
                              className="flex w-full items-center gap-3 p-3 rounded-xl hover:bg-natural-secondary-bg text-natural-text transition-colors"
                            >
                              <LayoutGrid size={18} className="text-natural-primary" />
                              <span className="text-sm font-bold">ترتيب اللوحات</span>
                            </button>
                          </div>
                        )}
                        
                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-600 transition-all hover:bg-red-100 active:scale-95"
                        >
                          <LogOut size={18} />
                          تسجيل الخروج
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full space-y-6 text-center">
                      <div className="h-16 w-16 bg-natural-secondary-bg rounded-full flex items-center justify-center text-natural-muted">
                        <UserIcon size={32} />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-bold text-natural-text">مرحباً بك</h3>
                        <p className="text-sm text-natural-muted">سجل دخولك لتتمكن من الوصول لخيارات إضافية.</p>
                      </div>
                      <button
                        onClick={handleLogin}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-natural-primary p-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#4A4A35] active:scale-95"
                      >
                        <LogIn size={18} />
                        تسجيل الدخول باستخدام جوجل
                      </button>

                      {/* Fast Email Login Form */}
                      <form onSubmit={handleFastLogin} className="w-full pt-4 border-t border-natural-border/60 text-right space-y-3">
                        <div className="flex items-center gap-1.5 justify-between">
                          <span className="text-xs font-black text-[#4A4A35]">أو الدخول ببريدك الإلكتروني مباشرة</span>
                          <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-md">جديد وسريع</span>
                        </div>
                        <p className="text-[10px] text-natural-muted leading-relaxed">
                          إذا واجهت مشكلة في تسجيل الدخول العادي أو كنت داخل نافذة المعاينة، أدخل بريدك الإلكتروني هنا للدخول الفوري واستخدام حصة السيرفر المجانية مباشرة لرسم الصور وحفظها.
                        </p>
                        <div className="space-y-2">
                          <input
                            type="email"
                            value={fastEmail}
                            onChange={(e) => setFastEmail(e.target.value)}
                            placeholder="بريدك الإلكتروني الشخصي"
                            className="w-full text-xs rounded-xl border border-natural-border px-3 py-2.5 bg-white font-bold text-natural-text focus:outline-none text-right focus:ring-1 focus:ring-natural-primary"
                            required
                          />
                          <input
                            type="text"
                            value={fastName}
                            onChange={(e) => setFastName(e.target.value)}
                            placeholder="اسمك الكريم (اختياري)"
                            className="w-full text-xs rounded-xl border border-natural-border px-3 py-2.5 bg-white font-bold text-natural-text focus:outline-none text-right focus:ring-1 focus:ring-natural-primary"
                          />
                        </div>
                        <button
                          type="submit"
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-natural-primary bg-natural-primary/5 p-3 text-xs font-bold text-natural-primary transition-all hover:bg-natural-primary hover:text-white active:scale-95"
                        >
                          <LogIn size={14} />
                          دخول فوري ومباشر بحصة السيرفر
                        </button>
                      </form>

                      {/* Tool Button for Guests as well */}
                      <div className="w-full pt-6 border-t border-natural-border space-y-2">
                        <h4 className="text-[10px] text-natural-muted font-bold uppercase tracking-widest text-right">الأدوات العامة</h4>
                        <button
                          onClick={() => {
                            setIsSidebarOpen(false);
                            setIsTranslatorOpen(true);
                          }}
                          className="flex w-full items-center gap-3 p-3 rounded-xl hover:bg-natural-secondary-bg text-natural-text transition-colors border border-dashed border-natural-border hover:border-natural-primary"
                        >
                          <Edit size={18} className="text-natural-primary animate-pulse" />
                          <span className="text-sm font-bold">تعديل النص</span>
                        </button>


                      </div>
                    </div>
                  )}
                </div>

                {/* Sidebar Footer */}
                <div className="p-6 text-center border-t border-natural-border">
                  <p className="text-[10px] text-natural-muted uppercase tracking-widest">JADGPT CMS v1.0</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BoardModals
        isOpen={modalState.isOpen}
        type={modalState.type}
        board={currentBoard}
        boards={boards}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        onSubmit={handleBoardSubmit}
      />

      <TextEditorModal
        isOpen={isTranslatorOpen}
        onClose={() => setIsTranslatorOpen(false)}
        isAdmin={isAdmin}
        activeBoardId={currentBoard?.id || null}
      />

      {/* Iframe Safe Custom Login Modal */}
      <AnimatePresence>
        {iframeLoginOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIframeLoginOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-natural-border p-6 text-right z-10"
              dir="rtl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-natural-border/60">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-natural-primary" size={24} />
                  <h3 className="text-lg font-black text-[#4A4A35]">بوابة الدخول الفوري للمعاينة 🛠️</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIframeLoginOpen(false)}
                  className="p-1 text-natural-muted hover:bg-natural-secondary-bg rounded-md transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="py-4 space-y-4">
                <p className="text-xs text-natural-muted leading-relaxed">
                  نظراً لتواجدك في نافذة معاينة <strong>Google AI Studio</strong> (إطار مدمج IFrame)، أو بسبب حظر النوافذ المنبثقة، يصعب إكمال تسجيل الدخول الاعتيادي لجوجل.
                </p>
                
                <div className="bg-[#FAF9F5] border border-natural-border/40 rounded-xl p-3.5 space-y-1">
                  <p className="text-[11px] font-bold text-natural-primary">👤 دخول مسؤول النظام (Admin):</p>
                  <p className="text-[11px] text-[#707058] leading-relaxed">
                    تم تجهيز بيانات بريدك ومسماك بالأسفل افتراضياً. اضغط على الزر ليتم الدخول في AI Studio مباشرة وتعديل اللوحات فوراً وبشكل كامل دون قيود!
                  </p>
                </div>

                {iframeLoginError && (
                  <div className="p-2.5 text-xs bg-red-50 border border-red-100 text-red-600 rounded-lg font-bold">
                    ⚠️ {iframeLoginError}
                  </div>
                )}

                {iframeLoginSuccess && (
                  <div className="p-2.5 text-xs bg-green-50 border border-green-100 text-green-700 rounded-lg font-bold">
                    🎉 {iframeLoginSuccess}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-natural-text mb-1">البريد الإلكتروني للتهيئة:</label>
                    <input
                      type="email"
                      value={iframeEmail}
                      onChange={(e) => setIframeEmail(e.target.value)}
                      placeholder="أدخل بريدك الإلكتروني"
                      className="w-full text-sm rounded-xl border border-natural-border px-3 py-2.5 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-natural-text mb-1">الاسم المستعار (حقل اختياري):</label>
                    <input
                      type="text"
                      value={iframeName}
                      onChange={(e) => setIframeName(e.target.value)}
                      placeholder="الاسم المستعار"
                      className="w-full text-sm rounded-xl border border-natural-border px-3 py-2.5 bg-white font-bold text-natural-text focus:outline-none focus:ring-1 focus:ring-natural-primary text-right"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-natural-border/60">
                <button
                  type="button"
                  onClick={async () => {
                    if (!iframeEmail.trim()) {
                      setIframeLoginError('يرجى تحديد البريد الإلكتروني للمتابعة.');
                      return;
                    }
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(iframeEmail.trim())) {
                      setIframeLoginError('يرجى إدخال بريد إلكتروني صالح.');
                      return;
                    }

                    try {
                      setIframeLoginError('');
                      const res = await emailSignIn(iframeEmail.trim(), iframeName.trim() || undefined);
                      if (res) {
                        setIframeLoginSuccess('تم تسجيل الدخول بنجاح! جاري تحويلك...');
                        setTimeout(() => {
                          window.location.reload();
                        }, 500);
                      }
                    } catch (err: any) {
                      setIframeLoginError(err.message || 'فشل تسجيل الدخول الفوري.');
                    }
                  }}
                  className="flex-1 bg-natural-primary text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all hover:bg-[#4A4A35] active:scale-95 text-center cursor-pointer"
                >
                  دخول فوري ومباشر كمسؤول 🚀
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIframeEmail(ADMIN_CONFIG.email);
                    setIframeName(ADMIN_CONFIG.displayName);
                  }}
                  className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold py-2.5 px-3 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  استعادة المسؤول 👤
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
