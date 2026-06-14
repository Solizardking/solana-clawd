import { useState, useEffect, useCallback, useRef } from 'react';
import { getWsUrl } from '@/lib/websocket';

// Message types for more standardized communication
export enum MessageType {
  // Chat related events
  NEW_MESSAGE = 'new_message',
  USER_JOINED = 'user_joined',
  USER_LEFT = 'user_left',
  ERROR = 'error',
  
  // General agent events
  AGENT_CREATED = 'agent_created',
  AGENT_UPDATED = 'agent_updated',
  AGENT_DELETED = 'agent_deleted',
  
  // Transaction events
  AGENT_LAUNCH_STARTED = 'agent_launch_started',
  AGENT_LAUNCH_COMPLETE = 'agent_launch_complete',
  AGENT_LAUNCH_FAILED = 'agent_launch_failed',
  
  // Communication events
  AGENT_RESPONSE = 'agent_response',
  AGENT_STREAM_START = 'agent_stream_start',
  AGENT_STREAM_CHUNK = 'agent_stream_chunk',
  AGENT_STREAM_END = 'agent_stream_end',
  
  // System events
  PING = 'ping',
  PONG = 'pong',
  CONNECTION_ESTABLISHED = 'connection_established'
}

export interface WebSocketMessage {
  type: MessageType | string;
  clientId?: string;
  timestamp?: string;
  userId?: string;
  walletAddress?: string;
  error?: string;
  echo?: string; // Used for pong responses
  [key: string]: any; // Allow for additional properties
}

export type MessageHandler = (data: WebSocketMessage) => void;

type MessageHandlerMap = {
  [key: string]: MessageHandler[];
};

export function useWebSocket(enabled = true) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  // Use a ref for message handlers to avoid unnecessary re-renders
  const messageHandlers = useRef<MessageHandlerMap>({});

  // Register a message handler with improved typing
  const registerMessageHandler = useCallback((type: MessageType | string, handler: MessageHandler) => {
    messageHandlers.current[type] = messageHandlers.current[type] || [];
    messageHandlers.current[type].push(handler);
    
    // Return a function to unregister this handler
    return () => {
      const handlers = messageHandlers.current[type];
      const index = handlers?.indexOf(handler);
      if (handlers && index !== -1) {
        handlers.splice(index, 1);
      }
    };
  }, []);

  // Establish connection
  useEffect(() => {
    if (!enabled) {
      setSocket(null);
      setClientId(null);
      setIsConnected(false);
      return;
    }

    if (window.location.hostname.endsWith("vercel.app")) {
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let pingInterval: ReturnType<typeof setInterval>;
    
    const connectWebSocket = () => {
      try {
        const wsUrl = getWsUrl('/ws');

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
              ws.send(JSON.stringify({ 
                type: MessageType.PING,
                timestamp: new Date().toISOString()
              }));
            }
          }, 30000); // Send ping every 30 seconds
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WebSocketMessage;
            
            // Process connection established message to get client ID
            if (data.type === MessageType.CONNECTION_ESTABLISHED) {
              console.log("WebSocket connection established. Client ID:", data.clientId);
              setClientId(data.clientId || null);
            }
            
            // Process messages with registered handlers
            const handlers = messageHandlers.current[data.type] || [];
            handlers.forEach(handler => {
              try {
                handler(data);
              } catch (handlerError) {
                console.error(`Error in handler for message type "${data.type}":`, handlerError);
              }
            });
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
  }, [connectionAttempts, enabled]);
  
  // Send message utility with improved typing
  const sendMessage = useCallback((type: MessageType | string, payload: Record<string, any> = {}) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type,
        clientId: clientId || undefined,
        timestamp: new Date().toISOString(),
        ...payload
      };
      socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, [socket, clientId]);
  
  return { 
    socket, 
    clientId, 
    isConnected, 
    sendMessage,
    registerMessageHandler
  };
}
