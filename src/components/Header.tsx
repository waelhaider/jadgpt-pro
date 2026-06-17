import React, { useState } from 'react';
import { auth, googleProvider } from '../lib/firebase';
import { googleSignIn, emailSignIn, logout as authLogout, saveUserKeyToFirestore } from '../lib/auth';
import { safeStorage } from '../lib/safe-storage';
import { User } from 'firebase/auth';
import { LogIn, LogOut, ShieldCheck, User as UserIcon, Menu, X, PlusCircle, Edit, LayoutGrid, Key } from 'lucide-react';
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
  


  // Custom Iframe / Fast login modal state (Bypassing browser prompt restrictions in sandboxed iframe)
  const [iframeLoginOpen, setIframeLoginOpen] = useState(false);
  const [iframeEmail, setIframeEmail] = useState('');
  const [iframeName, setIframeName] = useState('');
  const [iframeLoginError, setIframeLoginError] = useState('');
  const [iframeLoginSuccess, setIframeLoginSuccess] = useState('');

  React.useEffect(() => {
    if (isSidebarOpen) {
      setSidebarKey(safeStorage.getItem('user_gemini_api_key') || '');
    }
  }, [isSidebarOpen]);

  const handleLogin = async () => {
    try {
      setIframeLoginError('');
      const res = await googleSignIn();
      if (res) {
        alert('تم تسجيل الدخول بنجاح عبر حساب غوغل! 🎉');
        window.location.reload();
      }
      setIsSidebarOpen(false);
    } catch (error: any) {
      console.error('Login failed:', error);
      const isPopupBlocked = error?.code === 'auth/popup-blocked' || error?.message?.toLowerCase().includes('popup-blocked') || error?.message?.toLowerCase().includes('popup');
      const isUnauthorizedDomain = error?.code === 'auth/unauthorized-domain' || error?.message?.toLowerCase().includes('unauthorized-domain');
      
      if (isUnauthorizedDomain || isPopupBlocked) {
        // Open custom login modal with empty inputs so they can type their own email, NOT PREFILLED with admin email
        setIframeEmail('');
        setIframeName('');
        setIframeLoginError(isUnauthorizedDomain 
          ? 'تم اكتشاف خطأ في النطاق غير الموثق للنظام (Unauthorized Domain). يمكنك استخدام نموذج الدخول المباشر بالأسفل كبديل فوري وبسيط.'
          : 'تم حظر النافذة المنبثقة من قِبل المتصفح لـ Google OAuth. يمكنك تسجيل الدخول المباشر فوراً بالأسفل دون الحاجة للنوافذ المنبثقة.'
        );
        setIframeLoginSuccess('');
        setIframeLoginOpen(true);
      } else {
        alert(`❌ فشل تسجيل الدخول: ${error?.message || error}`);
      }
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

  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = sidebarKey.trim();
    safeStorage.setItem('user_gemini_api_key', cleanKey);
    
    if (user && user.email) {
      try {
        await saveUserKeyToFirestore(user.email, cleanKey);
      } catch (err) {
        console.error(err);
      }
    }
    alert(cleanKey ? 'تم حفظ مفتاح Gemini API بنجاح! 🎉' : 'تم تفريغ وحذف مفتاح Gemini API بنجاح.');
    setIsEditingKey(false);
  };

  const renderApiKeySection = () => (
    <div className="pt-4 border-t border-natural-border/60 text-right space-y-3">
      <div className="flex items-center gap-1.5 justify-between">
        <span className="text-xs font-black text-[#4A4A35]">إعدادات الذكاء الاصطناعي</span>
        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-md">مفتاح Gemini</span>
      </div>
      <p className="text-[10px] text-natural-muted leading-relaxed">
        أدخل مفتاح Gemini API الخاص بك لتفعيل "تحسين البرومبت".
      </p>
      <form onSubmit={handleSaveGeminiKey} className="space-y-2">
        <div className="relative flex items-center">
          <input
            type="password"
            value={sidebarKey}
            onChange={(e) => setSidebarKey(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full text-xs rounded-xl border border-natural-border pl-10 pr-3 py-2.5 bg-white font-mono text-left focus:outline-none focus:ring-1 focus:ring-natural-primary"
          />
          <Key size={14} className="absolute left-3 text-natural-muted/60" />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-xl bg-natural-primary text-white text-[11px] font-bold py-2 transition-all hover:bg-[#4A4A35] active:scale-95 cursor-pointer"
          >
            حفظ المفتاح 💾
          </button>
          {sidebarKey && (
            <button
              type="button"
              onClick={async () => {
                setSidebarKey('');
                safeStorage.removeItem('user_gemini_api_key');
                if (user && user.email) {
                  const { deleteUserKeyFromFirestore } = await import('../lib/auth');
                  await deleteUserKeyFromFirestore(user.email);
                }
                alert('تم حذف المفتاح وتصفير الحقل بنجاح.');
              }}
              className="px-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-[11px] font-bold hover:bg-red-100 transition-colors"
            >
              حذف 🗑️
            </button>
          )}
        </div>
      </form>
      <div className="text-[9px] text-left">
        <a 
          href="https://aistudio.google.com/app/apikey" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-amber-700 font-bold hover:underline"
        >
          الحصول على مفتاح API مجاني من Google AI Studio ↗
        </a>
      </div>
    </div>
  );

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
                <div className="relative flex items-center justify-center py-2.5 px-3 border-b border-natural-border/40 bg-neutral-50/50">
                  <h2 className="text-sm font-black text-[#3A3A28] text-center">القائمة</h2>
                  <button 
                    onClick={() => setIsSidebarOpen(false)}
                    className="absolute left-2.5 p-1.5 text-natural-muted hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Sidebar Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {user ? (
                    <div className="space-y-8">
                      {/* User Info */}
                      <div className="flex flex-col items-center text-center space-y-2">
                        <div>
                          <p className="text-lg font-bold text-natural-text">{user.displayName}</p>
                          <p className="text-xs text-natural-muted">{user.email}</p>
                        </div>
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-natural-primary/10 px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-natural-primary">
                            <ShieldCheck size={12} /> المسؤول
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {/* Always available tool for all logged-in users */}
                        <div className="space-y-2 w-full">
                          <h4 className="text-[10px] text-natural-muted font-bold uppercase tracking-widest text-right mb-1">الأدوات العامة</h4>
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
                        
                        {renderApiKeySection()}

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
                    <div className="flex flex-col items-center w-full space-y-6 text-center py-3">
                      <button
                        onClick={handleLogin}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-natural-primary p-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#4A4A35] active:scale-95"
                      >
                        <LogIn size={18} />
                        تسجيل الدخول عبر غوغل
                      </button>

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

                      {renderApiKeySection()}
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
                <div className="bg-[#FAF9F5] border border-natural-border/40 rounded-xl p-3.5 space-y-1">
                  <p className="text-[11px] font-bold text-natural-primary">👤 الدخول السريع بالبريد الإلكتروني:</p>
                  <p className="text-[11px] text-[#707058] leading-relaxed">
                    أدخل بريدك الإلكتروني الشخصي للمتابعة واستخدام ميزات الذكاء الاصطناعي حصرياً. يرجى الملاحظة أنه لا يمكن للأعضاء العاديين تسجيل الدخول كمسؤول (أدمن) إلا من خلال حساب Google الرسمي المرتبط لضمان أمان النظام.
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

              <div className="flex gap-2 pt-4 border-t border-natural-border/60 justify-between items-center flex-wrap">
                <button
                  type="button"
                  onClick={async () => {
                    const cleanEmail = iframeEmail.trim().toLowerCase();
                    if (!cleanEmail) {
                      setIframeLoginError('يرجى تحديد البريد الإلكتروني للمتابعة.');
                      return;
                    }
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(cleanEmail)) {
                      setIframeLoginError('يرجى إدخال بريد إلكتروني صالح.');
                      return;
                    }

                    if (cleanEmail === ADMIN_CONFIG.email.toLowerCase()) {
                      setIframeLoginError('⚠️ غير مسموح بتسجيل الدخول كأدمن ببريد المسؤول إلا عبر حساب غوغل الرسمي لحماية الأمان والخصوصية!');
                      return;
                    }

                    try {
                      setIframeLoginError('');
                      const res = await emailSignIn(cleanEmail, iframeName.trim() || undefined);
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
                  className="flex-1 bg-natural-primary text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all hover:bg-[#4A4A35] active:scale-95 text-center cursor-pointer min-w-[120px]"
                >
                  دخول فوري ومباشر كمتصفح ⚡
                </button>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIframeEmail('');
                      setIframeName('');
                    }}
                    className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold py-2.5 px-2.5 rounded-xl text-[10px] transition-colors cursor-pointer"
                    title="تفريغ الحقول"
                  >
                    تفريغ 🗑️
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setIframeLoginError('');
                        const res = await googleSignIn();
                        if (res) {
                          setIframeLoginSuccess('تم تسجيل الدخول بنجاح عبر حساب Google! جاري تحويلك...');
                          setTimeout(() => {
                            window.location.reload();
                          }, 500);
                        }
                      } catch (err: any) {
                        setIframeLoginError('لم تنجح النافذة المنبثقة: يرجى فتح التطبيق في نافذة مستقلة لتسجيل الدخول بـ Google.');
                      }
                    }}
                    className="bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold py-2.5 px-2.5 rounded-xl text-[10px] transition-colors cursor-pointer"
                    title="تسجيل الدخول عبر Google OAuth"
                  >
                    غوغل رسمي 🌐
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
