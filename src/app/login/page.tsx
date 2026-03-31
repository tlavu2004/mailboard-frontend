'use client';

import { useState } from 'react';
import axios from 'axios';
import { Form, Input, message } from 'antd';
import { Sparkles, Lock, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

interface FormValues {
  email: string;
  password: string;
  name?: string;
}

function LoginContent() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { login, signup, googleAuth } = useAuth();
  const [form] = Form.useForm();

  const handleEmailAuth = async (values: FormValues) => {
    setLoading(true);
    try {
      if (isLogin) {
        await login({ email: values.email, password: values.password });
        message.success('Login successful!');
      } else {
        await signup({
          email: values.email,
          password: values.password,
          name: values.name || ""
        });
        message.success('Signup successful!');
      }
    } catch (error: unknown) {
      let errorMessage = 'Authentication failed';
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
  };

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

  const toggleMode = () => {
    setIsLogin(!isLogin);
    form.resetFields();
  };

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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">AI Email Box</h1>
          <p className="text-slate-500 mt-2">Smart email inbox for the new generation</p>
        </div>

        {/* Glass Card */}
        <div 
          className="p-8 rounded-3xl shadow-xl"
          style={{
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
          }}
        >
          <h2 className="text-xl font-semibold text-slate-800 mb-6 text-center">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h2>

          {/* Google Login Button */}
          <button 
            onClick={() => googleLogin()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 py-3 px-4 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-all duration-200 active:scale-[0.98] mb-6 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {isLogin ? 'Continue with Google' : 'Sign up with Google'}
          </button>

          {/* Divider */}
          <div className="relative flex items-center mb-6">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="mx-4 text-xs text-slate-400 uppercase tracking-wider">Or use Email</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Login Form */}
          <Form
            form={form}
            name="auth"
            onFinish={handleEmailAuth}
            layout="vertical"
            className="space-y-4"
          >
            {!isLogin && (
              <Form.Item
                name="name"
                rules={[
                  { required: true, message: 'Please input your name!' },
                  { min: 2, message: 'Name must be at least 2 characters' }
                ]}
                className="!mb-4"
              >
                <div className="relative">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                  <Input
                    placeholder="Full Name"
                    className="!w-full !pl-11 !py-3 !rounded-xl !border-slate-200 focus:!ring-2 focus:!ring-blue-500 focus:!border-transparent"
                  />
                </div>
              </Form.Item>
            )}

            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Please input your email!' },
                { type: 'email', message: 'Please enter a valid email!' }
              ]}
              className="!mb-4"
            >
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                <Input
                  type="email"
                  placeholder="example@aiemailbox.com"
                  className="!w-full !pl-11 !py-3 !rounded-xl !border-slate-200 focus:!ring-2 focus:!ring-blue-500 focus:!border-transparent"
                />
              </div>
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: 'Please input your password!' },
                { min: 6, message: 'Password must be at least 6 characters' }
              ]}
              className="!mb-4"
            >
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                <Input.Password
                  placeholder="••••••••"
                  className="!w-full !pl-11 !py-3 !rounded-xl !border-slate-200 focus:!ring-2 focus:!ring-blue-500 focus:!border-transparent"
                />
              </div>
            </Form.Item>

            <Form.Item className="!mb-0 !mt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-all duration-200 shadow-lg shadow-blue-200 active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
              </button>
            </Form.Item>
          </Form>

          <p className="text-center text-sm text-slate-500 mt-8">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={toggleMode} 
              className="text-blue-600 font-medium hover:underline"
            >
              {isLogin ? 'Sign up now' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8 uppercase tracking-widest">
          © 2026 aiemailbox Inc.
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
