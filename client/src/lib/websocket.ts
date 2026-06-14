import { resolveBrowserWsUrl } from "./runtimeConfig";

export function getWsUrl(path = '/ws'): string {
  const resolved = resolveBrowserWsUrl(path);
  if (!resolved) {
    return `ws://localhost:5000${path}?t=${Date.now()}`;
  }
  return `${resolved}?t=${Date.now()}`;
}

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout = 1000; // Start with 1 second
  private clientId: string | null = null;
  // Message handler that can be reassigned
  public onMessage: ((data: any) => void) | undefined;

  constructor(messageHandler?: (data: any) => void) {
    this.onMessage = messageHandler;
  }

  connect() {
    if (window.location.hostname.endsWith("vercel.app")) {
      console.warn("WebSocket disabled on Vercel serverless deployment.");
      return;
    }

    try {
      const wsUrl = getWsUrl('/ws');

      console.log('Connecting to WebSocket:', wsUrl);

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectTimeout = 1000;
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle connection established message
          if (data.type === 'connection_established') {
            this.clientId = data.clientId;
            console.log(`WebSocket connection established. Client ID: ${this.clientId}`);
          }

          this.onMessage?.(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.socket.onclose = (event) => {
        console.log(`WebSocket disconnected with code ${event.code}`);
        if (!event.wasClean) {
          this.reconnect();
        }
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.reconnect();
    }
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const timeout = this.reconnectTimeout * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting to reconnect in ${timeout}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, timeout);
  }

  send(data: any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        const message = {
          clientId: this.clientId,
          timestamp: new Date().toISOString(),
          ...data
        };
        this.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    } else {
      console.warn('WebSocket not connected, message not sent');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.clientId = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  getClientId(): string | null {
    return this.clientId;
  }
}

// Create a singleton instance
export const wsClient = new WebSocketClient();
