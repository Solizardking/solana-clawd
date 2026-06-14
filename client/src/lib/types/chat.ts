export type ClientType = 'web' | 'telegram' | 'terminal';

export interface ClientMessage {
  type: 'chat_message' | 'ping';
  clientId?: string;
  clientType: ClientType;
  content?: string;
  username?: string;
  timestamp: string;
}

export interface ServerMessage {
  type: 'chat_message' | 'connection_established' | 'pong';
  clientId?: string;
  clientType?: ClientType;
  content?: string;
  username?: string;
  timestamp: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'telegram_user';
  content: string;
  username?: string;
  timestamp?: string;
}

export interface ConnectedUser {
  clientId: string;
  username: string;
  clientType: ClientType;
  isOnline: boolean;
  lastActive: string;
}