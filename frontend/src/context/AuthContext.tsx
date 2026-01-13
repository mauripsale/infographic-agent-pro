"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User, 
  GoogleAuthProvider, 
  getRedirectResult 
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

// Add scopes for Google Slides and Drive
googleProvider.addScope('https://www.googleapis.com/auth/presentations');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  getGoogleAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  useEffect(() => {
    // Handle redirect result
    getRedirectResult(auth).then((result) => {
        if (result) {
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                setGoogleAccessToken(credential.accessToken);
            }
        }
    }).catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
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

  const logout = async () => {
    try {
      await signOut(auth);
      setGoogleAccessToken(null);
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
    <AuthContext.Provider value={{ user, loading, login, logout, getToken, getGoogleAccessToken }}>
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
