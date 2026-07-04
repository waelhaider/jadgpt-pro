import React, { useState, useEffect } from 'react';
import { auth, googleProvider } from '../lib/firebase';
import { googleSignIn, emailSignIn, logout as authLogout, saveUserKeyToFirestore } from '../lib/auth';
import { safeStorage } from '../lib/safe-storage';
import { User } from 'firebase/auth';
import { LogIn, LogOut, ShieldCheck, User as UserIcon, Menu, X, PlusCircle, Edit, LayoutGrid, Key, Trash2, ChevronDown, ChevronUp, AlertTriangle, Type, Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Board } from '../types';
import BoardModals from './BoardModals';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError } from '../lib/error-handler';
import { OperationType } from '../types';
import TextEditorModal from './TextEditorModal';
import RecycleBinModal from './RecycleBinModal';
import { ADMIN_CONFIG } from '../config';
import { GlobalSettings, License } from '../types';
import OwnerLicensePanel from './OwnerLicensePanel';
import { showToast } from './Toast';

interface HeaderProps {
  user: User | null;
  isAdmin: boolean;
  currentBoard?: Board;
  activeBoardId: string | null;
  boards: Board[];
  onSelectBoard: (id: string | null) => void;
  globalSettings?: GlobalSettings;
  onUpdateSettings?: (newSettings: Partial<GlobalSettings>) => Promise<void>;
  isDarkMode?: boolean;
  setIsDarkMode?: (val: boolean) => void;
  userLicense?: License | null;
}

export default function Header({ 
  user, 
  isAdmin, 
  currentBoard, 
  activeBoardId,
  boards, 
  onSelectBoard,
  globalSettings,
  onUpdateSettings,
  isDarkMode = false,
  setIsDarkMode,
  userLicense
}: HeaderProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBoardsDrawerOpen, setIsBoardsDrawerOpen] = useState(false);
  const [isTranslatorOpen, setIsTranslatorOpen] = useState(false);
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'create' | 'edit' | 'reorder';
    targetBoard?: Board;
  }>({
    isOpen: false,
    type: 'create',
    targetBoard: undefined
  });
  const [isBoardsManagerOpen, setIsBoardsManagerOpen] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);
  const [isDeletingBoard, setIsDeletingBoard] = useState(false);
  const [sidebarKey, setSidebarKey] = useState(safeStorage.getItem('user_gemini_api_key') || '');
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  
  const [postFontSize, setPostFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('post_font_size');
    return saved ? parseInt(saved, 10) : 14;
  });
  const [isTextSizeMenuOpen, setIsTextSizeMenuOpen] = useState(false);

  const handleIncreaseFontSize = () => {
    setPostFontSize(prev => {
      const next = Math.min(28, prev + 1);
      localStorage.setItem('post_font_size', String(next));
      window.dispatchEvent(new CustomEvent('post_font_size_changed', { detail: { size: next } }));
      return next;
    });
  };

  const handleDecreaseFontSize = () => {
    setPostFontSize(prev => {
      const next = Math.max(10, prev - 1);
      localStorage.setItem('post_font_size', String(next));
      window.dispatchEvent(new CustomEvent('post_font_size_changed', { detail: { size: next } }));
      return next;
    });
  };

  useEffect(() => {
    const handleCloseMenus = () => {
      setIsTextSizeMenuOpen(false);
    };
    window.addEventListener('click', handleCloseMenus);
    return () => {
      window.removeEventListener('click', handleCloseMenus);
    };
  }, []);
  


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

  useEffect(() => {
    if (isSidebarOpen || isBoardsDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isSidebarOpen, isBoardsDrawerOpen]);

  const handleLogin = async () => {
    try {
      setIframeLoginError('');
      const res = await googleSignIn();
      if (res) {
        alert('تم تسجيل الدخول بنجاح بحساب غوغل');
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
          showToast('يرجى إدخال اسم اللوحة');
          return;
        }
        const boardData = {
          name: data.name.trim(),
          order: boards.length,
          createdAt: serverTimestamp(),
          locked: !!data.locked
        };
        console.log('Creating board with data:', boardData);
        const docRef = await addDoc(collection(db, 'boards'), boardData);
        onSelectBoard(docRef.id);
        showToast('تم إنشاء اللوحة بنجاح! تم الانتقال إليها الآن.');
      } else if (modalState.type === 'edit' && (modalState.targetBoard || currentBoard)) {
        const boardToEdit = modalState.targetBoard || currentBoard;
        if (!boardToEdit) return;
        if (!data.name?.trim()) {
          showToast('يرجى إدخال اسم اللوحة');
          return;
        }
        await updateDoc(doc(db, 'boards', boardToEdit.id), {
          name: data.name.trim(),
          locked: !!data.locked
        });
        showToast('تم تعديل اسم اللوحة بنجاح!');
      } else if (modalState.type === 'reorder') {
        console.log('Reordering boards:', data);
        // data is array of {id, order}
        for (const b of data) {
          await updateDoc(doc(db, 'boards', b.id), { order: b.order });
        }
        showToast('تم حفظ الترتيب الجديد بنجاح!');
      }
      setModalState({ ...modalState, isOpen: false });
    } catch (error) {
      console.error('Board operation error detail:', error);
      const msg = error instanceof Error ? error.message : String(error);
      showToast(`فشل تنفيذ العملية: ${msg}`);
      handleFirestoreError(error, OperationType.WRITE, 'boards');
    }
  };

  const handleDeleteBoard = async (board: Board) => {
    try {
      // 1. Fetch posts of the board
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const q = query(collection(db, 'posts'), where('boardId', '==', board.id));
      const querySnapshot = await getDocs(q);
      const postsList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      
      // 2. Import moveBoardToRecycleBin and call it
      const { moveBoardToRecycleBin } = await import('../lib/recycle-bin');
      await moveBoardToRecycleBin(board, postsList);
      
      onSelectBoard(null);
      showToast('تم نقل اللوحة وجميع منشوراتها بنجاح إلى سلة المحذوفات! 🗑️');
    } catch (err: any) {
      console.error('Failed to delete board:', err);
      showToast('حدث خطأ أثناء حذف اللوحة: ' + (err.message || err));
    }
  };

  return (
    <>
      <header className={`sticky top-0 z-40 w-full border-b backdrop-blur-md shadow-sm shrink-0 transition-colors ${isDarkMode ? 'border-[#2C374E] bg-[#1A212E]/80' : 'border-natural-border bg-white/80'}`}>
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-1 relative">
          
          {/* Left Side: Settings Menu Button */}
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className={`px-3 py-1 rounded-lg  transition-all z-10 cursor-pointer flex items-center justify-center h-8 whitespace-nowrap ${
              isDarkMode 
                ? 'text-emerald-50 ' 
                : 'text-[#000000] bg-[#ffffff] hover:bg-[#ffffff] hover:text-[#166534] '
            }`}
            title="الأدوات"
          >
            <Menu size={25} className={isDarkMode ? 'text-emerald-50' : 'text-[#15803d]'} />
          </button>

          {/* Absolute Centered Logo/Name */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto cursor-pointer" onClick={() => setIsTranslatorOpen(true)}>
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-natural-primary shadow-xs border border-natural-border/10">
                <img 
                  src="/logo.png" 
                  alt="JADGPT Logo" 
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="text-white font-black text-base">J</div>';
                  }}
                />
              </div>
              <h1 className={`text-lg sm:text-xl font-black tracking-tight ${
                isDarkMode 
                  ? 'bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent' 
                  : 'text-[#15803d]'
              }`}>
                JADGPT
              </h1>
            </div>
          </div>
          
          {/* Right Side: Boards Drawer Button */}
          <button 
            onClick={() => setIsBoardsDrawerOpen(true)}
            className={`px-2 py-1 text-[12px] sm:text-xs md:text-sm font-bold rounded-lg border shadow-xs transition-all z-10 cursor-pointer flex items-center justify-center h-8 whitespace-nowrap ${
              isDarkMode 
                ? 'text-[#16af75] bg-[#00000029] hover:bg-[#007662] border-[#6980b0] pulsate-btn-dark' 
                : 'text-[#c26700] bg-[#fffaf5] shadow-md hover:bg-[#fef3e6] hover:border-[#c26700]/40 border border-[#cbd5e1] pulsate-btn-light'
            }`}
            title="لوحات كاملة"
          >
            لوحات كاملة
          </button>

        </div>
      </header>

      {/* Boards Drawer (Slides in from the right) */}
      <AnimatePresence>
        {isBoardsDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBoardsDrawerOpen(false)}
              className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed inset-y-0 right-0 z-[1001] w-72 shadow-2xl transition-colors border-l ${
                isDarkMode 
                  ? 'bg-[#151D2A] text-white border-[#2C374E]' 
                  : 'bg-white text-natural-text border-natural-border'
              }`}
              dir="rtl"
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className={`relative flex items-center justify-center py-2.5 px-3 border-b transition-colors ${
                  isDarkMode 
                    ? 'border-[#2C374E] bg-[#111822]' 
                    : 'border-natural-border/40 bg-neutral-50/50'
                }`}>
                  <h2 className={`text-sm font-black text-center ${isDarkMode ? 'text-white' : 'text-[#3A3A28]'}`}>الأقسام واللوحات</h2>
                  <button 
                    onClick={() => setIsBoardsDrawerOpen(false)}
                    className={`absolute right-2.5 p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isDarkMode ? 'text-[#B4C6D8] hover:bg-[#1A212E]' : 'text-natural-muted hover:bg-neutral-100'
                    }`}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <p className={`text-xs font-bold mb-4 text-center leading-relaxed ${
                    isDarkMode ? 'text-[#B4C6D8]' : 'text-natural-muted'
                  }`}>
                    تصفح جميع أقسام ولوحات توليد الصور الذكية
                  </p>

                  <div className="space-y-2">
                    {/* Main Feed option */}
                    <button
                      onClick={() => {
                        onSelectBoard(null);
                        setIsBoardsDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                        currentBoard === undefined && activeBoardId !== 'prompt-builder' && activeBoardId !== 'user-board'
                          ? (isDarkMode 
                              ? 'bg-[#008D75] border-[#008D75] text-white shadow-md font-normal' 
                              : 'bg-natural-primary border-natural-primary text-white shadow-md font-normal')
                          : (isDarkMode
                              ? 'bg-[#111822] border-[#2C374E] hover:bg-[#1A212E] text-white font-normal'
                              : 'bg-white border-natural-border hover:bg-natural-secondary-bg text-natural-text font-normal')
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-lg">🏡</span>
                        <span> الرئيسية</span>
                      </span>
                      {currentBoard === undefined && activeBoardId !== 'prompt-builder' && activeBoardId !== 'user-board' && (
                        <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      )}
                    </button>

                    {/* Dynamic Boards */}
                    {boards.map((board) => {
                      const isSelected = currentBoard?.id === board.id;
                      return (
                        <button
                          key={board.id}
                          onClick={() => {
                            onSelectBoard(board.id);
                            setIsBoardsDrawerOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                            isSelected
                              ? (isDarkMode 
                                  ? 'bg-[#008D75] border-[#008D75] text-white shadow-md font-normal' 
                                  : 'bg-natural-primary border-natural-primary text-white shadow-md font-normal')
                              : (isDarkMode
                                  ? 'bg-[#111822] border-[#2C374E] hover:bg-[#1A212E] text-white font-normal'
                                  : 'bg-white border-natural-border hover:bg-natural-secondary-bg text-natural-text font-normal')
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-lg">{board.locked ? '🔒' : '📁'}</span>
                            <span>{board.name}</span>
                          </span>
                          {isSelected && (
                            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed inset-y-0 left-0 z-[1001] w-72 shadow-2xl transition-colors border-r ${
                isDarkMode 
                  ? 'bg-[#151D2A] text-white border-[#2C374E]' 
                  : 'bg-white text-natural-text border-natural-border'
              }`}
              dir="rtl"
            >
              <div className="flex flex-col h-full">
                {/* Sidebar Header */}
                <div className={`relative flex items-center justify-center py-2.5 px-3 border-b transition-colors ${
                  isDarkMode 
                    ? 'border-[#2C374E] bg-[#111822]' 
                    : 'border-natural-border/40 bg-neutral-50/50'
                }`}>
                  <h2 className={`text-sm font-black text-center ${isDarkMode ? 'text-white' : 'text-[#3A3A28]'}`}>القائمة</h2>
                  <button 
                    onClick={() => setIsSidebarOpen(false)}
                    className={`absolute left-2.5 p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isDarkMode ? 'text-[#B4C6D8] hover:bg-[#1A212E]' : 'text-natural-muted hover:bg-neutral-100'
                    }`}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Sidebar Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {user ? (
                    <div className="space-y-6">
                      {/* User Info */}
                      <div className="flex flex-col items-center text-center space-y-2">
                        <div>
                          <p className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-natural-text'}`}>{user.displayName}</p>
                          <p className={`text-xs ${isDarkMode ? 'text-[#B4C6D8]' : 'text-natural-muted'}`}>{user.email}</p>
                        </div>
                        {userLicense?.activated === true && (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black transition-colors ${
                            isDarkMode 
                              ? 'bg-[#008D75]/15 text-[#00C4A3]' 
                              : 'bg-[#e6f4ea] text-[#008D75]'
                          }`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"></span>
                            مشترك بنسخة كاملة
                          </span>
                        )}
                        {isAdmin && (
                         <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-normal uppercase tracking-wider transition-colors ${
                           isDarkMode 
                             ? 'bg-[#F9F3DC] text-[#ca3500]' 
                             : 'bg-[#e6f4ea] text-[#ca3500]'
                         }`}>
                         <ShieldCheck size={12} /> المسؤول
                         </span>
                        )}
                      </div>

                      {/* Dark Mode Switch */}
                      <div className={`flex items-center justify-between w-full p-3 rounded-2xl border transition-all ${
                        isDarkMode 
                          ? 'bg-[#111822] border-[#2C374E] text-white' 
                          : 'bg-[#FAF9F5] border-natural-border text-natural-text'
                      }`}>
                        <div className="flex items-center gap-2 font-sans">
                          {isDarkMode ? <Moon size={16} className="text-[#EEA396]" /> : <Sun size={16} className="text-[#008D75]" />}
                          <span className="text-xs font-black">المظهر الداكن</span>
                        </div>
                        <button
                          onClick={() => setIsDarkMode(!isDarkMode)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isDarkMode ? 'bg-[#008D75]' : 'bg-[#414C5D]/30'
                          }`}
                          dir="ltr"
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              isDarkMode ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="space-y-2">
                        {/* Always available tool for all logged-in users */}
                              <div className="flex items-center justify-between gap-2 w-full">
                            {/* Button 1: تعديل النص */}
                            <button
                              onClick={() => {
                                setIsSidebarOpen(false);
                                setIsTranslatorOpen(true);
                              }}
                              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all border border-dashed text-xs font-bold cursor-pointer ${
                                isDarkMode 
                                  ? 'border-[#2C374E] text-white hover:bg-[#111822] hover:border-[#008D75]' 
                                  : 'border-natural-border text-natural-text hover:bg-natural-secondary-bg hover:border-natural-primary'
                              }`}
                            >
                              <Edit size={16} className={`${isDarkMode ? 'text-[#008D75]' : 'text-natural-primary'} animate-pulse`} />
                              <span className="whitespace-nowrap">تعديل النص</span>
                            </button>

                            {/* Button 2: حجم النصوص */}
                            <div className="relative flex-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsTextSizeMenuOpen(!isTextSizeMenuOpen);
                                }}
                                className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all border border-dashed text-xs font-bold cursor-pointer ${
                                  isDarkMode
                                    ? (isTextSizeMenuOpen ? 'border-[#008D75] bg-[#111822] text-white' : 'border-[#2C374E] text-white hover:bg-[#111822]')
                                    : (isTextSizeMenuOpen ? 'border-natural-primary bg-natural-secondary-bg text-natural-text' : 'border-natural-border text-natural-text hover:bg-natural-secondary-bg hover:border-natural-primary')
                                }`}
                              >
                                <Type size={16} className={isDarkMode ? 'text-[#008D75]' : 'text-natural-primary'} />
                                <span className="whitespace-nowrap">حجم النصوص</span>
                              </button>

                              <AnimatePresence>
                                {isTextSizeMenuOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                    className={`absolute left-0 mt-1.5 z-50 min-w-[130px] border rounded-xl shadow-md p-2 flex items-center justify-between gap-2 transition-colors ${
                                      isDarkMode ? 'bg-[#111822] border-[#2C374E] text-white' : 'bg-white border-natural-border text-natural-text'
                                    }`}
                                    onClick={(e) => e.stopPropagation()}
                                    dir="ltr"
                                  >
                                    <button
                                      onClick={handleDecreaseFontSize}
                                      className={`w-7 h-7 flex items-center justify-center rounded-lg font-black transition-colors cursor-pointer text-sm ${
                                        isDarkMode ? 'bg-[#1A212E] hover:bg-[#151D2A] text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-natural-text'
                                      }`}
                                      title="تصغير"
                                    >
                                      -
                                    </button>
                                    <span className={`text-xs font-bold font-mono ${isDarkMode ? 'text-white' : 'text-natural-text'}`}>
                                      {postFontSize}px
                                    </span>
                                    <button
                                      onClick={handleIncreaseFontSize}
                                      className={`w-7 h-7 flex items-center justify-center rounded-lg font-black transition-colors cursor-pointer text-sm ${
                                        isDarkMode ? 'bg-[#1A212E] hover:bg-[#151D2A] text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-natural-text'
                                      }`}
                                      title="تكبير"
                                    >
                                      +
                                    </button>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        </div>

                        {isAdmin && (
                          <div className={`space-y-2 w-full p-1 rounded-xl border border-solid transition-all duration-200 hover:border-dashed ${
                            isDarkMode 
                              ? 'border-[#2C374E] hover:border-[#008D75]' 
                              : 'border-[#efece1] hover:border-[#4A4A35] bg-[#FAF9F5]'
                          }`}>
                            {/* Toggle Button for Boards Management */}
                            <button
                              type="button"
                              onClick={() => setIsBoardsManagerOpen(!isBoardsManagerOpen)}
                              className={`flex w-full items-center justify-between p-2 rounded-xl transition-colors cursor-pointer text-right ${
                                isDarkMode ? 'hover:bg-[#111822] text-white' : ' text-natural-text'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <LayoutGrid size={16} className={`${isDarkMode ? 'text-[#008D75]' : 'text-natural-primary'} animate-pulse`} />
                                <span className={`text-sm font-black ${isDarkMode ? 'text-white' : 'text-[#4A4A35]'}`}>إدارة اللوحات</span>
                              </div>
                              {isBoardsManagerOpen ? (
                                <ChevronUp size={16} className="text-natural-muted" />
                              ) : (
                                <ChevronDown size={16} className="text-natural-muted" />
                              )}
                            </button>

                            {/* Collapsible Content */}
                            <AnimatePresence>
                              {isBoardsManagerOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden space-y-2.5 pr-2 pl-1"
                                >
                                  {/* Quick Actions */}
                                  <div className="flex gap-2 mb-2 pt-1">
                                    <button
                                      onClick={() => {
                                        setModalState({ isOpen: true, type: 'create', targetBoard: undefined });
                                      }}
                                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                                        isDarkMode 
                                          ? 'bg-[#111822] border-[#2C374E] text-white hover:bg-[#1A212E]' 
                                          : 'bg-[#FAF9F5] hover:bg-[#F4F4EB] text-natural-primary border border-natural-border/60'
                                      }`}
                                    >
                                      <PlusCircle size={14} />
                                      <span>لوحة جديدة</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setModalState({ isOpen: true, type: 'reorder', targetBoard: undefined });
                                      }}
                                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                                        isDarkMode 
                                          ? 'bg-[#111822] border-[#2C374E] text-white hover:bg-[#1A212E]' 
                                          : 'bg-[#FAF9F5] hover:bg-[#F4F4EB] text-natural-primary border border-natural-border/60'
                                      }`}
                                    >
                                      <LayoutGrid size={14} />
                                      <span>ترتيب اللوحات</span>
                                    </button>
                                  </div>

                                  {/* Boards List */}
                                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                                    {boards.map((b) => (
                                      <div
                                        key={b.id}
                                        className="flex items-center justify-between p-2 rounded-xl border border-natural-border bg-[#FAF9F5]/60 hover:bg-[#FAF9F5] hover:border-natural-primary/30 transition-all gap-2"
                                      >
                                        <span className="text-[13px] font-bold text-[#4A4A35] truncate flex-1 text-right flex items-center gap-1">
                                          {b.locked && <span className="text-xs shrink-0 select-none">🔒</span>}
                                          <span>{b.name}</span>
                                        </span>
                                        
                                        <div className="flex items-center gap-1 shrink-0">
                                          {/* Edit Name Button */}
                                          <button
                                            onClick={() => {
                                              setModalState({ isOpen: true, type: 'edit', targetBoard: b });
                                            }}
                                            className="p-1 text-natural-primary hover:bg-white hover:text-[#4A4A35] rounded-md border border-transparent hover:border-natural-border transition-all cursor-pointer"
                                            title="تعديل الاسم"
                                          >
                                            <Edit size={14} />
                                          </button>
                                          
                                          {/* Delete Button */}
                                          <button
                                            onClick={() => {
                                              setBoardToDelete(b);
                                            }}
                                            className="p-1 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-md border border-transparent hover:border-red-200 transition-all cursor-pointer"
                                            title="حذف اللوحة"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {isAdmin && globalSettings && onUpdateSettings && (
                          <div className="w-full">
                            <OwnerLicensePanel 
                              currentSettings={globalSettings} 
                              onUpdateSettings={onUpdateSettings} 
                              compact={true} 
                              isDarkMode={isDarkMode}
                            />
                          </div>
                        )}

                        {isAdmin && (
                          <div className={`space-y-2 w-full pt-1 border-t ${isDarkMode ? 'border-[#2C374E]' : 'border-natural-border'}`}>
                            
                            <button
                              onClick={() => {
                                setIsSidebarOpen(false);
                                setIsRecycleBinOpen(true);
                              }}
                              className={`flex w-full items-center gap-3 p-2 rounded-xl transition-all border cursor-pointer shadow-sm font-black ${
                                isDarkMode 
                                  ? 'bg-[#1C1517] hover:bg-[#2A1D1F] text-red-400 border-red-950/60 hover:border-dashed hover:border-red-500/50' 
                                  : 'bg-red-50/80 hover:bg-red-100 text-red-700 border-red-100 hover:border-dashed hover:border-red-300'
                              }`}
                            >
                              <Trash2 size={18} className="text-red-500 animate-pulse" />
                              <span className="text-sm">المحذوفات</span>
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
                  ) : (
                    <div className="flex flex-col items-center w-full space-y-6 text-center py-3">
                      <button
                        onClick={handleLogin}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-natural-primary p-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#4A4A35] active:scale-95 cursor-pointer"
                      >
                        <LogIn size={16} />
                        تسجيل الدخول عبر غوغل
                      </button>

                      {/* Dark Mode Switch for Guests */}
                      <div className={`flex items-center justify-between w-full p-3 rounded-2xl border transition-all ${
                        isDarkMode 
                          ? 'bg-[#111822] border-[#2C374E] text-white' 
                          : 'bg-[#FAF9F5] border-natural-border text-natural-text'
                      }`}>
                        <div className="flex items-center gap-2 font-sans">
                          {isDarkMode ? <Moon size={16} className="text-[#EEA396]" /> : <Sun size={16} className="text-[#008D75]" />}
                          <span className="text-xs font-black">المظهر الداكن</span>
                        </div>
                        <button
                          onClick={() => setIsDarkMode(!isDarkMode)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isDarkMode ? 'bg-[#008D75]' : 'bg-[#414C5D]/30'
                          }`}
                          dir="ltr"
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              isDarkMode ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Tool Button for Guests as well */}
                      <div className={`w-full pt-6 border-t space-y-2 ${isDarkMode ? 'border-[#2C374E]' : 'border-natural-border'}`}>
                        <h4 className={`text-[10px] font-bold uppercase tracking-widest text-right ${isDarkMode ? 'text-[#B4C6D8]' : 'text-natural-muted'}`}>الأدوات العامة</h4>
                        <div className="flex items-center justify-between gap-2 w-full">
                          {/* Button 1: تعديل النص */}
                          <button
                            onClick={() => {
                              setIsSidebarOpen(false);
                              setIsTranslatorOpen(true);
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all border border-dashed text-xs font-bold cursor-pointer ${
                              isDarkMode 
                                ? 'border-[#2C374E] text-white hover:bg-[#111822] hover:border-[#008D75]' 
                                : 'border-natural-border text-natural-text hover:bg-natural-secondary-bg hover:border-natural-primary'
                            }`}
                          >
                            <Edit size={16} className={`${isDarkMode ? 'text-[#008D75]' : 'text-natural-primary'} animate-pulse`} />
                            <span className="whitespace-nowrap">تعديل النص</span>
                          </button>

                          {/* Button 2: حجم النصوص */}
                          <div className="relative flex-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsTextSizeMenuOpen(!isTextSizeMenuOpen);
                              }}
                              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all border border-dashed text-xs font-bold cursor-pointer ${
                                isDarkMode
                                  ? (isTextSizeMenuOpen ? 'border-[#008D75] bg-[#111822] text-white' : 'border-[#2C374E] text-white hover:bg-[#111822]')
                                  : (isTextSizeMenuOpen ? 'border-natural-primary bg-natural-secondary-bg text-natural-text' : 'border-natural-border text-natural-text hover:bg-natural-secondary-bg hover:border-natural-primary')
                              }`}
                            >
                              <Type size={16} className={isDarkMode ? 'text-[#008D75]' : 'text-natural-primary'} />
                              <span className="whitespace-nowrap">حجم النصوص</span>
                            </button>

                            <AnimatePresence>
                              {isTextSizeMenuOpen && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                  className={`absolute left-0 mt-1.5 z-50 min-w-[130px] border rounded-xl shadow-md p-2 flex items-center justify-between gap-2 transition-colors ${
                                    isDarkMode ? 'bg-[#111822] border-[#2C374E] text-white' : 'bg-white border-natural-border text-natural-text'
                                  }`}
                                  onClick={(e) => e.stopPropagation()}
                                  dir="ltr"
                                >
                                  <button
                                    onClick={handleDecreaseFontSize}
                                    className={`w-7 h-7 flex items-center justify-center rounded-lg font-black transition-colors cursor-pointer text-sm ${
                                      isDarkMode ? 'bg-[#1A212E] hover:bg-[#151D2A] text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-natural-text'
                                    }`}
                                    title="تصغير"
                                  >
                                    -
                                  </button>
                                  <span className={`text-xs font-bold font-mono ${isDarkMode ? 'text-white' : 'text-natural-text'}`}>
                                    {postFontSize}px
                                  </span>
                                  <button
                                    onClick={handleIncreaseFontSize}
                                    className={`w-7 h-7 flex items-center justify-center rounded-lg font-black transition-colors cursor-pointer text-sm ${
                                      isDarkMode ? 'bg-[#1A212E] hover:bg-[#151D2A] text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-natural-text'
                                    }`}
                                    title="تكبير"
                                  >
                                    +
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>

                      {renderApiKeySection()}
                    </div>
                  )}
                </div>

                {/* Sidebar Footer */}
                <div className="p-6 text-center border-t border-natural-border">
                  <p className="text-[10px] text-natural-muted uppercase tracking-widest">JADGPT CMS v1.7</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BoardModals
        isOpen={modalState.isOpen}
        type={modalState.type}
        board={modalState.targetBoard || currentBoard}
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

      <RecycleBinModal
        isOpen={isRecycleBinOpen}
        onClose={() => setIsRecycleBinOpen(false)}
      />

      {/* Board Deletion Custom Confirmation Modal (Iframe Safe) */}
      <AnimatePresence>
        {boardToDelete && (
          <div className="fixed inset-0 z-[2600] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBoardToDelete(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-right z-10 border border-red-100"
              dir="rtl"
            >
              <div className="flex items-center gap-2 text-red-600 pb-3 border-b border-neutral-100 mb-4">
                <AlertTriangle size={24} className="text-red-500 animate-pulse" />
                <h4 className="text-base font-black text-red-700">تنبيه أمان صارم! ⚠️</h4>
              </div>

              <div className="space-y-3 mb-6">
                <p className="text-xs text-natural-text leading-relaxed font-bold">
                  هل أنت متأكد من نقل لوحة <span className="font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded">"{boardToDelete.name}"</span> مع جميع منشوراتها ونقلها إلى سلة المحذوفات؟
                </p>
                <p className="text-[10px] text-natural-muted leading-relaxed font-medium">
                  * سيتم نقل اللوحة مع جميع محتوياتها مؤقتاً إلى سلة المحذوفات ويمكنك استعادتها من هناك لاحقاً إذا أردت.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={isDeletingBoard}
                  onClick={() => setBoardToDelete(null)}
                  className="px-4 py-2.5 rounded-xl border border-natural-border text-xs font-bold text-natural-text hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  إلغاء الأمر
                </button>
                <button
                  type="button"
                  disabled={isDeletingBoard}
                  onClick={async () => {
                    setIsDeletingBoard(true);
                    try {
                      await handleDeleteBoard(boardToDelete);
                    } finally {
                      setIsDeletingBoard(false);
                      setBoardToDelete(null);
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isDeletingBoard ? 'جاري النقل...' : 'نعم، انقل لسلة المحذوفات 🗑️'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Iframe Safe Custom Login Modal */}
      <AnimatePresence>
        {iframeLoginOpen && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
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
                          setIframeLoginSuccess('تم تسجيل الدخول بنجاح عبر حساب Google!');
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
