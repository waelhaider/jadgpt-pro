import React, { useState } from 'react';
import { auth, googleProvider } from '../lib/firebase';
import { googleSignIn, emailSignIn, logout as authLogout } from '../lib/auth';
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
  const [sidebarKey, setSidebarKey] = useState(localStorage.getItem('user_gemini_api_key') || '');
  const [isEditingKey, setIsEditingKey] = useState(false);
  
  // Fast email login state
  const [fastEmail, setFastEmail] = useState('');
  const [fastName, setFastName] = useState('');

  React.useEffect(() => {
    if (isSidebarOpen) {
      setSidebarKey(localStorage.getItem('user_gemini_api_key') || '');
    }
  }, [isSidebarOpen]);

  const handleLogin = async () => {
    // Check if running inside an iframe (such as the AI Studio integrated preview)
    const isIframe = window.self !== window.top;
    if (isIframe) {
      alert('⚠️ تنبيه هام: تسجيل الدخول بواسطة Google غير مدعوم مباشرةً داخل نافذة المعاينة (IFrame) بسبب قيود الحماية في متصفحك. يرجى فتح التطبيق في نافذة/تبويب جديد بالضغط على زر (فتح في نافذة جديدة) أعلى المتصفح، أو استخدم خيار (الدخول الفوري بالبريد الإلكتروني) بالأسفل للتمتع بالتوليد فوراً.');
      window.open(window.location.href, '_blank');
      return;
    }

    try {
      const res = await googleSignIn();
      if (res) {
        alert('تم تسجيل الدخول بنجاح! 🎉');
      }
      setIsSidebarOpen(false);
    } catch (error: any) {
      console.error('Login failed:', error);
      const isPopupBlocked = error?.code === 'auth/popup-blocked' || error?.message?.toLowerCase().includes('popup-blocked') || error?.message?.toLowerCase().includes('popup');
      const isUnauthorizedDomain = error?.code === 'auth/unauthorized-domain' || error?.message?.toLowerCase().includes('unauthorized-domain');
      
      if (isUnauthorizedDomain) {
        alert(`⚠️ خطأ في عنوان الموقع (Unauthorized Domain):
نظراً لأن المشروع يشتغل في خادم معاينة مؤقت، لم يتم إضافة هذا الرابط (${window.location.hostname}) لقائمة المواقع الموثوقة بمشروعك في Firebase.

لتخطي هذا القيد فوراً والاستمتاع بالتوليد:
1. استخدم نموذج "الدخول الفوري بالبريد الإلكتروني" في القائمة لإدخال إيميلك الشخصي مباشرة وبدء التوليد فوراً بقوة السيرفر.
2. أو أضف هذا النطاق (${window.location.hostname}) في لوحة تحكم Firebase بمشروعك (Authentication -> Settings -> Authorized domains).`);
      } else if (isPopupBlocked) {
        alert('❌ تم حظر النافذة المنبثقة! يرجى السماح بالنوافذ المنبثقة (Popups) في إعدادات متصفحك لإتمام تسجيل الدخول باستخدام Google.');
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

                          {/* API Key management for logged in users */}
                          <div className="bg-neutral-50 border border-natural-border/60 rounded-xl p-3 mt-3 text-right">
                            <div className="flex items-center gap-1.5 justify-between">
                              <span className="text-[10px] font-black text-[#4A4A35]">مفتاح Gemini API الشخصي</span>
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${sidebarKey ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {sidebarKey ? 'محفوظ' : 'غير محفوظ'}
                              </span>
                            </div>
                            {isEditingKey ? (
                              <div className="space-y-1.5 pt-1.5">
                                <input
                                  type="password"
                                  value={sidebarKey}
                                  onChange={(e) => {
                                    setSidebarKey(e.target.value);
                                    localStorage.setItem('user_gemini_api_key', e.target.value.trim());
                                  }}
                                  placeholder="ألصق AI Studio API Key"
                                  className="w-full text-xs rounded-lg border border-natural-border px-2.5 py-1.5 bg-white font-bold text-natural-text focus:outline-none text-right"
                                />
                                <div className="flex gap-1.5 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!sidebarKey.trim()) {
                                        localStorage.removeItem('user_gemini_api_key');
                                        setSidebarKey('');
                                      }
                                      setIsEditingKey(false);
                                    }}
                                    className="text-[9px] bg-natural-primary text-white font-bold rounded px-2 py-1"
                                  >
                                    تأكيد وحفظ
                                  </button>
                                  {sidebarKey && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        localStorage.removeItem('user_gemini_api_key');
                                        setSidebarKey('');
                                        setIsEditingKey(false);
                                      }}
                                      className="text-[9px] bg-red-50 text-red-600 rounded px-2 py-1 border border-red-100"
                                    >
                                      حذف
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between pt-1">
                                <p className="text-[9px] text-[#8C8C70]">لتجريب برومبت الصور مجاناً.</p>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingKey(true)}
                                  className="text-[9px] text-natural-primary hover:underline font-bold"
                                >
                                  {sidebarKey ? 'تعديل المفتاح' : 'إضافة مفتاح'}
                                </button>
                              </div>
                            )}
                          </div>
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

                        {/* API Key management for guests */}
                        <div className="bg-neutral-50 border border-natural-border/60 rounded-xl p-3 mt-3 text-right">
                          <div className="flex items-center gap-1.5 justify-between">
                            <span className="text-[10px] font-black text-[#4A4A35]">مفتاح Gemini API الشخصي</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${sidebarKey ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {sidebarKey ? 'محفوظ' : 'غير محفوظ'}
                            </span>
                          </div>
                          {isEditingKey ? (
                            <div className="space-y-1.5 pt-1.5">
                              <input
                                  type="password"
                                  value={sidebarKey}
                                  onChange={(e) => {
                                    setSidebarKey(e.target.value);
                                    localStorage.setItem('user_gemini_api_key', e.target.value.trim());
                                  }}
                                  placeholder="ألصق AI Studio API Key"
                                  className="w-full text-xs rounded-lg border border-natural-border px-2.5 py-1.5 bg-white font-bold text-natural-text focus:outline-none text-right"
                              />
                              <div className="flex gap-1.5 justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                      if (!sidebarKey.trim()) {
                                        localStorage.removeItem('user_gemini_api_key');
                                        setSidebarKey('');
                                      }
                                      setIsEditingKey(false);
                                    }}
                                    className="text-[9px] bg-natural-primary text-white font-bold rounded px-2 py-1"
                                >
                                  تأكيد وحفظ
                                </button>
                                {sidebarKey && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                          localStorage.removeItem('user_gemini_api_key');
                                          setSidebarKey('');
                                          setIsEditingKey(false);
                                        }}
                                        className="text-[9px] bg-red-50 text-red-600 rounded px-2 py-1 border border-red-100"
                                    >
                                      حذف
                                    </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between pt-1">
                              <p className="text-[9px] text-[#8C8C70]">لتجريب برومبت الصور مجاناً.</p>
                              <button
                                  type="button"
                                  onClick={() => setIsEditingKey(true)}
                                  className="text-[9px] text-natural-primary hover:underline font-bold"
                              >
                                {sidebarKey ? 'تعديل المفتاح' : 'إضافة مفتاح'}
                              </button>
                            </div>
                          )}
                        </div>
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
    </>
  );
}
