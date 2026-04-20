'use client';

import { useState } from 'react';
import axios from 'axios';
import { message } from 'antd';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

function LoginContent() {
  const [loading, setLoading] = useState(false);
  const { googleAuth } = useAuth();

  const googleLogin = useGoogleLogin({
    onSuccess: async (codeResponse: any) => {
      setLoading(true);
      try {
        await googleAuth({ code: codeResponse.code });
        message.success('Google authentication successful!');
      } catch (error: unknown) {
        let errorMessage = 'Google authentication failed';
        if (axios.isAxiosError(error)) {
          const data = error.response?.data as { message?: string } | undefined;
          errorMessage = data?.message || error.message;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }
        message.error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      message.error('Google authentication failed');
    },
    flow: 'auth-code',
    ux_mode: 'redirect',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost'}/auth/callback`,
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send email profile openid',
    prompt: 'consent',
    select_account: true,
  } as any);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(circle at top right, #f8fafc, #e2e8f0)' }}
    >
      <div className="w-full max-w-md animate-fadeIn">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg mb-4 text-white" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <Sparkles size={40} strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">MailBoard</h1>
          <p className="text-slate-500 mt-2">Smart email inbox for the new generation</p>
        </div>

        {/* Glass Card */}
        <div
          className="p-8 rounded-3xl shadow-xl flex flex-col items-center"
          style={{
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
          }}
        >
          <h2 className="text-xl font-semibold text-slate-800 mb-6 text-center">
            Sign in to your account
          </h2>
          <p className="text-center text-slate-500 mb-8 max-w-[280px]">
            Experience a smarter, AI-powered email environment.
          </p>

          {/* Google Login Button */}
          <button
            onClick={() => googleLogin()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 py-3 px-4 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-all duration-200 active:scale-[0.98] mb-2 shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            {loading ? 'Authenticating...' : 'Sign in with Google'}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8 uppercase tracking-widest">
          © 2026 MailBoard Inc.
        </p>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''}>
      <LoginContent />
    </GoogleOAuthProvider>
  );
}
