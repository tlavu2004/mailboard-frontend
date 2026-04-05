'use client';

import { useEffect, useState } from 'react';
import { notification } from 'antd';
import { WifiOutlined, DisconnectOutlined } from '@ant-design/icons';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(() => typeof window !== 'undefined' ? navigator.onLine : true);
  const [api, contextHolder] = notification.useNotification();

  useEffect(() => {

    const handleOnline = () => {
      console.log('[OfflineIndicator] Network is back online');
      setIsOnline(true);
      api.success({
        message: 'Back Online',
        description: 'Internet connection restored. Synchronizing data...',
        icon: <WifiOutlined style={{ color: '#52c41a' }} />,
        placement: 'bottomRight',
        duration: 3,
      });

      // Reload fresh data when coming back online
      window.location.reload();
    };

    const handleOffline = () => {
      console.log('[OfflineIndicator] Network is offline');
      setIsOnline(false);
      api.warning({
        message: 'Connection Lost',
        description: 'You are currently offline. Some features may be limited.',
        icon: <DisconnectOutlined style={{ color: '#faad14' }} />,
        placement: 'bottomRight',
        duration: 0, // Keep it open until back online
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Initial check
    const currentStatus = navigator.onLine;
    console.log('[OfflineIndicator] Initial status:', currentStatus ? 'Online' : 'Offline');
    setIsOnline(currentStatus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [api]);

  return (
    <>
      {contextHolder}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white px-4 py-2 text-center z-[9999] text-sm font-bold shadow-md animate-pulse">
          <DisconnectOutlined className="mr-2" />
          Internet Connection Lost - Using cached data (Offline Mode)
        </div>
      )}
    </>
  );
}
