import WebSocket from 'ws';
import { Server } from 'http';
import { WebSocketMessage } from '../types';

/**
 * WebSocket Server for real-time data streaming
 */
export class WebSocketServer {
  private wss: WebSocket.Server;
  private clients: Set<WebSocket> = new Set();
  private messageQueue: WebSocketMessage[] = [];
  private broadcastInterval?: NodeJS.Timeout;

  constructor(server: Server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });
    this.setupServer();
    this.startBroadcastLoop();
  }

  /**
   * Setup WebSocket server
   */
  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection');
      this.clients.add(ws);

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connected',
        data: { message: 'Connected to Synthetic-Bull Exchange' },
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Handle messages from clients
   */
  private handleClientMessage(ws: WebSocket, data: any): void {
    // Handle ping/pong for connection health
    if (data.type === 'ping') {
      this.sendToClient(ws, {
        type: 'pong',
        data: {},
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: WebSocketMessage): void {
    // Add to queue for batched broadcasting
    this.messageQueue.push(message);
  }

  /**
   * Start broadcast loop for efficient batching
   */
  private startBroadcastLoop(): void {
    // Broadcast queued messages every 50ms for smooth updates
    this.broadcastInterval = setInterval(() => {
      if (this.messageQueue.length === 0) return;

      const messages = [...this.messageQueue];
      this.messageQueue = [];

      // Group messages by type for efficient transmission
      const grouped = this.groupMessages(messages);

      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify(grouped));
          } catch (error) {
            console.error('Error sending to client:', error);
            this.clients.delete(client);
          }
        }
      }
    }, 50);
  }

  /**
   * Group messages by type for efficient transmission
   */
  private groupMessages(messages: WebSocketMessage[]): any {
    const grouped: any = {
      timestamp: Date.now(),
      updates: {},
    };

    for (const msg of messages) {
      if (!grouped.updates[msg.type]) {
        grouped.updates[msg.type] = [];
      }
      grouped.updates[msg.type].push(msg.data);
    }

    return grouped;
  }

  /**
   * Send message to specific client
   */
  private sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending to client:', error);
      }
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all connections and cleanup
   */
  close(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }

    for (const client of this.clients) {
      client.close();
    }

    this.wss.close();
  }
}
