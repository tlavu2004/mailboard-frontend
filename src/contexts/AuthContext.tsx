'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { User, LoginRequest, SignupRequest, GoogleAuthRequest } from '@/types/auth';
import { authService } from '@/services/auth';
import { getRefreshToken, getAccessToken } from '@/services/api';

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
  
  // Helper to clear PWA cache
  const clearPWACache = () => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      console.log('[AuthContext] Requesting Service Worker to clear cache...');
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
    }
  };

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
      console.log('[AuthContext] Initializing checkAuth...');
      const refreshToken = getRefreshToken();
      const accessToken = getAccessToken();
      console.log(`[AuthContext] Tokens found: access=${!!accessToken}, refresh=${!!refreshToken}`);

      if (refreshToken) {
        try {
          console.log('[AuthContext] Attempting to fetch current user data...');
          const userData = await authService.getMe();
          console.log('[AuthContext] Successfully recovered user:', userData.email);
          setUser(userData);
        } catch (error) {
          console.error('[AuthContext] Failed to recover user during refresh. This may trigger a logout if refresh token also fails.', error);
          // If getMe fails, the axios interceptor might have already tried refreshing and failed.
          // Or the access token was invalid and refresh also failed.
          // If we still have a refreshToken, don't clear tokens yet? 
          // Actually, if getMe fails after internal retry, then we are truly logged out.
        }
      } else {
        console.log('[AuthContext] No refresh token found, skipping background auth.');
      }

      setLoading(false);
      console.log('[AuthContext] Lifecycle initialization complete.');
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
      clearPWACache();
      setUser(response.user);
      router.push('/inbox');
    } catch (error) {
      throw error;
    }
  };

  const signup = async (data: SignupRequest) => {
    try {
      const response = await authService.signup(data);
      clearPWACache();
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
        clearPWACache();
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
      clearPWACache();
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
