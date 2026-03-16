import React, { useState, useEffect } from 'react';
import { UserProfile, UsageLog, LabRoom, PreAuthorizedUser } from '../types';
import { auth, db } from '../lib/firebase';
import { collection, query, getDocs, updateDoc, doc, deleteDoc, addDoc, setDoc, orderBy, where, Timestamp, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, Users, MapPin, History, Search, 
  Filter, Download, Trash2, ShieldAlert, ShieldCheck, 
  Plus, Loader2, TrendingUp, Clock, Calendar, QrCode, X, Radio, LogOut, Menu
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { format, startOfWeek, startOfMonth, isWithinInterval, subDays } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  profile: UserProfile;
}

export default function AdminDashboard({ profile }: Props) {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [rooms, setRooms] = useState<LabRoom[]>([]);
  const [preAuthUsers, setPreAuthUsers] = useState<PreAuthorizedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'live' | 'logs' | 'rooms' | 'users' | 'pending'>('stats');
  const [selectedRoomQR, setSelectedRoomQR] = useState<LabRoom | null>(null);
  const [showAddProfessorModal, setShowAddProfessorModal] = useState(false);
  const [newProfessor, setNewProfessor] = useState({ name: '', email: '' });
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Room Management
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  
  // Confirmation States
  const [confirmConfig, setConfirmConfig] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning'
  });

  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  useEffect(() => {
    const unsubLogs = onSnapshot(query(collection(db, 'logs'), orderBy('startTime', 'desc')), (snapshot) => {
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UsageLog)));
      setLoading(false);
    }, (error) => {
      console.error("Logs listener error:", error);
      setLoading(false);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ ...d.data() } as UserProfile)));
    });

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LabRoom)));
    });

    const unsubPreAuth = onSnapshot(collection(db, 'pre_authorized'), (snapshot) => {
      setPreAuthUsers(snapshot.docs.map(d => d.data() as PreAuthorizedUser));
    });

    return () => {
      unsubLogs();
      unsubUsers();
      unsubRooms();
      unsubPreAuth();
    };
  }, []);

  const handleUpdateRole = async (userId: string, newRole: 'professor' | 'admin' | 'pending') => {
    const userToUpdate = users.find(u => u.uid === userId);
    
    // If demoting an admin, ask for confirmation
    if (userToUpdate?.role === 'admin' && newRole === 'professor') {
      setConfirmConfig({
        show: true,
        title: 'Demote Administrator',
        message: `Are you sure you want to demote ${userToUpdate.displayName} to a Professor? they will lose administrative access.`,
        type: 'warning',
        onConfirm: async () => {
          try {
            await updateDoc(doc(db, 'users', userId), { role: newRole });
            showToast(`User demoted to Professor`);
            setConfirmConfig(prev => ({ ...prev, show: false }));
          } catch (error) {
            showToast("Failed to demote user", "error");
          }
        }
      });
      return;
    }

    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      showToast(`User role updated to ${newRole}`);
    } catch (error) {
      showToast("Failed to update user role", "error");
    }
  };

  const handleBlockUser = async (userId: string, isBlocked: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), { isBlocked: !isBlocked });
      showToast(`User ${isBlocked ? 'unblocked' : 'blocked'} successfully`);
    } catch (error) {
      showToast("Failed to update user status", "error");
    }
  };

  const handleDeleteUser = (userId: string, userEmail: string) => {
    if (userEmail === 'alyssabernadette.tuliao@neu.edu.ph') {
      showToast("Cannot delete the primary administrator", "error");
      return;
    }

    setConfirmConfig({
      show: true,
      title: 'Remove Account',
      message: `Are you sure you want to permanently remove ${userEmail}? This will kick them out and delete their profile.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', userId));
          showToast("User account removed successfully");
        } catch (error) {
          showToast("Failed to remove user account", "error");
        }
      }
    });
  };

  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'professor' as 'professor' | 'admin' });

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaff.email) return;
    
    try {
      await setDoc(doc(db, 'pre_authorized', newStaff.email.toLowerCase()), {
        email: newStaff.email.toLowerCase(),
        role: newStaff.role,
        addedAt: Timestamp.now()
      });
      showToast(`Staff member ${newStaff.email} pre-authorized as ${newStaff.role}.`);
      setNewStaff({ name: '', email: '', role: 'professor' });
      setShowAddProfessorModal(false);
    } catch (error) {
      showToast("Failed to pre-authorize staff", "error");
    }
  };

  // Error Handling Utility
  const handleFirestoreError = (error: any, operation: string, path: string) => {
    const errInfo = {
      error: error.message || String(error),
      operationType: operation,
      path: path,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        providerInfo: auth.currentUser?.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName,
          email: p.email,
          photoUrl: p.photoURL
        })) || []
      }
    };
    console.error('Firestore Error:', JSON.stringify(errInfo));
    showToast(`Permission denied: ${operation} on ${path}`, "error");
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomNumber.trim()) return;
    
    try {
      await addDoc(collection(db, 'rooms'), { 
        roomNumber: newRoomNumber.trim(),
        createdAt: Timestamp.now()
      });
      setNewRoomNumber('');
      setShowAddRoomModal(false);
      showToast(`Room ${newRoomNumber} added successfully`);
    } catch (error) {
      handleFirestoreError(error, 'create', 'rooms');
    }
  };

  const handleDeleteRoom = (roomId: string) => {
    setConfirmConfig({
      show: true,
      title: 'Delete Room',
      message: 'Are you sure you want to delete this room? This cannot be undone.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'rooms', roomId));
          showToast("Room deleted successfully");
        } catch (error) {
          handleFirestoreError(error, 'delete', `rooms/${roomId}`);
        }
        setConfirmConfig(prev => ({ ...prev, show: false }));
      }
    });
  };

  const handleDeleteLog = (logId: string) => {
    setConfirmConfig({
      show: true,
      title: 'Delete Log',
      message: 'Are you sure you want to delete this log entry?',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'logs', logId));
          showToast("Log deleted successfully");
        } catch (error) {
          showToast("Failed to delete log", "error");
        }
        setConfirmConfig(prev => ({ ...prev, show: false }));
      }
    });
  };


  const handleBatchDeleteSelected = () => {
    if (selectedLogIds.size === 0) return;

    setConfirmConfig({
      show: true,
      title: 'Delete Selected Logs',
      message: `Are you sure you want to delete ${selectedLogIds.size} selected logs?`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await Promise.all(Array.from(selectedLogIds).map((id: string) => deleteDoc(doc(db, 'logs', id))));
          setSelectedLogIds(new Set());
          showToast(`Successfully deleted logs`);
        } catch (error) {
          showToast("Failed to delete selected logs", "error");
        }
        setConfirmConfig(prev => ({ ...prev, show: false }));
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedLogIds.size === filteredLogs.length) {
      setSelectedLogIds(new Set());
    } else {
      setSelectedLogIds(new Set(filteredLogs.map(l => l.id)));
    }
  };

  const toggleSelectLog = (id: string) => {
    const newSet = new Set(selectedLogIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedLogIds(newSet);
  };

  const handleLogout = () => {
    auth.signOut();
  };

  const handleDeletePreAuth = async (email: string) => {
    try {
      await deleteDoc(doc(db, 'pre_authorized', email));
      showToast("Pre-authorization removed");
    } catch (error) {
      showToast("Failed to remove pre-authorization", "error");
    }
  };

  const renderRoomCard = (room: LabRoom, activeSession: UsageLog | undefined) => (
    <motion.div 
      key={room.id}
      layout
      className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 transition-all"
    >
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${activeSession ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}>
            <MapPin size={24} />
          </div>
          <div>
            <h3 className="text-xl font-serif font-bold">Room {room.roomNumber}</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Laboratory</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${activeSession ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
          {activeSession ? 'In Use' : 'Available'}
        </div>
      </div>

      {activeSession ? (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 overflow-hidden">
                {activeSession.professorEmail ? (
                  <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(activeSession.professorName)}&background=random`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Users size={14} />
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{activeSession.professorName}</p>
                <p className="text-[10px] text-gray-500 font-medium uppercase">{activeSession.program} • Year {activeSession.year}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-white p-2 rounded-lg border border-gray-100">
                <p className="text-gray-400 uppercase font-bold mb-1">Section</p>
                <p className="font-bold text-gray-700">{activeSession.section}</p>
              </div>
              <div className="bg-white p-2 rounded-lg border border-gray-100">
                <p className="text-gray-400 uppercase font-bold mb-1">Started</p>
                <p className="font-bold text-gray-700">{format(activeSession.startTime.toDate(), 'HH:mm')}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-emerald-600">
              <Clock size={14} />
              <span className="text-xs font-mono font-bold">
                {Math.floor((new Date().getTime() - activeSession.startTime.toDate().getTime()) / 60000)}m elapsed
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-300 font-serif italic">No active session</p>
        </div>
      )}
    </motion.div>
  );

  // Derive rooms to display in Live Status (official rooms + any room with an active session)
  const activeRoomNumbers = logs.filter(l => !l.endTime).map(l => l.roomNumber);
  const displayRooms = Array.from(new Set([...rooms.map(r => r.roomNumber), ...activeRoomNumbers]))
    .map(roomNum => {
      const existingRoom = rooms.find(r => r.roomNumber === roomNum);
      return existingRoom || { id: `auto-${roomNum}`, roomNumber: roomNum, campus: 'Unknown', college: 'Unknown' };
    });

  // Stats Calculations
  const filteredLogs = logs.filter(log => {
    const matchesSearch = (log.professorName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                          (log.roomNumber || '').includes(searchTerm) ||
                          (log.campus?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    
    if (dateRange === 'all') return matchesSearch;
    
    const logDate = log.startTime.toDate();
    const now = new Date();
    
    if (dateRange === 'today') {
      return matchesSearch && logDate.toDateString() === now.toDateString();
    }
    if (dateRange === 'week') {
      return matchesSearch && isWithinInterval(logDate, { start: subDays(now, 7), end: now });
    }
    if (dateRange === 'month') {
      return matchesSearch && isWithinInterval(logDate, { start: subDays(now, 30), end: now });
    }
    return matchesSearch;
  }).sort((a, b) => b.startTime.toDate().getTime() - a.startTime.toDate().getTime());

  const totalHours = logs.reduce((acc, log) => acc + (log.durationMinutes || 0), 0) / 60;
  const roomUsageData = rooms.map(room => ({
    name: `Room ${room.roomNumber}`,
    count: logs.filter(l => l.roomNumber === room.roomNumber).length
  })).sort((a, b) => b.count - a.count);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-[#5A5A40]" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex flex-col lg:flex-row">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-8 right-8 px-6 py-4 rounded-2xl shadow-2xl z-[100] flex items-center gap-3 ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
            <span className="font-bold text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmConfig.show && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmConfig(prev => ({ ...prev, show: false }))}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${
                  confirmConfig.type === 'danger' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                }`}>
                  <ShieldAlert size={24} />
                </div>
                <h3 className="text-2xl font-serif font-bold mb-2">{confirmConfig.title}</h3>
                <p className="text-gray-500 leading-relaxed">{confirmConfig.message}</p>
              </div>
              <div className="p-4 bg-gray-50 flex gap-3">
                <button 
                  onClick={() => setConfirmConfig(prev => ({ ...prev, show: false }))}
                  className="flex-1 px-6 py-3 bg-white border border-gray-200 rounded-2xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmConfig.onConfirm}
                  className={`flex-1 px-6 py-3 rounded-2xl font-bold text-white transition-colors shadow-lg ${
                    confirmConfig.type === 'danger' ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Header */}
      <div className="lg:hidden bg-[#151619] text-white p-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#5A5A40] rounded-lg flex items-center justify-center">
            <ShieldCheck size={20} />
          </div>
          <span className="font-serif font-bold tracking-tight">NEU Admin</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-[#151619] text-white p-6 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-auto
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="mb-12">
          <h1 className="text-2xl font-serif font-bold tracking-tight">NEU Admin</h1>
          <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mt-1">Lab Management</p>
        </div>

        <nav className="flex-1 space-y-2">
          <button 
            onClick={() => { setActiveTab('stats'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'stats' ? 'bg-[#5A5A40] text-white' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <LayoutDashboard size={20} />
            <span className="font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => { setActiveTab('live'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'live' ? 'bg-[#5A5A40] text-white' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <div className="relative">
              <Radio size={20} />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            </div>
            <span className="font-medium">Active Rooms</span>
          </button>
          <button 
            onClick={() => { setActiveTab('logs'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'logs' ? 'bg-[#5A5A40] text-white' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <History size={20} />
            <span className="font-medium">Usage Logs</span>
          </button>
          <button 
            onClick={() => { setActiveTab('rooms'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'rooms' ? 'bg-[#5A5A40] text-white' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <MapPin size={20} />
            <span className="font-medium">Lab Rooms</span>
          </button>
          <button 
            onClick={() => { setActiveTab('pending'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${activeTab === 'pending' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShieldAlert size={20} />
                {users.filter(u => u.role === 'pending').length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                )}
              </div>
              <span className="font-medium">Pending Requests</span>
            </div>
            {users.filter(u => u.role === 'pending').length > 0 && (
              <span className="bg-white text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {users.filter(u => u.role === 'pending').length}
              </span>
            )}
          </button>
          <button 
            onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${activeTab === 'users' ? 'bg-[#5A5A40] text-white' : 'text-gray-400 hover:bg-white/5'}`}
          >
            <div className="flex items-center gap-3">
              <Users size={20} />
              <span className="font-medium">Management</span>
            </div>
          </button>
        </nav>

        <button 
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 p-3 text-gray-500 hover:text-white transition-colors"
        >
          <LogOut size={20} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-8 overflow-x-hidden">
        <div className="max-w-6xl mx-auto">
              {activeTab === 'live' && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-8">
                <div className="flex-shrink-0">
                  <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1a1a1a]">Active Rooms</h2>
                  <p className="text-[#5A5A40] italic font-serif text-sm">Monitoring current laboratory occupancy</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 flex-1">
                  <div className="relative flex-1 w-full max-w-4xl">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      type="text" 
                      placeholder="Search for Room no. or Prof"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-[#5A5A40] shadow-sm text-base sm:text-lg"
                    />
                  </div>
                  <button 
                    onClick={() => setShowAddRoomModal(true)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4a4a35] transition-colors shadow-lg whitespace-nowrap"
                  >
                    <Plus size={18} /> Add Room
                  </button>
                </div>
              </div>

              {displayRooms.filter(r => logs.find(l => l.roomNumber === r.roomNumber && !l.endTime)).length === 0 ? (
                <p className="text-gray-500 italic">No active rooms</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {displayRooms
                    .filter(r => {
                      const activeSession = logs.find(l => l.roomNumber === r.roomNumber && !l.endTime);
                      if (!activeSession) return false;
                      const roomMatches = (r.roomNumber || '').includes(searchTerm);
                      const profMatches = (activeSession.professorName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
                      return roomMatches || profMatches;
                    })
                    .map(room => {
                      const activeSession = logs.find(l => l.roomNumber === room.roomNumber && !l.endTime);
                      return renderRoomCard(room, activeSession);
                    })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-8">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">System Overview</h2>
                  <p className="text-[#5A5A40] italic font-serif">Real-time laboratory statistics</p>
                </div>
                <div className="flex gap-2">
                  {['all', 'today', 'week', 'month'].map(r => (
                    <button
                      key={r}
                      onClick={() => setDateRange(r as any)}
                      className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${dateRange === r ? 'bg-[#5A5A40] text-white' : 'bg-white text-gray-400 border border-gray-200'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                    <TrendingUp size={24} />
                  </div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Logs</p>
                  <p className="text-4xl font-serif font-bold mt-2">{filteredLogs.length}</p>
                </div>
                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
                    <Clock size={24} />
                  </div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Hours</p>
                  <p className="text-4xl font-serif font-bold mt-2">{totalHours.toFixed(1)}h</p>
                </div>
                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
                  <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4">
                    <MapPin size={24} />
                  </div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Laboratory Rooms</p>
                  <p className="text-4xl font-serif font-bold mt-2">{rooms.length}</p>
                </div>
                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
                  <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center mb-4">
                    <Users size={24} />
                  </div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Professors</p>
                  <p className="text-4xl font-serif font-bold mt-2">{users.filter(u => u.role === 'professor').length}</p>
                </div>
              </div>


              {/* Active Rooms Section */}
              <div className="space-y-6">
                <h3 className="text-xl font-serif font-bold text-[#1a1a1a]">Active Rooms</h3>
                {displayRooms.filter(r => logs.find(l => l.roomNumber === r.roomNumber && (l.endTime === null || l.endTime === undefined))).length === 0 ? (
                  <p className="text-gray-500">No active rooms</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {displayRooms
                      .filter(r => {
                        const activeSession = logs.find(l => l.roomNumber === r.roomNumber && (l.endTime === null || l.endTime === undefined));
                        return !!activeSession;
                      })
                      .map(room => {
                        const activeSession = logs.find(l => l.roomNumber === room.roomNumber && !l.endTime);
                        return renderRoomCard(room, activeSession);
                      })}
                  </div>
                )}
              </div>
              <div className="flex justify-center">
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 w-full md:max-w-2xl">
                  <h3 className="text-lg font-serif font-bold mb-6">Recent Activity</h3>
                  <div className="space-y-4">
                    {filteredLogs.slice(0, 5).map(log => (
                      <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-[#5A5A40] border border-gray-200">
                            <Users size={14} />
                          </div>
                          <div>
                            <p className="text-sm font-bold">{log.professorName}</p>
                            <p className="text-xs text-gray-400">Room {log.roomNumber}</p>
                          </div>
                        </div>
                        <p className="text-xs font-mono text-gray-400">{format(log.startTime.toDate(), 'HH:mm')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl sm:text-3xl font-serif font-bold">Usage Logs</h2>
                <div className="relative flex-1 max-w-4xl">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search for Room no. or Prof"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-[#5A5A40] shadow-sm text-base"
                  />
                </div>
                {selectedLogIds.size > 0 && (
                  <button 
                    onClick={handleBatchDeleteSelected}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                  >
                    <Trash2 size={18} />
                    <span className="font-bold text-xs uppercase tracking-widest">Delete ({selectedLogIds.size})</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-4 mb-4">
                <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full cursor-pointer hover:bg-gray-50 transition-colors shadow-sm">
                  <input 
                    type="checkbox" 
                    checked={selectedLogIds.size === filteredLogs.length && filteredLogs.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-[#5A5A40] focus:ring-[#5A5A40]"
                  />
                  <span className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest">Select All</span>
                </label>
                <span className="text-[10px] sm:text-xs text-gray-400 font-medium">{filteredLogs.length} logs found</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredLogs.map(log => (
                  <div 
                    key={log.id} 
                    className={`group relative flex items-center gap-4 p-3 sm:p-4 bg-white border border-gray-100 rounded-2xl sm:rounded-full shadow-sm hover:shadow-md hover:border-[#5A5A40]/30 transition-all duration-300 ${
                      selectedLogIds.has(log.id) ? 'ring-2 ring-[#5A5A40] bg-[#5A5A40]/5' : ''
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <input 
                        type="checkbox" 
                        checked={selectedLogIds.has(log.id)}
                        onChange={() => toggleSelectLog(log.id)}
                        className="w-5 h-5 rounded-full border-gray-300 text-[#5A5A40] focus:ring-[#5A5A40] cursor-pointer"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-bold text-sm truncate">{log.professorName}</p>
                        <span className="px-2 py-0.5 bg-[#5A5A40]/10 text-[#5A5A40] text-[9px] sm:text-[10px] font-bold rounded-full">
                          Room {log.roomNumber}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[9px] sm:text-[10px] text-gray-400 uppercase font-bold tracking-tight">
                        <span>{log.campus}</span>
                        <span>•</span>
                        <span>{format(log.startTime.toDate(), 'MMM dd, HH:mm')}</span>
                        {log.durationMinutes ? (
                          <span className="text-gray-500">({log.durationMinutes}m)</span>
                        ) : (
                          <span className="text-emerald-500 animate-pulse">Live</span>
                        )}
                      </div>
                    </div>

                    <div className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1 pr-2">
                      <button 
                        onClick={() => handleDeleteLog(log.id)}
                        className="p-2 bg-red-50 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm"
                        title="Delete Log"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {filteredLogs.length === 0 && (
                <div className="py-20 text-center">
                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <History className="text-gray-300" size={40} />
                  </div>
                  <h3 className="text-xl font-serif font-bold text-gray-900">No logs found</h3>
                  <p className="text-gray-500">Try adjusting your search or filters.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'rooms' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl sm:text-3xl font-serif font-bold">Laboratory Rooms</h2>
                <button 
                  onClick={() => setShowAddRoomModal(true)}
                  className="bg-[#5A5A40] text-white px-6 py-3 rounded-2xl font-bold hover:bg-[#4a4a35] transition-colors flex items-center justify-center gap-2 shadow-lg w-full sm:w-auto"
                >
                  <Plus size={18} /> Add Room
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {rooms.map(room => (
                  <div key={room.id} className="bg-white p-4 sm:p-6 rounded-[24px] shadow-sm border border-gray-100 flex justify-between items-center">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#5A5A40]/10 text-[#5A5A40] rounded-2xl flex items-center justify-center">
                        <MapPin size={20} className="sm:w-6 sm:h-6" />
                      </div>
                      <div>
                        <p className="text-lg sm:text-xl font-serif font-bold">Room {room.roomNumber}</p>
                        <p className="text-[10px] sm:text-xs text-gray-400">Total uses: {logs.filter(l => l.roomNumber === room.roomNumber).length}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <button 
                        onClick={() => setSelectedRoomQR(room)}
                        className="p-2 text-gray-300 hover:text-[#5A5A40] transition-colors"
                        title="Generate QR Code"
                      >
                        <QrCode size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteRoom(room.id)}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* QR Modal */}
              {selectedRoomQR && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                  <div className="bg-white rounded-[32px] p-10 max-w-sm w-full text-center relative shadow-2xl">
                    <button 
                      onClick={() => setSelectedRoomQR(null)}
                      className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <X size={20} />
                    </button>
                    
                    <div className="mb-6 flex justify-center">
                      <div className="p-4 bg-white border-4 border-[#5A5A40] rounded-3xl shadow-lg">
                        <QRCodeSVG 
                          value={JSON.stringify({ type: 'NEU_LAB_ROOM', roomNumber: selectedRoomQR.roomNumber })} 
                          size={200}
                          level="H"
                        />
                      </div>
                    </div>
                    
                    <h3 className="text-2xl font-serif font-bold mb-1">Room {selectedRoomQR.roomNumber}</h3>
                    <p className="text-[#5A5A40] italic font-serif mb-6">Laboratory Access QR Code</p>
                    
                    <button 
                      onClick={() => window.print()}
                      className="w-full py-3 bg-[#5A5A40] text-white rounded-xl font-bold hover:bg-[#4a4a35] transition-colors flex items-center justify-center gap-2"
                    >
                      <Download size={18} /> Print QR Code
                    </button>
                    
                    <p className="mt-6 text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                      New Era University Laboratory Management
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'pending' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">Pending Requests</h2>
                <p className="text-[#5A5A40] italic font-serif">Approve or deny new access requests</p>
              </div>

              {users.filter(u => u.role === 'pending').length === 0 ? (
                <div className="py-20 text-center bg-white rounded-[32px] border border-dashed border-gray-200">
                  <ShieldCheck className="mx-auto text-gray-200 mb-4" size={48} />
                  <p className="text-gray-400 font-serif italic">No pending requests at the moment</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {users.filter(u => u.role === 'pending').map(user => (
                    <motion.div 
                      key={user.uid}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-[32px] p-8 shadow-sm border-2 border-amber-100 flex flex-col justify-between"
                    >
                      <div className="flex items-center gap-4 mb-6">
                        <img src={user.photoURL} alt="" className="w-16 h-16 rounded-2xl border-2 border-amber-50 shadow-sm" referrerPolicy="no-referrer" />
                        <div>
                          <h3 className="text-xl font-serif font-bold text-gray-900">{user.displayName}</h3>
                          <p className="text-sm text-gray-500">{user.email}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full uppercase tracking-widest">First-time Login</span>
                            <span className="text-[10px] text-gray-400 font-mono">{format(user.createdAt.toDate(), 'MMM dd, HH:mm')}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => handleUpdateRole(user.uid, 'professor')}
                          className="py-3 bg-[#5A5A40] text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[#4a4a35] transition-all shadow-lg shadow-[#5A5A40]/20"
                        >
                          Approve as Prof
                        </button>
                        <button 
                          onClick={() => handleUpdateRole(user.uid, 'admin')}
                          className="py-3 bg-gray-900 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-black transition-all shadow-lg shadow-gray-900/20"
                        >
                          Approve as Admin
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.uid, user.email)}
                          className="col-span-2 py-3 bg-white border border-red-100 text-red-500 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-red-50 transition-all"
                        >
                          Deny Access
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl sm:text-3xl font-serif font-bold">Management</h2>
                <button 
                  onClick={() => setShowAddProfessorModal(true)}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4a4a35] transition-colors shadow-lg w-full sm:w-auto"
                >
                  <Plus size={18} /> Add Staff
                </button>
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">User</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Email</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Status / Role</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Account Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map(user => (
                      <tr key={user.uid} className={user.uid === profile.uid ? 'bg-gray-50/50' : ''}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-gray-200" referrerPolicy="no-referrer" />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-sm">{user.displayName}</p>
                                {user.uid === profile.uid && (
                                  <span className="text-[8px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase">You</span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-400 font-mono uppercase tracking-tighter">{user.uid}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-500">{user.email}</p>
                          {user.email.endsWith('@neu.edu.ph') && (
                            <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Verified NEU Account</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {user.uid === profile.uid ? (
                            <span className="text-xs font-bold px-3 py-1 rounded-lg bg-gray-900 text-white border border-gray-900">
                              Admin (Owner)
                            </span>
                          ) : (
                            <select 
                              value={user.role}
                              onChange={(e) => handleUpdateRole(user.uid, e.target.value as any)}
                              className={`text-xs font-bold px-3 py-1 rounded-lg border outline-none transition-all ${
                                user.role === 'admin' ? 'bg-gray-900 text-white border-gray-900' :
                                user.role === 'professor' ? 'bg-[#5A5A40] text-white border-[#5A5A40]' : 
                                'bg-amber-50 text-amber-600 border-amber-200'
                              }`}
                            >
                              <option value="pending">Pending Approval</option>
                              <option value="professor">Professor</option>
                              <option value="admin">Administrator</option>
                            </select>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {user.uid === profile.uid ? (
                            <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-md uppercase">Active</span>
                          ) : (
                            <button 
                              onClick={() => handleBlockUser(user.uid, user.isBlocked)}
                              className={`px-2 py-1 text-[10px] font-bold rounded-md uppercase transition-all hover:scale-105 active:scale-95 ${
                                user.isBlocked 
                                  ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                                  : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              }`}
                              title={user.isBlocked ? 'Click to Unblock' : 'Click to Block'}
                            >
                              {user.isBlocked ? 'Blocked' : 'Active'}
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {user.uid !== profile.uid && (
                            <div className="flex items-center gap-4">
                              <button 
                                onClick={() => handleDeleteUser(user.uid, user.email)}
                                className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                                title="Kick Out"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-4">
                {users.map(user => (
                  <div key={user.uid} className={`bg-white p-4 rounded-[24px] shadow-sm border border-gray-100 space-y-4 ${user.uid === profile.uid ? 'bg-gray-50/50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border border-gray-200" referrerPolicy="no-referrer" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm">{user.displayName}</p>
                            {user.uid === profile.uid && (
                              <span className="text-[8px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase">You</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 font-mono uppercase tracking-tighter">{user.uid}</p>
                        </div>
                      </div>
                      {user.uid !== profile.uid && (
                        <button 
                          onClick={() => handleDeleteUser(user.uid, user.email)}
                          className="p-2 text-red-500 bg-red-50 rounded-xl"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400 font-bold uppercase tracking-widest">Email</span>
                        <span className="text-gray-600 truncate max-w-[200px]">{user.email}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400 font-bold uppercase tracking-widest">Role</span>
                        {user.uid === profile.uid ? (
                          <span className="font-bold px-2 py-0.5 rounded bg-gray-900 text-white">Admin</span>
                        ) : (
                          <select 
                            value={user.role}
                            onChange={(e) => handleUpdateRole(user.uid, e.target.value as any)}
                            className={`font-bold px-2 py-0.5 rounded border outline-none ${
                              user.role === 'admin' ? 'bg-gray-900 text-white border-gray-900' :
                              user.role === 'professor' ? 'bg-[#5A5A40] text-white border-[#5A5A40]' : 
                              'bg-amber-50 text-amber-600 border-amber-200'
                            }`}
                          >
                            <option value="pending">Pending</option>
                            <option value="professor">Professor</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400 font-bold uppercase tracking-widest">Status</span>
                        {user.uid === profile.uid ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 font-bold rounded uppercase">Active</span>
                        ) : (
                          <button 
                            onClick={() => handleBlockUser(user.uid, user.isBlocked)}
                            className={`px-2 py-0.5 font-bold rounded uppercase ${
                              user.isBlocked 
                                ? 'bg-red-50 text-red-600' 
                                : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            {user.isBlocked ? 'Blocked' : 'Active'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {preAuthUsers.length > 0 && (
                <div className="space-y-4 pt-8 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-serif font-bold text-gray-900">Pre-authorized Staff</h3>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full uppercase tracking-widest">Awaiting First Login</span>
                    </div>
                    <p className="text-xs text-gray-400 italic">These users will automatically become {preAuthUsers[0]?.role}s upon login.</p>
                  </div>
                  <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Email</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Assigned Role</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Added At</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preAuthUsers
                          .filter(pa => !users.some(u => u.email === pa.email))
                          .map(pa => (
                          <tr key={pa.email}>
                            <td className="px-6 py-4">
                              <p className="text-sm font-medium text-gray-900">{pa.email}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${
                                pa.role === 'admin' ? 'bg-gray-900 text-white' : 'bg-[#5A5A40] text-white'
                              }`}>
                                {pa.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-gray-400">
                              {format(pa.addedAt.toDate(), 'MMM dd, yyyy')}
                            </td>
                            <td className="px-6 py-4">
                              <button 
                                onClick={() => handleDeletePreAuth(pa.email)}
                                className="text-red-600 hover:text-red-700 text-xs font-bold flex items-center gap-1"
                              >
                                <Trash2 size={14} /> Cancel Invite
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Global Modals */}
          {showAddRoomModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-[32px] p-10 max-w-sm w-full shadow-2xl">
                <h3 className="text-2xl font-serif font-bold mb-6">Add Laboratory Room</h3>
                <form onSubmit={handleAddRoom} className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-2">Room Number</p>
                    <input 
                      type="text" 
                      placeholder="e.g. 401, Lab A" 
                      required
                      value={newRoomNumber}
                      onChange={e => setNewRoomNumber(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#5A5A40]"
                    />
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button 
                      type="button"
                      onClick={() => setShowAddRoomModal(false)}
                      className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-3 bg-[#5A5A40] text-white rounded-xl font-bold hover:bg-[#4a4a35] transition-colors"
                    >
                      Add Room
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showAddProfessorModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-[32px] p-10 max-w-sm w-full shadow-2xl">
                <h3 className="text-2xl font-serif font-bold mb-6">Add New Staff</h3>
                <form onSubmit={handleAddStaff} className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="Full Name" 
                    required
                    value={newStaff.name}
                    onChange={e => setNewStaff(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#5A5A40]"
                  />
                  <input 
                    type="email" 
                    placeholder="Email Address" 
                    required
                    value={newStaff.email}
                    onChange={e => setNewStaff(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#5A5A40]"
                  />
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Assign Role</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setNewStaff(prev => ({ ...prev, role: 'professor' }))}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${newStaff.role === 'professor' ? 'bg-[#5A5A40] text-white' : 'bg-gray-100 text-gray-400'}`}
                      >
                        Professor
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewStaff(prev => ({ ...prev, role: 'admin' }))}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${newStaff.role === 'admin' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}
                      >
                        Admin
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button 
                      type="button"
                      onClick={() => setShowAddProfessorModal(false)}
                      className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-3 bg-[#5A5A40] text-white rounded-xl font-bold hover:bg-[#4a4a35] transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
