import React, { useState, useEffect } from 'react';
import { UserProfile, UsageLog, LabRoom } from '../types';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, Timestamp, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, Clock, MapPin, BookOpen, Users, CheckCircle, Loader2, History, Building, QrCode, ShieldCheck } from 'lucide-react';
import { COLLEGE_PROGRAMS } from '../constants';
import QRScanner from '../components/QRScanner';

interface Props {
  profile: UserProfile;
}

export default function ProfessorDashboard({ profile }: Props) {
  const [rooms, setRooms] = useState<LabRoom[]>([]);
  const [activeLog, setActiveLog] = useState<UsageLog | null>(null);
  const [history, setHistory] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'log' | 'history'>('log');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showMobileTest, setShowMobileTest] = useState(false);
  const [showTakeoverModal, setShowTakeoverModal] = useState(false);
  const [conflictLog, setConflictLog] = useState<UsageLog | null>(null);

  // Stats for history
  const totalSessions = history.length;
  const totalMinutes = history.reduce((acc, log) => acc + (log.durationMinutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // Form state
  const [formData, setFormData] = useState({
    roomNumber: '',
    campus: '',
    college: '',
    program: '',
    year: '',
    section: '',
    estimatedDuration: '01:00', // HH:mm format
  });

  const [isQRMode, setIsQRMode] = useState(false);

  const getProgramAcronym = (program: string) => {
    if (!program) return 'PROG';
    
    // Special cases
    if (program.includes('Computer Science')) return 'BSCS';
    if (program.includes('Information Technology')) return 'BSIT';
    if (program.includes('Information System')) return 'BSIS';
    if (program.includes('Accountancy')) return 'BSA';
    if (program.includes('Criminology')) return 'BSCrim';
    if (program.includes('Nursing')) return 'BSN';
    if (program.includes('Medical Technology')) return 'BSMT';
    if (program.includes('Architecture')) return 'BSArch';
    if (program.includes('Civil Engineering')) return 'BSCE';
    if (program.includes('Electrical Engineering')) return 'BSEE';
    if (program.includes('Mechanical Engineering')) return 'BSME';
    if (program.includes('Industrial Engineering')) return 'BSIE';
    if (program.includes('Electronics Engineering')) return 'BSECE';
    
    // Default acronym logic: First letter of each significant word
    const skipWords = ['of', 'in', 'and', 'with', 'Major', 'Specialization', 'the'];
    return program
      .split(' ')
      .filter(word => !skipWords.includes(word))
      .map(word => word[0])
      .join('')
      .toUpperCase();
  };

  const formatMinutes = (mins: number) => {
    if (!mins) return '00:00';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    // Real-time rooms listener
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LabRoom)));
      setLoading(false);
    }, (error) => {
      console.error("Rooms listener error:", error);
      setLoading(false);
    });

    // Real-time active log listener
    const q = query(
      collection(db, 'logs'),
      where('professorId', '==', profile.uid),
      where('endTime', '==', null),
      limit(1)
    );
    
    const unsubLog = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const logData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as any;
        
        // Auto-end safety net
        const startTime = logData.startTime.toDate();
        const duration = logData.estimatedDuration || 60;
        const expirationTime = new Date(startTime.getTime() + duration * 60000);
        
        if (new Date() > expirationTime) {
          await updateDoc(doc(db, 'logs', logData.id), { 
            endTime: Timestamp.fromDate(expirationTime),
            autoEnded: true 
          });
          setActiveLog(null);
        } else {
          setActiveLog(logData);
        }
      } else {
        setActiveLog(null);
      }
    });

    // Real-time history listener
    const historyQ = query(
      collection(db, 'logs'),
      where('professorId', '==', profile.uid),
      where('endTime', '!=', null),
      orderBy('endTime', 'desc'),
      limit(20)
    );

    const unsubHistory = onSnapshot(historyQ, (snapshot) => {
      setHistory(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UsageLog)));
    });

    // Check for pending room from scan
    const pendingRoom = sessionStorage.getItem('pending_room');
    if (pendingRoom) {
      setFormData(prev => ({ ...prev, roomNumber: pendingRoom }));
      setIsQRMode(true);
      sessionStorage.removeItem('pending_room');
      setSuccessMessage(`Room ${pendingRoom} auto-filled from scan!`);
      setTimeout(() => setSuccessMessage(null), 5000);
    }

    return () => {
      unsubRooms();
      unsubLog();
      unsubHistory();
    };
  }, [profile.uid]);

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
    alert(`Permission denied: ${operation} on ${path}`);
  };

  const executeStartSession = async () => {
    const [hours, minutes] = formData.estimatedDuration.split(':').map(Number);
    const totalMinutes = (hours * 60) + minutes;

    const newLog = {
      professorId: profile.uid,
      professorName: profile.displayName,
      professorEmail: profile.email,
      roomNumber: formData.roomNumber,
      campus: formData.campus,
      college: formData.college,
      program: formData.program,
      year: formData.year,
      section: formData.section,
      estimatedDuration: totalMinutes,
      startTime: Timestamp.now(),
      endTime: null,
    };

    try {
      await addDoc(collection(db, 'logs'), newLog);
      setSuccessMessage(`Session started! Thank you for using Room ${formData.roomNumber}`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      handleFirestoreError(error, 'create', 'logs');
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Check for conflicts (room already in use by someone else)
      const q = query(
        collection(db, 'logs'),
        where('roomNumber', '==', formData.roomNumber),
        where('endTime', '==', null),
        limit(1)
      );
      const snap = await getDocs(q);
      
      let conflict: UsageLog | null = null;
      if (!snap.empty) {
        const logData = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
        
        // If the conflicting session should have ended already, auto-end it now
        const startTime = logData.startTime.toDate();
        const duration = logData.estimatedDuration || 60;
        const expirationTime = new Date(startTime.getTime() + duration * 60000);
        
        if (new Date() > expirationTime) {
          await updateDoc(doc(db, 'logs', logData.id), { 
            endTime: Timestamp.fromDate(expirationTime),
            autoEnded: true 
          });
          conflict = null; // No conflict anymore
        } else {
          conflict = logData;
        }
      }

      if (conflict) {
        setConflictLog(conflict);
        setShowTakeoverModal(true);
        setSubmitting(false);
        return;
      }

      await executeStartSession();
    } catch (error) {
      console.error("Error checking conflicts:", error);
      alert("Failed to start session.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTakeover = async () => {
    if (!conflictLog) return;
    setSubmitting(true);
    try {
      const endTime = new Date();
      await updateDoc(doc(db, 'logs', conflictLog.id), {
        endTime: Timestamp.fromDate(endTime)
      });

      await executeStartSession();
      setShowTakeoverModal(false);
      setConflictLog(null);
    } catch (error) {
      handleFirestoreError(error, 'update', `logs/${conflictLog.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndSession = async () => {
    if (!activeLog) return;
    setSubmitting(true);
    try {
      const endTime = new Date();
      const startTime = activeLog.startTime.toDate();
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      
      await updateDoc(doc(db, 'logs', activeLog.id), {
        endTime: Timestamp.fromDate(endTime),
        durationMinutes
      });
      
      setSuccessMessage(`Session ended. Thank you for using Room ${activeLog.roomNumber}`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      handleFirestoreError(error, 'update', `logs/${activeLog.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleScan = (data: string) => {
    setShowScanner(false);
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'NEU_LAB_ROOM' && parsed.roomNumber) {
        setFormData(prev => ({ ...prev, roomNumber: parsed.roomNumber }));
        setIsQRMode(true);
        setSuccessMessage(`Room ${parsed.roomNumber} detected! Please fill in the remaining details.`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        alert("Invalid QR Code. Please scan a valid NEU Lab Room QR.");
      }
    } catch (e) {
      // Fallback if it's just a plain room number string
      if (data.length < 10) {
        setFormData(prev => ({ ...prev, roomNumber: data }));
        setIsQRMode(true);
      } else {
        alert("Invalid QR Code format.");
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-[#5A5A40]" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[#5A5A40] rounded-2xl flex items-center justify-center text-white shadow-lg">
              <ShieldCheck size={32} className="sm:w-10 sm:h-10" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1a1a1a]">Welcome, Prof. {profile.displayName.split(' ')[0]}</h1>
              <p className="text-[#5A5A40] italic font-serif text-sm">NEU Laboratory Portal</p>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-600 rounded-2xl font-bold hover:bg-gray-50 transition-colors shadow-sm border border-gray-100"
          >
            <LogOut size={18} /> Sign Out
          </button>
        </header>

        <div className="flex gap-2 p-1 bg-white rounded-2xl shadow-sm border border-gray-100 mb-8">
          <button
            onClick={() => setActiveTab('log')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${activeTab === 'log' ? 'bg-[#5A5A40] text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Clock size={18} /> Current Session
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${activeTab === 'history' ? 'bg-[#5A5A40] text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <History size={18} /> Usage History
          </button>
        </div>

      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-8 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl flex items-center gap-3"
          >
            <CheckCircle size={20} />
            <p className="font-medium">{successMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showScanner && (
          <QRScanner 
            onScan={handleScan} 
            onClose={() => setShowScanner(false)} 
          />
        )}
      </AnimatePresence>

      {activeTab === 'log' ? (
        activeLog ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[32px] shadow-xl p-8 border-2 border-[#5A5A40] relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#5A5A40]/5 rounded-full -mr-16 -mt-16"></div>
            
            <div className="flex justify-between items-start mb-8 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Live Session</span>
                </div>
                <h2 className="text-5xl font-serif font-bold text-[#1a1a1a]">Room {activeLog.roomNumber}</h2>
                <p className="text-gray-400 text-sm mt-1">{activeLog.campus} • {activeLog.college}</p>
              </div>
              <div className="text-right">
                <div className="w-16 h-16 bg-[#5A5A40]/10 rounded-2xl flex items-center justify-center text-[#5A5A40] mb-2 ml-auto">
                  <Clock size={32} />
                </div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Started At</p>
                <p className="text-xl font-mono font-bold">{activeLog.startTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 relative z-10">
              <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">Program</p>
                <p className="font-bold text-gray-800">{activeLog.program}</p>
              </div>
              <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">Year & Section</p>
                <p className="font-bold text-gray-800">{activeLog.year} - {activeLog.section}</p>
              </div>
              <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">Elapsed</p>
                <p className="font-bold text-emerald-600 font-mono">
                  {Math.floor((new Date().getTime() - activeLog.startTime.toDate().getTime()) / 60000)}m
                </p>
              </div>
              <div className="p-5 bg-[#5A5A40]/5 rounded-2xl border border-[#5A5A40]/20">
                <p className="text-[10px] text-[#5A5A40] uppercase font-bold mb-1 tracking-wider">Est. Duration</p>
                <p className="font-bold text-[#5A5A40] font-mono">{formatMinutes(activeLog.estimatedDuration || 0)}</p>
              </div>
            </div>

            <button
              onClick={handleEndSession}
              disabled={submitting}
              className="w-full py-5 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-3 group"
            >
              {submitting ? <Loader2 className="animate-spin" /> : <LogOut size={22} className="group-hover:translate-x-1 transition-transform" />}
              <span className="text-lg">End Laboratory Session</span>
            </button>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[32px] shadow-lg p-10 border border-[#5A5A40]/10"
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-serif font-bold text-[#1a1a1a]">Log Laboratory Usage</h2>
              {!isQRMode && (
                <button
                  onClick={() => setShowScanner(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#5A5A40]/10 text-[#5A5A40] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#5A5A40]/20 transition-all"
                >
                  <QrCode size={16} /> Scan Room QR
                </button>
              )}
            </div>

            {isQRMode && (
              <div className="mb-8 p-6 bg-[#5A5A40]/5 border border-[#5A5A40]/20 rounded-[24px] flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#5A5A40] text-white rounded-full flex items-center justify-center shadow-md">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#5A5A40]/60">Verified Room</p>
                    <h3 className="text-2xl font-serif font-bold text-[#1a1a1a]">Room {formData.roomNumber}</h3>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsQRMode(false);
                    setFormData(prev => ({ ...prev, roomNumber: '' }));
                  }}
                  className="text-xs font-bold text-[#5A5A40] underline underline-offset-4 hover:text-[#4a4a35]"
                >
                  Change Room
                </button>
              </div>
            )}
            
            <form onSubmit={handleStartSession} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-500 flex items-center gap-2">
                    <Building size={14} /> Campus
                  </label>
                  <select
                    required
                    value={formData.campus}
                    onChange={e => setFormData({ ...formData, campus: e.target.value })}
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                  >
                    <option value="">Select Campus</option>
                    <option value="Main Campus">Main Campus</option>
                    <option value="Batangas Branch">Batangas Branch</option>
                    <option value="Pampanga Branch">Pampanga Branch</option>
                    <option value="General Santos Branch">General Santos Branch</option>
                    <option value="Rizal Branch">Rizal Branch</option>
                  </select>
                </div>

                {!isQRMode && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-gray-500 flex items-center gap-2">
                      <MapPin size={14} /> Room Number
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. 302"
                      value={formData.roomNumber}
                      onChange={e => setFormData({ ...formData, roomNumber: e.target.value })}
                      className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-500 flex items-center gap-2">
                    <BookOpen size={14} /> College
                  </label>
                  <select
                    required
                    value={formData.college}
                    onChange={e => {
                      const newCollege = e.target.value;
                      const programs = COLLEGE_PROGRAMS[newCollege] || [];
                      setFormData({ 
                        ...formData, 
                        college: newCollege, 
                        program: programs.length === 1 ? programs[0] : '' 
                      });
                    }}
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                  >
                    <option value="">Select College</option>
                    <option value="College of Accountancy">College of Accountancy</option>
                    <option value="College of Agriculture">College of Agriculture</option>
                    <option value="College of Arts and Science">College of Arts and Science</option>
                    <option value="College of Business Administration">College of Business Administration</option>
                    <option value="College of Communication">College of Communication</option>
                    <option value="College of Informatics and Computing Studies">College of Informatics and Computing Studies</option>
                    <option value="College of Criminology">College of Criminology</option>
                    <option value="College of Education">College of Education</option>
                    <option value="College of Engineering and Architecture">College of Engineering and Architecture</option>
                    <option value="College of Medical Technology">College of Medical Technology</option>
                    <option value="College of Midwifery">College of Midwifery</option>
                    <option value="College of Music">College of Music</option>
                    <option value="College of Nursing">College of Nursing</option>
                    <option value="College of Physical Therapy">College of Physical Therapy</option>
                    <option value="College of Respiratory Therapy">College of Respiratory Therapy</option>
                    <option value="School of International Relations">School of International Relations</option>
                    <option value="College of Law">College of Law</option>
                    <option value="College of Medicine">College of Medicine</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-500 flex items-center gap-2">
                    <Users size={14} /> Program
                  </label>
                  <select
                    required
                    disabled={!formData.college}
                    value={formData.program}
                    onChange={e => setFormData({ ...formData, program: e.target.value })}
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all disabled:opacity-50"
                  >
                    <option value="">{formData.college ? 'Select Program' : 'Select College First'}</option>
                    {formData.college && COLLEGE_PROGRAMS[formData.college]?.map(program => (
                      <option key={program} value={program}>{program}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-500 flex items-center gap-2">
                    <Clock size={14} /> Year Level
                  </label>
                  <select
                    required
                    value={formData.year}
                    onChange={e => setFormData({ ...formData, year: e.target.value })}
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                  >
                    <option value="">Select Year</option>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                    <option value="5th Year">5th Year</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-500 flex items-center gap-2">
                    <Users size={14} /> Section
                  </label>
                  <select
                    required
                    value={formData.section}
                    onChange={e => setFormData({ ...formData, section: e.target.value })}
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                  >
                    <option value="">Select Section</option>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                      <option key={num} value={num.toString()}>Section {num}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-500 flex items-center gap-2">
                    <Clock size={14} /> Estimated Duration (HH:MM)
                  </label>
                  <div className="flex items-center gap-2 p-4 bg-gray-50 border border-gray-200 rounded-2xl focus-within:ring-2 focus-within:ring-[#5A5A40] transition-all">
                    <input
                      type="text"
                      required
                      placeholder="01:00"
                      value={formData.estimatedDuration}
                      onChange={e => {
                        let val = e.target.value.replace(/[^0-9:]/g, '');
                        if (val.length === 2 && !val.includes(':') && formData.estimatedDuration.length < 2) {
                          val += ':';
                        }
                        if (val.length > 5) val = val.slice(0, 5);
                        setFormData({ ...formData, estimatedDuration: val });
                      }}
                      onBlur={() => {
                        // Basic validation on blur
                        const parts = formData.estimatedDuration.split(':');
                        let h = parts[0] || '00';
                        let m = parts[1] || '00';
                        if (h.length === 1) h = '0' + h;
                        if (m.length === 1) m = '0' + m;
                        if (parseInt(m) > 59) m = '59';
                        setFormData({ ...formData, estimatedDuration: `${h.slice(-2)}:${m.slice(-2)}` });
                      }}
                      className="w-full bg-transparent outline-none font-mono text-lg tracking-widest text-center"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4a4a35] transition-all shadow-lg flex items-center justify-center gap-2 mt-4"
              >
                {submitting ? <Loader2 className="animate-spin" /> : <Clock size={20} />}
                Start Usage Log
              </button>
            </form>
          </motion.div>
        )
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* History Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm">
              <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Total Sessions</p>
              <p className="text-3xl font-serif font-bold text-[#5A5A40]">{totalSessions}</p>
            </div>
            <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm">
              <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Total Lab Hours</p>
              <p className="text-3xl font-serif font-bold text-[#5A5A40]">{totalHours}h</p>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-serif font-bold text-[#1a1a1a]">Usage History</h2>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold bg-gray-100 px-3 py-1 rounded-full">Last 20 Sessions</p>
          </div>

          {history.length === 0 ? (
            <div className="bg-white rounded-[32px] p-20 text-center border-2 border-dashed border-gray-100">
              <History className="mx-auto text-gray-200 mb-4" size={48} />
              <p className="text-gray-400 font-serif italic">No previous logs found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map(log => (
                <div key={log.id} className="bg-white rounded-[24px] p-4 sm:p-6 shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-50 text-[#5A5A40] rounded-2xl flex items-center justify-center font-bold text-base sm:text-lg">
                      {log.roomNumber}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900 text-sm sm:text-base">{log.college}</p>
                        <span className="text-[9px] sm:text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold uppercase">{getProgramAcronym(log.program)}</span>
                      </div>
                      <p className="text-[10px] sm:text-xs text-gray-500">{log.campus} • {log.year} {log.section}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-8 border-t sm:border-t-0 pt-4 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <p className="text-[9px] sm:text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Date</p>
                      <p className="text-xs sm:text-sm font-medium">{log.startTime.toDate().toLocaleDateString()}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[9px] sm:text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Duration</p>
                      <p className="text-xs sm:text-sm font-bold text-[#5A5A40]">{log.durationMinutes || 0} mins</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[9px] sm:text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Status</p>
                      <span className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${log.autoEnded ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {log.autoEnded ? 'Auto' : 'Done'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <div className="mt-12 text-center space-y-4">
        <button 
          onClick={() => setShowMobileTest(true)}
          className="text-[#5A5A40] text-xs font-bold uppercase tracking-widest hover:underline"
        >
          Test on Mobile (Show QR)
        </button>
        <p className="text-xs text-gray-400">
          All logs are subject to verification by the Laboratory Administrator.
        </p>
      </div>

      <AnimatePresence>
        {showTakeoverModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                <Clock size={32} />
              </div>
              
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-serif font-bold text-gray-900">Room Already In Use</h3>
                <p className="text-gray-500">
                  Room <span className="font-bold text-gray-900">{formData.roomNumber}</span> is currently logged as 'In Use' by 
                  <span className="font-bold text-gray-900"> {conflictLog?.professorName}</span>.
                </p>
                <p className="text-sm text-gray-400 italic">
                  Did they forget to end their session?
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleTakeover}
                  disabled={submitting}
                  className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4a4a35] transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="animate-spin" /> : <CheckCircle size={20} />}
                  Yes, End Their Session & Start Mine
                </button>
                <button
                  onClick={() => {
                    setShowTakeoverModal(false);
                    setConflictLog(null);
                  }}
                  className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Test Modal */}
      <AnimatePresence>
        {showMobileTest && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-6"
            >
              <h3 className="text-xl font-serif font-bold">Open on your Phone</h3>
              <div className="bg-white p-4 rounded-2xl border-2 border-gray-100 inline-block">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.href)}`}
                  alt="App QR Code"
                  className="w-48 h-48"
                />
              </div>
              <p className="text-sm text-gray-500">
                Scan this with your phone camera to test as a second professor!
              </p>
              <button
                onClick={() => setShowMobileTest(false)}
                className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
