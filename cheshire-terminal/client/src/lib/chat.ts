type MessageHandler = (message: ChatMessage) => void;

export interface ChatMessage {
  type: 'message' | 'join' | 'leave' | 'history';
  room: string;
  sender: string;
  content: string;
  timestamp: number;
  messages?: ChatMessage[]; // For history type
}

class ChatService {
  private socket: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectTimer: number | null = null;
  private roomId: string | null = null;
  private username: string | null = null;

  connect(username: string, roomId: string) {
    this.username = username;
    this.roomId = roomId;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('Connected to chat server');
      this.joinRoom(roomId);
    };

    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.messageHandlers.forEach(handler => handler(message));
    };

    this.socket.onclose = () => {
      console.log('Disconnected from chat server');
      if (this.reconnectTimer === null) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          if (this.username && this.roomId) {
            this.connect(this.username, this.roomId);
          }
        }, 3000);
      }
    };
  }

  private joinRoom(roomId: string) {
    if (this.socket?.readyState === WebSocket.OPEN && this.username) {
      this.socket.send(JSON.stringify({
        type: 'join',
        room: roomId,
        sender: this.username,
        content: '',
        timestamp: Date.now()
      }));
    }
  }

  sendMessage(content: string) {
    if (this.socket?.readyState === WebSocket.OPEN && this.roomId && this.username) {
      this.socket.send(JSON.stringify({
        type: 'message',
        room: this.roomId,
        sender: this.username,
        content,
        timestamp: Date.now()
      }));
    }
  }

  subscribe(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.messageHandlers.clear();
    this.roomId = null;
    this.username = null;
  }
}

export const chatService = new ChatService();
