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
    console.log(`[WebSocket] Attempting connection to: ${wsUrl}`);

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log(`[WebSocket] Connected for account ${accountId}`);
      };

      ws.onmessage = (event) => {
        try {
          console.log('[WebSocket] Raw message received:', event.data);
          const data = JSON.parse(event.data) as NotificationMessage;
          console.log('[WebSocket] Parsed notification:', data);
          onNotificationRef.current(data);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message as JSON:', event.data, e);
          // Fallback: If it's a raw string, we can still notify with it
          onNotificationRef.current({ type: 'INFO', message: event.data });
        }
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] Disconnected: ${event.reason}. Retrying in 5s...`);
        // Simple reconnection logic
        setTimeout(connect, 5000);
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        ws.close();
      };
    };

    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [accountId]);
};
