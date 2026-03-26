'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { User, LoginRequest, SignupRequest, GoogleAuthRequest } from '@/types/auth';
import { authService } from '@/services/auth';
import { getRefreshToken } from '@/services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  signup: (data: SignupRequest) => Promise<void>;
  googleAuth: (data: GoogleAuthRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Check if user is authenticated on mount
  useEffect(() => {
    // Aggressively kill any Service Workers to prevent caching issues
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          console.log('[Auth] Unregistering stale Service Worker');
          registration.unregister();
        }
      });
    }

    const checkAuth = async () => {
      const refreshToken = getRefreshToken();
      console.log('[AuthContext] checkAuth, found refreshToken:', !!refreshToken);
      
      if (refreshToken) {
        try {
          console.log('[AuthContext] Fetching /me...');
          const userData = await authService.getMe();
          console.log('[AuthContext] Fetch /me success:', userData.email);
          setUser(userData);
        } catch (error) {
          console.error('[AuthContext] checkAuth error, clearing tokens:', error);
          authService.clearTokens();
        }
      }
      
      setLoading(false);
      console.log('[AuthContext] checkAuth finished, user set:', !!user);
    };

    checkAuth();
  }, []);

  // Multi-tab logout sync
  useEffect(() => {
    // Listen for storage changes (logout from other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      // When refreshToken is removed in another tab, logout this tab too
      if (e.key === 'refreshToken' && e.newValue === null && user) {
        console.log('Logout detected from another tab');
        setUser(null);
        router.push('/login');
      }
    };

    // Listen for custom logout event (same tab logout)
    const handleLogoutEvent = () => {
      if (user) {
        console.log('Logout event received');
        setUser(null);
        router.push('/login');
      }
    };

    // Add event listeners
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('logout', handleLogoutEvent);

    // Cleanup
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('logout', handleLogoutEvent);
    };
  }, [user, router]);

  const login = async (data: LoginRequest) => {
    try {
      const response = await authService.login(data);
      setUser(response.user);
      router.push('/inbox');
    } catch (error) {
      throw error;
    }
  };

  const signup = async (data: SignupRequest) => {
    try {
      const response = await authService.signup(data);
      setUser(response.user);
      router.push('/inbox');
    } catch (error) {
      throw error;
    }
  };

  const googleAuth = async (data: GoogleAuthRequest) => {
    try {
      setLoading(true);
      console.log('[AuthContext] Starting googleAuth with code:', !!data.code);
      const response = await authService.googleAuth(data);
      console.log('[AuthContext] googleAuth success, user:', response.user?.email);
      
      setUser(response.user);
      console.log('[AuthContext] State updated, waiting 500ms for stability...');
      
      setTimeout(() => {
        console.log('[AuthContext] Redirecting to /inbox now');
        router.push('/inbox');
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('[AuthContext] googleAuth error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, googleAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
