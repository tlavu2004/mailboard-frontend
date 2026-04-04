import { useEffect, useRef } from 'react';

interface NotificationMessage {
  type: string;
  message: string;
}

export const useEmailNotifications = (
  accountId: number | string | null,
  onNotification: (message: NotificationMessage) => void
) => {
  const socketRef = useRef<WebSocket | null>(null);
  const onNotificationRef = useRef(onNotification);
  const failureCountRef = useRef(0);
  const lastAttemptTimeRef = useRef(0);

  // Keep ref updated to latest callback
  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    if (!accountId) return;

    // Construct WebSocket URL based on current API URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api/v1';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    let host = window.location.host;
    try {
      if (apiUrl.startsWith('http')) {
        const url = new URL(apiUrl);
        host = url.host;
      } else {
        // Relative API URL, use current window host
        host = window.location.host;
      }
    } catch (e) {
      console.warn('[WebSocket] Failed to parse apiUrl, using window.location.host', e);
    }

    // DEBUG: If on localhost and no port is specified, try assuming backend is on 8080
    if (host === 'localhost' || host === '127.0.0.1') {
      console.log('[WebSocket] Detected localhost without port, trying backend port 8080');
      host = `${host}:8080`;
    }

    const wsUrl = `${protocol}//${host}/ws/notifications?accountId=${accountId}`;

    const connect = () => {
      // If we've failed too many times quickly, stop until an online event fires
      if (failureCountRef.current >= 3 && !navigator.onLine) {
        console.log('[WebSocket] Too many fast failures, waiting for real online event.');
        return;
      }

      if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
        return;
      }

      lastAttemptTimeRef.current = Date.now();
      console.log(`[WebSocket] Connecting to: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log(`[WebSocket] Connected for account ${accountId}`);
        failureCountRef.current = 0; // Reset on success
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as NotificationMessage;
          onNotificationRef.current(data);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
          onNotificationRef.current({ type: 'INFO', message: event.data });
        }
      };

      ws.onclose = (event) => {
        const duration = Date.now() - lastAttemptTimeRef.current;
        console.log(`[WebSocket] Disconnected: ${event.reason} (Duration: ${duration}ms)`);
        
        // If it failed very quickly (less than 2s), it's likely a persistent network/offline issue
        if (duration < 2000) {
          failureCountRef.current++;
        }

        if (failureCountRef.current >= 3) {
          console.log('[WebSocket] Persistent failures detected. Stopping retries until network state changes.');
          return;
        }

        if (navigator.onLine) {
          console.log(`[WebSocket] Retry attempt ${failureCountRef.current + 1} in 5s...`);
          setTimeout(connect, 5000);
        }
      };

      ws.onerror = (error) => {
        console.warn('[WebSocket] Connection error');
        ws.close();
      };
    };

    const handleOnline = () => {
      console.log('[WebSocket] Network online event, resetting failures and reconnecting...');
      failureCountRef.current = 0;
      connect();
    };
    
    const handleOffline = () => {
      console.log('[WebSocket] Network offline, closing socket...');
      if (socketRef.current) {
        socketRef.current.close();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    connect();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [accountId]);
};
