"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User, 
  GoogleAuthProvider,
  browserPopupRedirectResolver 
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

// NOTE: We do NOT add scopes globally here anymore.
// We request them incrementally when the user clicks "Export to Slides".
// googleProvider.addScope('https://www.googleapis.com/auth/drive.file'); 

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  getGoogleAccessToken: () => Promise<string | null>;
  grantSlidesPermissions: () => Promise<boolean>;
  hasSlidesPermissions: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [hasSlidesPermissions, setHasSlidesPermissions] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
      // Reset permissions state on auth change
      if (!user) {
        setHasSlidesPermissions(false);
        setGoogleAccessToken(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      // Basic login - no extra scopes
      const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      // Even on basic login, we might get an access token, but we don't assume it has Drive scopes yet.
      if (credential?.accessToken) {
          setGoogleAccessToken(credential.accessToken);
      }
    } catch (error: unknown) {
      console.error("Login failed", error);
      if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/popup-blocked') {
          alert("Please allow popups for sign-in");
      }
    }
  };

  const grantSlidesPermissions = async (): Promise<boolean> => {
      if (!user) return false;

      const providerWithScope = new GoogleAuthProvider();
      providerWithScope.addScope('https://www.googleapis.com/auth/drive.file');
      providerWithScope.addScope('https://www.googleapis.com/auth/presentations');
      providerWithScope.setCustomParameters({ prompt: 'consent' });
      // We use the existing auth instance but trigger a re-auth/link flow
      try {
          const result = await signInWithPopup(auth, providerWithScope, browserPopupRedirectResolver);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          
          if (credential?.accessToken) {
              setGoogleAccessToken(credential.accessToken);
              setHasSlidesPermissions(true);
              return true;
          }
          return false;
      } catch (error) {
          console.error("Failed to grant slides permissions", error);
          return false;
      }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setGoogleAccessToken(null);
      setHasSlidesPermissions(false);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const getToken = async () => {
    if (!user) return null;
    return await user.getIdToken();
  };

  const getGoogleAccessToken = async () => {
      return googleAccessToken;
  };

  return (
    <AuthContext.Provider value={{ 
        user, 
        loading, 
        login, 
        logout, 
        getToken, 
        getGoogleAccessToken,
        grantSlidesPermissions,
        hasSlidesPermissions
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}