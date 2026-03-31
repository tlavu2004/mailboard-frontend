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

  useEffect(() => {
    if (!accountId) return;

    // Construct WebSocket URL based on current API URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api/v1';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Extract host and port from apiUrl if possible, otherwise use window.location.host
    let host = window.location.host;
    try {
      const url = new URL(apiUrl);
      host = url.host;
    } catch (e) {
      // Fallback to current host if apiUrl is relative or invalid
    }

    const wsUrl = `${protocol}//${host}/ws/notifications?accountId=${accountId}`;
    console.log(`[WebSocket] Connecting to ${wsUrl}`);

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log(`[WebSocket] Connected for account ${accountId}`);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as NotificationMessage;
          console.log('[WebSocket] Received notification:', data);
          onNotification(data);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', event.data);
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
  }, [accountId, onNotification]);
};
