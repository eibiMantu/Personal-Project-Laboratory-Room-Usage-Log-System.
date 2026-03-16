import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, signOut, User, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from './lib/firebase';
import { UserProfile } from './types';
import { LogIn, LogOut, LayoutDashboard, UserCircle, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Pages
import ProfessorDashboard from './pages/ProfessorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import LandingPage from './pages/LandingPage';

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle redirect result
    getRedirectResult(auth).catch((error) => {
      console.error("Redirect login error:", error);
    });

    let profileUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser?.email);
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (firebaseUser) {
        setLoading(true);
        setUser(firebaseUser);
        
        // Initial check and setup
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          console.log("Checking profile for:", firebaseUser.uid);
          const userDoc = await getDoc(userRef);
          
          if (!userDoc.exists()) {
            console.log("Profile doesn't exist, creating...");
            // FORCE ADMIN LIST: Add any Gmail here to bypass approval and force Admin role
            const defaultAdmins = [
              'alyssabernadette.tuliao@neu.edu.ph',
              'tuliaoalyssab@gmail.com',
              'jcesperanza@neu.edu.ph'
            ];
            const userEmail = (firebaseUser.email || '').toLowerCase();
            const isDefaultAdmin = defaultAdmins.some(email => email.toLowerCase() === userEmail);
            
            let assignedRole: 'professor' | 'admin' | 'pending' = isDefaultAdmin ? 'admin' : 'pending';
            
            try {
              const preAuthDoc = await getDoc(doc(db, 'pre_authorized', userEmail));
              if (preAuthDoc.exists()) {
                assignedRole = preAuthDoc.data().role;
                console.log("Found pre-authorized role:", assignedRole);
              }
            } catch (e) {
              console.error("Error checking pre-auth:", e);
            }

            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'User',
              photoURL: firebaseUser.photoURL || '',
              role: assignedRole,
              isBlocked: false,
              createdAt: Timestamp.now(),
            };
            await setDoc(userRef, newProfile);
            console.log("Profile created with role:", assignedRole);
          } else {
            // Profile exists, check if it's pending and if they are now pre-authorized
            const currentData = userDoc.data() as UserProfile;
            if (currentData.role === 'pending') {
              const userEmail = (firebaseUser.email || '').toLowerCase();
              try {
                const preAuthDoc = await getDoc(doc(db, 'pre_authorized', userEmail));
                if (preAuthDoc.exists()) {
                  const preAuthRole = preAuthDoc.data().role;
                  if (preAuthRole !== 'pending') {
                    console.log("Auto-upgrading pending user to:", preAuthRole);
                    await setDoc(userRef, { role: preAuthRole }, { merge: true });
                  }
                }
              } catch (e) {
                console.error("Error during auto-upgrade check:", e);
              }
            }
          }

          // Set up real-time listener for profile changes
          profileUnsubscribe = onSnapshot(userRef, async (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as UserProfile;
              console.log("Profile data received:", data.role);
              
              // Self-healing for admins
              const defaultAdmins = [
                'alyssabernadette.tuliao@neu.edu.ph',
                'tuliaoalyssab@gmail.com',
                'jcesperanza@neu.edu.ph'
              ];
              const userEmail = (firebaseUser.email || '').toLowerCase();
              const isDefaultAdmin = defaultAdmins.some(email => email.toLowerCase() === userEmail);

              if (isDefaultAdmin && data.role !== 'admin') {
                console.log("Self-healing admin role for:", userEmail);
                await setDoc(userRef, { role: 'admin' }, { merge: true });
                return;
              }

              if (data.isBlocked) {
                console.log("User is blocked");
                await signOut(auth);
                alert('Your account has been blocked by the administrator.');
                setUser(null);
                setProfile(null);
              } else {
                setUser(firebaseUser);
                setProfile(data);
              }
            } else {
              console.log("Profile snapshot does not exist");
              // This shouldn't happen if we just created it, but if it does, 
              // we still set the user so they aren't stuck on the landing page
              setUser(firebaseUser);
              setProfile(null);
            }
            setLoading(false);
          }, (error) => {
            console.error("Profile listener error:", error);
            // If we can't listen to the profile, we might have a permission error
            // but we should still set the user so the UI can react
            setUser(firebaseUser);
            setLoading(false);
          });

        } catch (error: any) {
          console.error("Error setting up user profile:", error.code, error.message);
          // If it's a permission error, it might be because the user is new and 
          // we're trying to read a profile that doesn't exist yet with strict rules.
          // But our rules allow reading own profile.
          setLoading(false);
        }
      } else {
        console.log("No firebase user");
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-[#5A5A40] animate-spin" />
          <p className="text-[#5A5A40] font-serif italic">Loading NEU Lab Portal...</p>
        </div>
      </div>
    );
  }

  // Access Denied / Pending Approval View
  if (user && profile?.role === 'pending') {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-[32px] p-10 shadow-xl text-center space-y-6 border border-amber-100"
        >
          <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-serif font-bold text-gray-900">Access Pending</h1>
            <p className="text-gray-500">
              Your account (<span className="font-bold">{profile.email}</span>) is currently awaiting administrator approval.
            </p>
            <p className="text-sm text-gray-400 italic">
              Only authorized Professors can access the laboratory portal.
            </p>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={20} /> Sign Out
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-[#f5f5f0] font-sans text-[#1a1a1a]">
        <Routes>
          <Route path="/" element={
            user ? (
              profile?.role === 'admin' ? <Navigate to="/admin" /> : 
              profile?.role === 'professor' ? <Navigate to="/professor" /> :
              profile?.role === 'pending' ? <div className="p-20 text-center">Redirecting to pending screen...</div> :
              <div className="p-20 text-center">Loading profile...</div>
            ) : (
              <LandingPage />
            )
          } />
          
          <Route path="/professor/*" element={
            user && profile?.role === 'professor' ? (
              <ProfessorDashboard profile={profile} />
            ) : (
              <Navigate to="/" />
            )
          } />

          <Route path="/admin/*" element={
            user && profile?.role === 'admin' ? (
              <AdminDashboard profile={profile} />
            ) : (
              <Navigate to="/" />
            )
          } />
        </Routes>
      </div>
    </Router>
  );
}
