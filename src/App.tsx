/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { salesCollection } from './firebase';
import moment from 'moment-hijri';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Lock, 
  Unlock, 
  TrendingUp, 
  Package, 
  Home, 
  Calendar,
  X,
  Check,
  LayoutGrid,
  List,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Set locale to Arabic for moment
moment.locale('ar-SA');

interface SaleEntry {
  id?: string;
  date: string; // ISO string
  hijriDate: string;
  purchasedTemplates: number;
  totalSales: number;
  remainingTemplates: string;
  mosqueTemplates: number;
  timestamp: number;
  createdAt?: string; // Formatted time
}

const ADMIN_PIN = "1234";

export default function App() {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [lastDeletedData, setLastDeletedData] = useState<SaleEntry[] | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimer, setUndoTimer] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [newEntryId, setNewEntryId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [adminPin, setAdminPin] = useState(() => localStorage.getItem('taybah_admin_pin') || "1234");
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SaleEntry | null>(null);
  const [loading, setLoading] = useState(true);

  // Long press logic
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isPressing = useRef(false);

  useEffect(() => {
    // نستخدم استعلاماً بسيطاً بدون ترتيب لتجنب الحاجة لإنشاء "فهرس" (Index) في فايربيز
    const q = query(salesCollection);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SaleEntry[];
      
      // نقوم بالترتيب بالكامل داخل التطبيق لضمان الدقة وتجنب الأخطاء
      const sortedData = data.sort((a, b) => {
        // أولاً: الترتيب حسب التاريخ (الأحدث أولاً)
        if (a.date !== b.date) {
          return b.date.localeCompare(a.date);
        }
        // ثانياً: إذا كان نفس التاريخ، نرتب حسب وقت الإضافة (الأحدث أولاً)
        return (b.timestamp || 0) - (a.timestamp || 0);
      });

      setSales([...sortedData]);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleStartPress = () => {
    isPressing.current = true;
    longPressTimer.current = setTimeout(() => {
      if (isPressing.current) {
        if (isAdmin) {
          setIsAdmin(false);
        } else {
          setShowPinModal(true);
        }
      }
    }, 3000);
  };

  const handleEndPress = () => {
    isPressing.current = false;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === adminPin) {
      setIsAdmin(true);
      setShowPinModal(false);
      setPin("");
    } else {
      alert("الرمز السري غير صحيح");
      setPin("");
    }
  };

  const handleChangePin = (newPin: string) => {
    if (newPin.length !== 4) {
      alert("يجب أن يكون الرمز مكوناً من 4 أرقام");
      return;
    }
    setAdminPin(newPin);
    localStorage.setItem('taybah_admin_pin', newPin);
    alert("تم تغيير رمز المرور بنجاح");
    setShowSettingsModal(false);
  };

  const totals = sales.reduce((acc, curr) => ({
    purchased: acc.purchased + (Number(curr.purchasedTemplates) || 0) + (Number(curr.mosqueTemplates) || 0),
    sales: acc.sales + (Number(curr.totalSales) || 0),
    mosque: acc.mosque + (Number(curr.mosqueTemplates) || 0),
  }), { purchased: 0, sales: 0, mosque: 0 });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("هل أنت متأكد من حذف هذا السجل؟")) {
      try {
        await deleteDoc(doc(salesCollection, id));
        showToast("تم حذف السجل بنجاح");
      } catch (error) {
        console.error("Delete error:", error);
        showToast("فشل حذف السجل", "error");
      }
    }
  };

  const handleFormat = async () => {
    if (resetPin !== adminPin) {
      showToast("الرمز السري غير صحيح", "error");
      return;
    }

    try {
      const backup = [...sales];
      // Delete all docs
      const deletePromises = sales.map(s => s.id ? deleteDoc(doc(salesCollection, s.id)) : Promise.resolve());
      await Promise.all(deletePromises);
      
      setLastDeletedData(backup);
      setShowUndo(true);
      setShowResetConfirm(false);
      setResetPin("");
      showToast("تم فرمتة النظام بنجاح");

      // Set 10 minute timer for undo
      const timer = window.setTimeout(() => {
        setShowUndo(false);
        setLastDeletedData(null);
      }, 10 * 60 * 1000);
      setUndoTimer(timer);
    } catch (error) {
      showToast("فشل في فرمتة النظام", "error");
    }
  };

  const handleUndo = async () => {
    if (!lastDeletedData) return;
    try {
      const restorePromises = lastDeletedData.map(entry => {
        const { id, ...data } = entry;
        return addDoc(salesCollection, data);
      });
      await Promise.all(restorePromises);
      setShowUndo(false);
      setLastDeletedData(null);
      if (undoTimer) clearTimeout(undoTimer);
      showToast("تم استعادة البيانات بنجاح");
    } catch (error) {
      showToast("فشل في استعادة البيانات", "error");
    }
  };

  return (
    <div className="min-h-screen pb-20 font-sans selection:bg-ramadan-gold/30 bg-ramadan-cream text-ramadan-dark">
      {/* Header */}
      <header className="bg-ramadan-green text-ramadan-cream p-6 rounded-b-[2rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-ramadan-gold/10 rounded-full -mr-16 -mt-16 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-ramadan-gold/10 rounded-full -ml-12 -mb-12 blur-xl" />
        
        <div className="relative z-10 flex justify-between items-start">
          <div className="w-10" /> {/* Spacer */}
          
          <div className="flex flex-col items-center">
            <div 
              onMouseDown={handleStartPress}
              onMouseUp={handleEndPress}
              onTouchStart={handleStartPress}
              onTouchEnd={handleEndPress}
              className="cursor-pointer select-none active:scale-95 transition-transform"
            >
              <h1 className="text-3xl font-serif font-bold text-ramadan-gold mb-1">طيبة</h1>
              <p className="text-sm opacity-80 font-medium">نظام إدارة المبيعات اليومية</p>
            </div>
            
            {isAdmin && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex items-center gap-1 bg-ramadan-gold/20 px-3 py-1 rounded-full border border-ramadan-gold/30"
              >
                <Unlock size={14} className="text-ramadan-gold" />
                <span className="text-xs font-bold text-ramadan-gold">وضع الإدارة</span>
              </motion.div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {isAdmin && (
              <button 
                onClick={() => setShowSettingsModal(true)}
                className="bg-white/10 hover:bg-white/20 text-ramadan-gold p-2 rounded-full backdrop-blur-sm border border-ramadan-gold/20 active:scale-90 transition-all"
              >
                <Settings size={20} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <main className="px-4 -mt-8 relative z-20">
        <div className="grid grid-cols-3 gap-3">
          <StatCard 
            label="إجمالي القوالب" 
            value={totals.purchased} 
            icon={<Package size={20} />} 
            color="bg-white"
          />
          <StatCard 
            label="إجمالي المبيعات" 
            value={`${totals.sales} ر.ي`} 
            icon={<TrendingUp size={20} />} 
            color="bg-white"
          />
          <StatCard 
            label="قوالب المساجد فقط" 
            value={totals.mosque} 
            icon={<Home size={20} />} 
            color="bg-white"
          />
        </div>

        {/* Sales List */}
        <div className="mt-8 space-y-4">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-lg font-bold text-ramadan-green flex items-center gap-2">
              <Calendar size={20} />
              السجل اليومي
            </h2>
            <div className="flex items-center gap-2">
              <div className="bg-white/50 p-1 rounded-xl border border-ramadan-gold/20 flex gap-1">
                <button 
                  onClick={() => setViewMode('cards')}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    viewMode === 'cards' ? "bg-ramadan-gold text-ramadan-dark shadow-sm" : "text-ramadan-dark/40"
                  )}
                >
                  <LayoutGrid size={18} />
                </button>
                <button 
                  onClick={() => setViewMode('table')}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    viewMode === 'table' ? "bg-ramadan-gold text-ramadan-dark shadow-sm" : "text-ramadan-dark/40"
                  )}
                >
                  <List size={18} />
                </button>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setEditingEntry(null);
                      setShowEntryModal(true);
                    }}
                    className="bg-ramadan-gold text-ramadan-dark p-2 rounded-full shadow-lg active:scale-90 transition-transform"
                  >
                    <Plus size={24} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-ramadan-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-10 text-ramadan-dark/50 italic">
              لا توجد بيانات مسجلة بعد
            </div>
          ) : viewMode === 'cards' ? (
            <div className="space-y-4">
              {sales.map((entry) => (
                <SaleCard 
                  key={entry.id} 
                  entry={entry} 
                  isAdmin={isAdmin}
                  isNew={entry.id === newEntryId}
                  onEdit={() => {
                    setEditingEntry(entry);
                    setShowEntryModal(true);
                  }}
                  onDelete={() => entry.id && handleDelete(entry.id)}
                />
              ))}
            </div>
          ) : (
            <SaleTable 
              sales={sales} 
              isAdmin={isAdmin}
              newEntryId={newEntryId}
              onEdit={(entry) => {
                setEditingEntry(entry);
                setShowEntryModal(true);
              }}
              onDelete={(id) => handleDelete(id)}
            />
          )}
        </div>
      </main>

      {/* PIN Modal */}
      <AnimatePresence>
        {showPinModal && (
          <Modal onClose={() => setShowPinModal(false)}>
            <div className="p-6">
              <h3 className="text-xl font-bold text-center mb-6 text-ramadan-green">أدخل رمز المرور</h3>
              <form onSubmit={handlePinSubmit} className="space-y-4">
                <input 
                  type="password" 
                  inputMode="numeric"
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full text-center text-3xl tracking-[1em] p-4 border-2 border-ramadan-gold/30 rounded-2xl focus:border-ramadan-gold outline-none bg-ramadan-cream/50"
                  placeholder="****"
                  maxLength={4}
                />
                <button 
                  type="submit"
                  className="w-full bg-ramadan-green text-ramadan-cream py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform"
                >
                  دخول
                </button>
              </form>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Entry Modal */}
      <AnimatePresence>
        {showEntryModal && (
          <EntryModal 
            onClose={() => setShowEntryModal(false)} 
            entry={editingEntry}
            showToast={showToast}
            setNewEntryId={setNewEntryId}
          />
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <Modal onClose={() => setShowSettingsModal(false)}>
            <div className="p-6">
              <h3 className="text-xl font-bold text-center mb-6 text-ramadan-green">الإعدادات</h3>
              
              <div className="space-y-6">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleChangePin(formData.get('newPin') as string);
                }} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs text-ramadan-dark/60 mr-2">تغيير رمز المرور (4 أرقام)</label>
                    <input 
                      name="newPin"
                      type="password" 
                      inputMode="numeric"
                      className="w-full text-center text-2xl tracking-[0.5em] p-3 border-2 border-ramadan-gold/30 rounded-2xl focus:border-ramadan-gold outline-none bg-ramadan-cream/50"
                      placeholder="****"
                      maxLength={4}
                      required
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full bg-ramadan-green text-ramadan-cream py-3 rounded-2xl font-bold shadow-md active:scale-95 transition-transform"
                  >
                    حفظ الرمز الجديد
                  </button>
                </form>

                <div className="pt-4 border-t border-ramadan-gold/10">
                  {showUndo && (
                    <motion.div 
                      drag="x"
                      dragConstraints={{ left: 0, right: 100 }}
                      onDragEnd={(_, info) => {
                        if (info.offset.x > 50) setShowUndo(false);
                      }}
                      className="mb-4 bg-ramadan-gold/10 p-4 rounded-2xl border border-ramadan-gold/20 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-ramadan-gold rounded-full animate-pulse" />
                        <span className="text-sm font-bold text-ramadan-green">يمكنك التراجع الآن</span>
                      </div>
                      <button 
                        onClick={handleUndo}
                        className="bg-ramadan-gold text-ramadan-dark px-4 py-1.5 rounded-xl text-xs font-bold shadow-sm"
                      >
                        تراجع
                      </button>
                    </motion.div>
                  )}

                  <button 
                    onClick={() => setShowResetConfirm(true)}
                    className="w-full text-[10px] text-ramadan-dark/20 hover:text-red-400 transition-colors py-2"
                  >
                    تهيئة النظام (فرمتة)
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <Modal onClose={() => setShowResetConfirm(false)}>
            <div className="p-6">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-ramadan-green mb-2">تحذير هام!</h3>
                <p className="text-sm text-ramadan-dark/60">
                  أنت على وشك حذف جميع السجلات والبيانات بشكل نهائي. هل تريد الاستمرار؟
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs text-ramadan-dark/60 mr-2">أدخل رمز المرور للتأكيد</label>
                  <input 
                    type="password" 
                    inputMode="numeric"
                    value={resetPin}
                    onChange={(e) => setResetPin(e.target.value)}
                    className="w-full text-center text-2xl tracking-[0.5em] p-3 border-2 border-red-100 rounded-2xl focus:border-red-300 outline-none bg-red-50/30"
                    placeholder="****"
                    maxLength={4}
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={handleFormat}
                    className="flex-1 bg-red-500 text-white py-3 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
                  >
                    نعم، فرمتة
                  </button>
                  <button 
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 bg-ramadan-cream border border-ramadan-gold/20 text-ramadan-dark py-3 rounded-2xl font-bold active:scale-95 transition-transform"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Custom Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-xs"
          >
            <div className={cn(
              "px-6 py-4 rounded-[2rem] shadow-2xl flex items-center gap-3 border backdrop-blur-md",
              toast.type === 'success' 
                ? "bg-ramadan-green/90 text-ramadan-cream border-ramadan-gold/30" 
                : "bg-red-500/90 text-white border-red-400/30"
            )}>
              {toast.type === 'success' ? <Check size={20} /> : <X size={20} />}
              <span className="font-bold text-sm">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string, value: string | number, icon: React.ReactNode, color: string }) {
  return (
    <div className={cn("p-3 rounded-2xl shadow-sm border border-ramadan-gold/10 flex flex-col items-center text-center", color)}>
      <div className="text-ramadan-gold mb-1">{icon}</div>
      <div className="text-xs text-ramadan-dark/60 font-medium mb-1">{label}</div>
      <div className="text-sm font-bold text-ramadan-green truncate w-full">{value}</div>
    </div>
  );
}

interface SaleCardProps {
  entry: SaleEntry;
  isAdmin: boolean;
  isNew?: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void> | void;
}

const SaleCard: React.FC<SaleCardProps> = ({ entry, isAdmin, isNew, onEdit, onDelete }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        borderColor: isNew ? "rgba(212, 175, 55, 0.5)" : "rgba(212, 175, 55, 0.05)",
        backgroundColor: isNew ? "rgba(212, 175, 55, 0.05)" : "white"
      }}
      className={cn(
        "p-5 rounded-3xl shadow-sm border relative overflow-hidden transition-colors duration-1000",
        isNew ? "ring-2 ring-ramadan-gold/20" : ""
      )}
    >
      <div className="absolute top-0 right-0 w-1.5 h-full bg-ramadan-gold" />
      
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-sm font-bold text-ramadan-green">{entry.hijriDate}</div>
          <div className="text-[11px] text-ramadan-dark/60 font-medium mt-0.5">
            {new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(entry.date))}
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={onEdit} className="p-2 text-ramadan-green bg-ramadan-green/5 rounded-full active:scale-90 transition-transform"><Edit2 size={16} /></button>
            <button onClick={onDelete} className="p-2 text-red-500 bg-red-50 rounded-full active:scale-90 transition-transform"><Trash2 size={16} /></button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="text-[10px] text-ramadan-dark/50">القوالب المشتراة</div>
          <div className="text-sm font-bold">{entry.purchasedTemplates || 0}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] text-ramadan-dark/50">المبيعات</div>
          <div className="text-sm font-bold text-ramadan-gold">{entry.totalSales || 0} ر.ي</div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] text-ramadan-dark/50">المتبقي</div>
          <div className="text-sm font-bold">{entry.remainingTemplates || "—"}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] text-ramadan-dark/50">قوالب المساجد فقط</div>
          <div className="text-sm font-bold">{entry.mosqueTemplates || 0}</div>
        </div>
      </div>
    </motion.div>
  );
}

function SaleTable({ sales, isAdmin, onEdit, onDelete, newEntryId }: { sales: SaleEntry[], isAdmin: boolean, onEdit: (e: SaleEntry) => void, onDelete: (id: string) => void, newEntryId: string | null }) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-ramadan-gold/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse min-w-[500px]">
          <thead>
            <tr className="bg-ramadan-green/5 text-ramadan-green text-[10px] font-bold uppercase tracking-wider">
              <th className="p-3 border-b border-ramadan-gold/10">التاريخ</th>
              <th className="p-3 border-b border-ramadan-gold/10">شريت</th>
              <th className="p-3 border-b border-ramadan-gold/10">بعت</th>
              <th className="p-3 border-b border-ramadan-gold/10">المتبقي</th>
              <th className="p-3 border-b border-ramadan-gold/10">مساجد</th>
              <th className="p-3 border-b border-ramadan-gold/10 text-center">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ramadan-gold/5">
            {sales.map((entry) => (
              <tr key={entry.id} className={cn(
                "text-xs transition-colors",
                entry.id === newEntryId ? "bg-ramadan-gold/10" : "hover:bg-ramadan-gold/5"
              )}>
                <td className="p-3">
                  <div className="font-bold text-ramadan-green whitespace-nowrap">{entry.hijriDate}</div>
                  <div className="text-[10px] text-ramadan-dark/60 leading-tight mt-0.5">
                    {new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(entry.date))}
                  </div>
                </td>
                <td className="p-3 font-medium">{entry.purchasedTemplates}</td>
                <td className="p-3 font-bold text-ramadan-gold">{entry.totalSales}</td>
                <td className="p-3">{entry.remainingTemplates || "—"}</td>
                <td className="p-3">{entry.mosqueTemplates}</td>
                <td className="p-3">
                  <div className="flex justify-center gap-1">
                    {isAdmin ? (
                      <>
                        <button onClick={() => onEdit(entry)} className="p-1.5 text-ramadan-green bg-ramadan-green/5 rounded-lg active:scale-90 transition-transform"><Edit2 size={14} /></button>
                        <button onClick={() => entry.id && onDelete(entry.id)} className="p-1.5 text-red-500 bg-red-50 rounded-lg active:scale-90 transition-transform"><Trash2 size={14} /></button>
                      </>
                    ) : (
                      <div className="text-[9px] text-ramadan-dark/30 italic">عرض فقط</div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-ramadan-dark/60 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative z-10 bg-ramadan-cream w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        {children}
      </motion.div>
    </div>
  );
}

function EntryModal({ onClose, entry, showToast, setNewEntryId }: { onClose: () => void, entry: SaleEntry | null, showToast: (m: string, t?: 'success' | 'error') => void, setNewEntryId: (id: string | null) => void }) {
  const [formData, setFormData] = useState<any>(
    entry ? {
      ...entry,
      purchasedTemplates: entry.purchasedTemplates || "",
      totalSales: entry.totalSales || "",
      mosqueTemplates: entry.mosqueTemplates || "",
      hijriDay: moment(entry.date).iDate()
    } : {
      date: new Date().toISOString().split('T')[0],
      hijriDate: moment().format('iD iMMMM iYYYY'),
      hijriDay: moment().iDate(),
      purchasedTemplates: "",
      totalSales: "",
      remainingTemplates: "",
      mosqueTemplates: ""
    }
  );

  const handleGregorianChange = (val: string) => {
    const m = moment(val);
    setFormData((prev: any) => ({
      ...prev,
      date: val,
      hijriDate: m.format('iD iMMMM iYYYY'),
      hijriDay: m.iDate()
    }));
  };

  const handleHijriDayChange = (val: string) => {
    const day = Number(val);
    if (isNaN(day) || day < 1 || day > 30) {
      setFormData((prev: any) => ({ ...prev, hijriDay: val }));
      return;
    }
    
    const m = moment(formData.date).iDate(day);
    setFormData((prev: any) => ({
      ...prev,
      hijriDay: day,
      date: m.format('YYYY-MM-DD'),
      hijriDate: m.format('iD iMMMM iYYYY')
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { hijriDay, ...rest } = formData;
    const data = {
      ...rest,
      timestamp: entry?.timestamp || Date.now(),
      createdAt: entry?.createdAt || moment().locale('ar').format('hh:mm A'),
      purchasedTemplates: Number(formData.purchasedTemplates) || 0,
      totalSales: Number(formData.totalSales) || 0,
      mosqueTemplates: Number(formData.mosqueTemplates) || 0,
    };

    try {
      if (entry?.id) {
        await updateDoc(doc(salesCollection, entry.id), data);
        showToast("✨ تم تحديث البيانات بنجاح");
      } else {
        const docRef = await addDoc(salesCollection, data);
        setNewEntryId(docRef.id);
        showToast("✨ تم إضافة السجل الجديد بنجاح");
        // Remove highlight after 5 seconds
        setTimeout(() => setNewEntryId(null), 5000);
      }
      onClose();
    } catch (error) {
      showToast("حدث خطأ أثناء الحفظ", "error");
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-ramadan-green">
            {entry ? 'تعديل سجل' : 'إضافة سجل جديد'}
          </h3>
          <button onClick={onClose} className="p-2 text-ramadan-dark/40"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-ramadan-dark/60 mr-2">يوم (هجري)</label>
              <input 
                type="number" 
                min="1"
                max="30"
                value={formData.hijriDay}
                onChange={(e) => handleHijriDayChange(e.target.value)}
                className="w-full p-4 bg-white border border-ramadan-gold/20 rounded-2xl outline-none focus:border-ramadan-gold text-center font-bold text-lg"
                placeholder="1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-ramadan-dark/60 mr-2">التاريخ الميلادي</label>
              <input 
                type="date" 
                required
                value={formData.date}
                onChange={(e) => handleGregorianChange(e.target.value)}
                className="w-full p-4 bg-white border border-ramadan-gold/20 rounded-2xl outline-none focus:border-ramadan-gold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-ramadan-dark/60 mr-2">التاريخ الهجري الكامل</label>
            <div className="w-full p-4 bg-ramadan-green/5 border border-ramadan-gold/10 rounded-2xl text-ramadan-green font-bold text-center">
              {formData.hijriDate}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-ramadan-dark/60 mr-2">قوالب مشتراة</label>
              <input 
                type="number" 
                value={formData.purchasedTemplates}
                onChange={(e) => setFormData({ ...formData, purchasedTemplates: e.target.value })}
                className="w-full p-4 bg-white border border-ramadan-gold/20 rounded-2xl outline-none focus:border-ramadan-gold"
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-ramadan-dark/60 mr-2">المبيعات (ر.س)</label>
              <input 
                type="number" 
                value={formData.totalSales}
                onChange={(e) => setFormData({ ...formData, totalSales: e.target.value })}
                className="w-full p-4 bg-white border border-ramadan-gold/20 rounded-2xl outline-none focus:border-ramadan-gold"
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-ramadan-dark/60 mr-2">المتبقي</label>
              <input 
                type="text" 
                value={formData.remainingTemplates}
                onChange={(e) => setFormData({ ...formData, remainingTemplates: e.target.value })}
                className="w-full p-4 bg-white border border-ramadan-gold/20 rounded-2xl outline-none focus:border-ramadan-gold"
                placeholder="مثلاً: باقي ربع"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-ramadan-dark/60 mr-2">قوالب المساجد</label>
              <input 
                type="number" 
                value={formData.mosqueTemplates}
                onChange={(e) => setFormData({ ...formData, mosqueTemplates: e.target.value })}
                className="w-full p-4 bg-white border border-ramadan-gold/20 rounded-2xl outline-none focus:border-ramadan-gold"
                placeholder="0"
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-ramadan-gold text-ramadan-dark py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 mt-4"
          >
            <Check size={20} />
            حفظ البيانات
          </button>
        </form>
      </div>
    </Modal>
  );
}
