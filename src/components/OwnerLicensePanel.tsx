import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import { 
  Users, Settings, Key, Trash2, Check, AlertCircle, 
  Shield, Clock, Search, ChevronDown, ChevronUp 
} from 'lucide-react';
import { GlobalSettings, License } from '../types';

interface OwnerLicensePanelProps {
  currentSettings: GlobalSettings;
  onUpdateSettings: (newSettings: Partial<GlobalSettings>) => Promise<void>;
  compact?: boolean;
}

export default function OwnerLicensePanel({ currentSettings, onUpdateSettings, compact = false }: OwnerLicensePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [trialDaysInput, setTrialDaysInput] = useState(currentSettings.trialDays);
  const [allFreeState, setAllFreeState] = useState(currentSettings.allFree);
  const [targetEmail, setTargetEmail] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [subscribers, setSubscribers] = useState<License[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [subscriberToDelete, setSubscriberToDelete] = useState<License | null>(null);

  useEffect(() => {
    setTrialDaysInput(currentSettings.trialDays);
    setAllFreeState(currentSettings.allFree);
  }, [currentSettings]);

  // Real-time listener for subscribers
  useEffect(() => {
    if (!isOpen) return;

    const q = query(collection(db, 'licenses'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        ...doc.data()
      })) as License[];
      setSubscribers(docs);
    }, (err) => {
      console.error('Failed to fetch subscribers:', err);
    });

    return unsubscribe;
  }, [isOpen]);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await onUpdateSettings({
        trialDays: Number(trialDaysInput),
        allFree: allFreeState
      });
      alert('تم حفظ الإعدادات بنجاح!');
    } catch (err: any) {
      alert(`فشل حفظ الإعدادات: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = targetEmail.trim().toLowerCase();
    if (!email) {
      alert('يرجى إدخال البريد الإلكتروني للمشترك');
      return;
    }

    setLoading(true);
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      const docRef = doc(db, 'licenses', email);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        await updateDoc(docRef, {
          activationCode: code
        });
      } else {
        await setDoc(docRef, {
          email,
          activationCode: code,
          activated: false,
          trialStartDate: Date.now(),
          expiryDate: null,
          activatedAt: null
        });
      }

      setGeneratedCode(code);
      setTargetEmail('');
      alert(`تم توليد كود التفعيل بنجاح للبريد الإلكتروني: ${email}`);
    } catch (err: any) {
      alert(`فشل توليد الكود: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubscriber = async (subscriber: License) => {
    try {
      await deleteDoc(doc(db, 'licenses', subscriber.email));
      setSubscriberToDelete(null);
      alert(`تم حذف المشترك ${subscriber.email} بنجاح!`);
    } catch (err: any) {
      alert(`فشل الحذف: ${err.message || err}`);
    }
  };

  const getStatusBadge = (sub: License) => {
    if (sub.activated) {
      return (
        <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md text-[9px] font-black border border-emerald-100 shadow-sm shrink-0">
          <Check size={9} />
          <span>نشط كامل 🟢</span>
        </span>
      );
    }

    const trialDays = currentSettings.trialDays;
    const elapsed = Date.now() - sub.trialStartDate;
    const trialDuration = trialDays * 24 * 60 * 60 * 1000;
    const timeLeft = trialDuration - elapsed;

    if (timeLeft > 0) {
      const daysLeft = Math.ceil(timeLeft / (24 * 60 * 60 * 1000));
      return (
        <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md text-[9px] font-black border border-amber-100 shadow-sm animate-pulse shrink-0">
          <Clock size={9} />
          <span>تجريبي ({daysLeft} ي) ⏳</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-0.5 bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded-md text-[9px] font-black border border-rose-100 shadow-sm shrink-0">
        <AlertCircle size={9} />
        <span>منتهي 🔴</span>
      </span>
    );
  };

  const filteredSubscribers = subscribers.filter(sub => {
    const isOwnerEmail = sub.email.trim().toLowerCase() === currentSettings.ownerEmail.trim().toLowerCase();
    if (isOwnerEmail) return false;
    return (
      sub.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.activationCode.includes(searchQuery)
    );
  });

  return (
    <div className={`mb-3 rounded-2xl border border-natural-primary/10 bg-white ${compact ? 'p-2' : 'p-4 shadow-sm'} overflow-hidden`} dir="rtl">
      {/* Header Toggle */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-right cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-natural-primary/10 text-natural-primary shrink-0">
            <Shield size={14} />
          </div>
          <div>
            <h3 className="text-xs font-black text-[#4A4A35]">إدارة الإشتراكات</h3>
            {!compact && (
              <p className="text-[10px] text-natural-muted font-bold">توليد أكواد التفعيل وتتبع فترات التجربة للمشتركين</p>
            )}
          </div>
        </div>
        <div className="text-natural-primary">
          {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </button>

      {isOpen && (
        <div className="mt-2.5 space-y-3.5 border-t border-natural-border/20 pt-2.5 animate-fadeIn">
          {/* Configuration Grid */}
          <div className={compact ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
            
            {/* General Settings */}
            <div className="bg-neutral-50/50 p-2.5 rounded-xl border border-natural-border/30 space-y-2.5">
              <h4 className="text-[10px] font-black text-[#4A4A35] flex items-center gap-1 border-b border-natural-border/10 pb-1">
                <Settings size={11} className="text-natural-primary" />
                <span>الإعدادات العامة</span>
              </h4>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-natural-text">الأيام التجريبية الافتراضية</label>
                <div className="flex gap-1.5">
                  <input 
                    type="number" 
                    value={trialDaysInput}
                    onChange={(e) => setTrialDaysInput(Math.max(1, Number(e.target.value)))}
                    className="w-16 rounded-lg border border-natural-border/40 bg-white px-2 py-1 text-center text-[10px] font-bold focus:border-natural-primary focus:outline-none"
                    min="1"
                  />
                  <span className="self-center text-[10px] text-natural-muted font-bold">أيام</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-1 border-t border-natural-border/5">
                <div>
                  <label className="block text-[10px] font-black text-natural-text">تعطيل نظام الدفع (مجاني للجميع) 🎁</label>
                  <p className="text-[8px] text-natural-muted font-bold">تفعيل النسخة الكاملة بدون طلب أكواد تفعيل</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={allFreeState}
                  onChange={(e) => setAllFreeState(e.target.checked)}
                  className="h-4 w-4 rounded text-natural-primary focus:ring-natural-primary border-natural-border cursor-pointer shrink-0"
                />
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={loading}
                className="w-full bg-[#4A4A35] text-white py-1.5 rounded-lg text-[10px] font-black shadow-sm hover:bg-natural-primary transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                {loading ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
              </button>
            </div>

            {/* Code Generator */}
            <div className="bg-neutral-50/50 p-2.5 rounded-xl border border-natural-border/30 space-y-2.5">
              <h4 className="text-[10px] font-black text-[#4A4A35] flex items-center gap-1 border-b border-natural-border/10 pb-1">
                <Key size={11} className="text-natural-primary" />
                <span>توليد كود تفعيل</span>
              </h4>

              <form onSubmit={handleGenerateCode} className="space-y-2">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-natural-text">البريد الإلكتروني للمشترك</label>
                  <input 
                    type="email" 
                    required
                    placeholder="example@gmail.com"
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                    className="w-full rounded-lg border border-natural-border/40 bg-white px-2 py-1 text-right text-[10px] focus:border-natural-primary focus:outline-none font-sans"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-natural-primary text-white py-1.5 rounded-lg text-[10px] font-black shadow-sm hover:bg-[#3d3d2a] transition-all cursor-pointer"
                >
                  {loading ? 'جاري التوليد...' : 'توليد الكود 🔑'}
                </button>
              </form>

              {generatedCode && (
                <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-center space-y-0.5 animate-fadeIn">
                  <p className="text-[9px] text-emerald-800 font-bold">كود التفعيل جاهز:</p>
                  <div className="font-mono text-sm font-black tracking-widest text-emerald-700 select-all">
                    {generatedCode}
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(generatedCode);
                      alert('تم نسخ الكود!');
                    }}
                    className="text-[8px] text-emerald-600 underline font-black cursor-pointer hover:text-emerald-800"
                  >
                    نسخ الكود 📋
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Subscribers List */}
          <div className="bg-white p-2 rounded-xl border border-natural-border/30 space-y-2.5">
            <div className="flex flex-col gap-1.5 border-b border-natural-border/10 pb-2">
              <h4 className="text-[10px] font-black text-[#4A4A35] flex items-center gap-1">
                <Users size={11} className="text-natural-primary" />
                <span>قائمة المشتركين ومراقبة فترات التجربة</span>
              </h4>

              {/* Search */}
              <div className="relative w-full">
                <Search className="absolute right-2 top-2 text-natural-muted" size={10} />
                <input 
                  type="text"
                  placeholder="ابحث بالبريد أو الكود..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-natural-border/30 bg-neutral-50 pr-7 pl-2 py-1 text-right text-[10px] focus:border-natural-primary focus:outline-none"
                />
              </div>
            </div>

            {/* List Table */}
            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-right text-[9px] border-collapse min-w-[280px]">
                <thead>
                  <tr className="border-b border-natural-border/10 text-natural-muted font-bold">
                    <th className="py-1.5 px-1.5">البريد الإلكتروني</th>
                    <th className="py-1.5 px-1.5 text-center">الكود</th>
                    <th className="py-1.5 px-1.5 text-center">الحالة</th>
                    <th className="py-1.5 px-1.5 text-left">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-natural-border/5">
                  {filteredSubscribers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-natural-muted font-bold">
                        لا يوجد مشتركين حالياً.
                      </td>
                    </tr>
                  ) : (
                    filteredSubscribers.map((sub) => (
                      <tr key={sub.email} className="hover:bg-neutral-50 transition-colors">
                        <td className="py-1.5 px-1.5 font-medium select-all truncate max-w-[120px]" title={sub.email}>
                          {sub.email}
                        </td>
                        <td className="py-1.5 px-1.5 text-center font-mono font-bold text-gray-700 select-all">
                          {sub.activationCode || '—'}
                        </td>
                        <td className="py-1.5 px-1.5 text-center">
                          {getStatusBadge(sub)}
                        </td>
                        <td className="py-1.5 px-1.5 text-left">
                          <button
                            onClick={() => setSubscriberToDelete(sub)}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            title="حذف"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* Deletion Dialog */}
      {subscriberToDelete && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
          <div 
            onClick={() => setSubscriberToDelete(null)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />
          <div className="relative w-full max-w-xs bg-white rounded-xl shadow-xl p-4 border border-natural-border z-10 space-y-3" dir="rtl">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertCircle size={18} className="animate-pulse" />
              <h3 className="text-xs font-black">حذف المشترك؟</h3>
            </div>
            <p className="text-[10px] text-[#4A4A35] leading-relaxed font-bold">
              هل أنت متأكد من حذف المشترك <span className="font-mono text-rose-600 break-all">{subscriberToDelete.email}</span> نهائياً؟
            </p>
            <div className="flex gap-1.5 justify-end pt-1">
              <button
                onClick={() => setSubscriberToDelete(null)}
                className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-[9px] font-black text-gray-700 cursor-pointer"
              >
                تراجع
              </button>
              <button
                onClick={() => handleDeleteSubscriber(subscriberToDelete)}
                className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 rounded-lg text-[9px] font-black text-white shadow-sm cursor-pointer"
              >
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
