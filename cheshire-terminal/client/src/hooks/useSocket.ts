import { useState, useEffect } from 'react';
import { getWsUrl } from '@/lib/websocket';

export function useSocket() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  useEffect(() => {
    if (window.location.hostname.endsWith("vercel.app")) {
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;
    let pingInterval: NodeJS.Timeout;
    
    const connectWebSocket = () => {
      try {
        const wsUrl = getWsUrl('/ws/v1');
        
        console.log("Connecting to WebSocket:", wsUrl);
        
        ws = new WebSocket(wsUrl);
        setSocket(ws);
        
        ws.onopen = () => {
          console.log("WebSocket connected");
          setIsConnected(true);
          setConnectionAttempts(0);
          
          // Setup ping interval to keep connection alive
          pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000); // Send ping every 30 seconds
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Process connection established message to get client ID
            if (data.type === 'connection_established') {
              console.log("WebSocket connection established. Client ID:", data.clientId);
              setClientId(data.clientId);
            }
            
            // Process pong response
            if (data.type === 'pong') {
              console.log("Received pong from server");
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
          }
        };
        
        ws.onclose = (event) => {
          console.log("WebSocket disconnected. Attempting to reconnect...", event.code, event.reason);
          setIsConnected(false);
          clearInterval(pingInterval);
          
          // Implement exponential backoff for reconnection
          const nextAttempt = Math.min(30, Math.pow(2, connectionAttempts));
          console.log(`Reconnecting in ${nextAttempt} seconds...`);
          
          reconnectTimeout = setTimeout(() => {
            setConnectionAttempts(prev => prev + 1);
            connectWebSocket();
          }, nextAttempt * 1000);
        };
        
        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };
      } catch (error) {
        console.error("Error establishing WebSocket connection:", error);
        
        // Attempt to reconnect
        reconnectTimeout = setTimeout(() => {
          setConnectionAttempts(prev => prev + 1);
          connectWebSocket();
        }, 5000);
      }
    };
    
    connectWebSocket();
    
    // Clean up on unmount
    return () => {
      if (ws) {
        ws.close();
      }
      clearTimeout(reconnectTimeout);
      clearInterval(pingInterval);
    };
  }, [connectionAttempts]);
  
  return { socket, clientId, isConnected };
}
