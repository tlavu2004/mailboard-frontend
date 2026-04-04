'use client';

import React from 'react';
import { Button, Typography } from 'antd';
import { WifiOff, RotateCw, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;

export default function OfflinePage() {
  const router = useRouter();

  const handleRetry = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    router.push('/');
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{ 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}
    >
      <div 
        className="max-w-md w-full p-10 text-center rounded-3xl shadow-2xl animate-fadeIn"
        style={{
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.5)'
        }}
      >
        <div className="mb-8 inline-flex items-center justify-center w-24 h-24 rounded-full bg-red-50 text-red-500 animate-pulse">
          <WifiOff size={48} strokeWidth={1.5} />
        </div>

        <Title level={2} style={{ color: '#1e293b', marginBottom: '12px' }}>
          You're Offline
        </Title>
        
        <Text type="secondary" style={{ fontSize: '16px', display: 'block', marginBottom: '32px' }}>
          It looks like your internet connection is currently unavailable. 
          Don't worry, MailBoard is ready to sync as soon as you're back online.
        </Text>

        <div className="flex flex-col gap-3">
          <Button 
            type="primary" 
            size="large" 
            icon={<RotateCw size={18} />} 
            onClick={handleRetry}
            className="h-12 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-lg shadow-blue-200"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
          >
            Try Again
          </Button>
          
          <Button 
            size="large" 
            icon={<Home size={18} />} 
            onClick={handleGoHome}
            className="h-12 rounded-xl flex items-center justify-center gap-2 font-medium border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200"
          >
            Back to Dashboard
          </Button>
        </div>

        <p className="mt-8 text-xs text-slate-400 uppercase tracking-widest">
          MailBoard Offline Mode
        </p>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}
