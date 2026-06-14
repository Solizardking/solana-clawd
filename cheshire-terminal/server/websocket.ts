import { WebSocket } from 'ws';

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
  data?: any;
  timestamp?: string;
  clientId?: string;
  userId?: string;
  walletAddress?: string;
  error?: string;
  echo?: string; // Used for pong responses
  [key: string]: any; // Allow for additional properties
}

export class WebSocketManager {
  private clients: Map<string, {
    ws: WebSocket;
    walletAddress?: string;
    username?: string;
    messageHandlers: Map<string, (message: WebSocketMessage) => void>;
  }>;
  
  constructor() {
    this.clients = new Map();
    console.log('WebSocketManager initialized');
  }

  addClient(clientId: string, ws: WebSocket): void {
    this.clients.set(clientId, {
      ws,
      messageHandlers: new Map()
    });
    console.log(`Client ${clientId} added to WebSocketManager`);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    console.log(`Client ${clientId} removed from WebSocketManager`);
  }

  updateClientInfo(clientId: string, walletAddress?: string, username?: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      if (walletAddress) client.walletAddress = walletAddress;
      if (username) client.username = username;
      console.log(`Updated info for client ${clientId}: ${username || "Unknown"} (${walletAddress ? walletAddress.slice(0, 6) + '...' : "No wallet"})`);
    }
  }

  registerMessageHandler(
    clientId: string,
    messageType: MessageType | string,
    handler: (message: WebSocketMessage) => void
  ): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.messageHandlers.set(messageType, handler);
      console.log(`Registered handler for ${messageType} messages for client ${clientId}`);
    }
  }

  sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  broadcastToAll(message: WebSocketMessage, excludeClientId?: string): void {
    this.clients.forEach((client, clientId) => {
      if (excludeClientId && clientId === excludeClientId) return;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  broadcastToUser(walletAddress: string, message: WebSocketMessage): void {
    this.clients.forEach((client) => {
      if (client.walletAddress === walletAddress && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  handleMessage(clientId: string, rawMessage: string): void {
    try {
      const message = JSON.parse(rawMessage) as WebSocketMessage;
      const client = this.clients.get(clientId);
      
      if (client) {
        // Handle pings with pongs
        if (message.type === MessageType.PING) {
          this.sendToClient(clientId, {
            type: MessageType.PONG,
            timestamp: new Date().toISOString(),
            echo: message.timestamp
          });
          return;
        }

        // Forward to any registered message handler
        const handler = client.messageHandlers.get(message.type);
        if (handler) {
          handler(message);
        }
      }
    } catch (err) {
      console.error(`Error processing message from client ${clientId}:`, err);
    }
  }
}