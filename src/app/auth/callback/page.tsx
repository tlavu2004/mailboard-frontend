'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { message } from 'antd';
import { useAuth } from '@/contexts/AuthContext';

export default function GoogleCallbackPage() {
  const router = useRouter();
  const { googleAuth } = useAuth();
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      message.error('Google login was cancelled or failed.');
      router.replace('/login');
      return;
    }

    if (!code) {
      message.error('No authorization code received from Google.');
      router.replace('/login');
      return;
    }

    googleAuth({ code })
      .then(() => {
        message.success('Logged in successfully!');
        // AuthContext.googleAuth already redirects to /inbox
      })
      .catch((err) => {
        console.error('Google auth failed:', err);
        message.error('Google authentication failed. Please try again.');
        router.replace('/login');
      });
  }, [router, googleAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4" />
        <p className="text-gray-600">Completing Google sign-in...</p>
      </div>
    </div>
  );
}
