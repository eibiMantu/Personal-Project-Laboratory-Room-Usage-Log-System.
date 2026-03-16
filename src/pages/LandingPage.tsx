import React, { useState, useEffect } from 'react';
import { signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, QrCode, ShieldCheck, Loader2, LogOut, LayoutDashboard, CheckCircle } from 'lucide-react';
import QRScanner from '../components/QRScanner';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const [showScanner, setShowScanner] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("LandingPage: Auth state changed", user?.email);
      setCurrentUser(user);
      if (user) {
        console.log("LandingPage: User detected, forcing redirect to root...");
        // If we're already logged in, we should be at the root to let App.tsx handle it
        if (window.location.pathname !== '/') {
          navigate('/');
        }
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    
    // Check if already authenticated but profile is missing/pending
    if (auth.currentUser) {
      console.log("User already authenticated, waiting for profile...");
      // If they click again, maybe they want to try a different account?
      // Or just wait. Let's show a message.
      alert("You are already signed in. Please wait a moment for your profile to load. If it takes too long, try refreshing the page.");
      return;
    }

    setIsLoggingIn(true);
    console.log("Starting login process...");
    
    try {
      // Clear any previous error messages
      setSuccessMessage(null);
      
      const isIframe = window.self !== window.top;
      
      if (isIframe) {
        console.log("In iframe, attempting popup...");
        await signInWithPopup(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
      console.log("Login successful");
      // App.tsx will handle the redirect based on role
    } catch (error: any) {
      console.error("Login failed:", error.code, error.message);
      setIsLoggingIn(false); // Reset state on error
      
      if (error.code === 'auth/popup-closed-by-user') {
        return;
      }

      if (
        error.code === 'auth/popup-blocked' || 
        error.code === 'auth/cancelled-popup-request' ||
        error.message?.includes('INTERNAL ASSERTION FAILED')
      ) {
        try {
          console.log("Switching to redirect login...");
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError) {
          console.error("Redirect failed", redirectError);
          alert("Login failed. Please try opening the app in a new tab using the icon in the top-right corner.");
        }
      } else {
        alert(`Login failed: ${error.message || "Please try again."}`);
      }
    }
  };

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleScan = (data: string) => {
    setShowScanner(false);
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'NEU_LAB_ROOM' && parsed.roomNumber) {
        // Store the room for after login
        sessionStorage.setItem('pending_room', parsed.roomNumber);
        setSuccessMessage(`Room ${parsed.roomNumber} detected! Please login to start your session.`);
        
        // Auto-trigger login after a short delay to let the user see the message
        setTimeout(() => {
          handleLogin();
        }, 1500);
      } else {
        alert("Invalid QR Code. Please scan a valid NEU Lab Room QR.");
      }
    } catch (e) {
      alert("Invalid QR Code format.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-[#f5f5f0]">
      <AnimatePresence>
        {showScanner && (
          <QRScanner 
            onScan={handleScan} 
            onClose={() => setShowScanner(false)} 
          />
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[24px] sm:rounded-[32px] shadow-xl p-6 sm:p-10 text-center border border-[#5A5A40]/10 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#5A5A40] to-transparent opacity-20"></div>
        
        <div className="mb-6 sm:mb-8 flex justify-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#5A5A40] rounded-2xl flex items-center justify-center text-white shadow-lg transform -rotate-3 hover:rotate-0 transition-transform duration-500">
            <ShieldCheck size={32} className="sm:w-10 sm:h-10" />
          </div>
        </div>
        
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#1a1a1a] mb-1 tracking-tight">NEU</h1>
        <p className="text-[#5A5A40] font-serif italic mb-6 sm:mb-8 text-xs sm:text-sm opacity-80">Laboratory Usage Log System</p>
        
        <AnimatePresence>
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl flex items-center gap-3 text-sm font-medium"
            >
              <CheckCircle size={18} />
              {successMessage}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 gap-4">
          {currentUser ? (
            <div className="space-y-4">
              <div className="p-4 bg-white border border-[#5A5A40]/20 rounded-2xl text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Signed in as</p>
                <p className="text-sm font-serif font-bold text-[#5A5A40] truncate">{currentUser.email}</p>
              </div>
              
              <button
                onClick={() => {
                  console.log("Go to Dashboard clicked");
                  setIsLoggingIn(true);
                  // Force a reload to root to trigger App.tsx logic
                  window.location.href = '/';
                }}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold bg-[#5A5A40] text-white hover:bg-[#4a4a35] transition-all shadow-lg shadow-[#5A5A40]/20 disabled:opacity-50"
              >
                {isLoggingIn ? <Loader2 className="animate-spin" /> : <LayoutDashboard size={20} />} 
                {isLoggingIn ? 'Entering...' : 'Go to Dashboard'}
              </button>

              <button
                onClick={() => signOut(auth)}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
              >
                <LogOut size={20} /> Sign Out
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Manual Path */}
              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className={`w-full group p-6 bg-white border-2 border-gray-100 rounded-[24px] text-left hover:border-[#5A5A40] hover:shadow-xl transition-all duration-500 relative overflow-hidden ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-[10px] font-bold text-[#5A5A40] uppercase tracking-widest mb-1">Version 1</p>
                    <h3 className="text-xl font-serif font-bold text-gray-900">Professor Portal</h3>
                    <p className="text-xs text-gray-400 mt-1">Manual login and room entry</p>
                  </div>
                  <div className="w-12 h-12 bg-gray-50 group-hover:bg-[#5A5A40] group-hover:text-white rounded-xl flex items-center justify-center transition-colors">
                    {isLoggingIn ? <Loader2 className="animate-spin" /> : <LogIn size={24} />}
                  </div>
                </div>
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100"></div>
                </div>
                <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest">
                  <span className="bg-white px-3 text-gray-300">or</span>
                </div>
              </div>

              {/* Automatic Path */}
              <button
                onClick={() => setShowScanner(true)}
                className="w-full group p-6 bg-[#5A5A40] rounded-[24px] text-left hover:bg-[#4a4a35] hover:shadow-xl transition-all duration-500 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform"></div>
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">Version 2</p>
                    <h3 className="text-xl font-serif font-bold text-white">Quick Scan</h3>
                    <p className="text-xs text-white/60 mt-1">Automatic room detection</p>
                  </div>
                  <div className="w-12 h-12 bg-white/10 text-white rounded-xl flex items-center justify-center">
                    <QrCode size={24} />
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="mt-10 pt-8 border-t border-gray-50 flex flex-col items-center gap-4">
          <div className="text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mb-2">
              Security Notice
            </p>
            <p className="text-[11px] text-gray-500 leading-relaxed px-4">
              Authorized personnel only. Please use your registered Google account to access the portal.
            </p>
          </div>
        </div>
      </motion.div>
      
      <footer className="mt-12 text-center space-y-6">
        <div className="flex items-center justify-center gap-6 opacity-30 grayscale">
          <img src="https://picsum.photos/seed/neu1/100/100" alt="NEU Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
          <div className="w-px h-6 bg-gray-400"></div>
          <img src="https://picsum.photos/seed/neu2/100/100" alt="Lab Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
        </div>
        
        <div className="space-y-4">
          <p className="text-[#5A5A40]/60 text-xs font-serif italic">
            New Era University - Laboratory Management System
          </p>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
            © 2026 NEU Laboratory Admin. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
