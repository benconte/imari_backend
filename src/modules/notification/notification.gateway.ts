import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private readonly server: Server;
  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('missing token');

      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      });

      client.data.userId = payload.sub;
      await client.join(`user:${payload.sub}`);
      this.logger.debug(`WS connected  user:${payload.sub}  socket:${client.id}`);
    } catch {
      this.logger.warn(`WS auth failed — disconnecting ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    if (client.data.userId) {
      this.logger.debug(`WS disconnected user:${client.data.userId} socket:${client.id}`);
    }
  }

  /** Emit a real-time notification to every socket in the user's room. */
  emitToUser(userId: string, event: string, data: unknown): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  private extractToken(client: Socket): string | undefined {
    // Socket.IO 4.x auth object (preferred)
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;

    // Query param fallback: ?token=<jwt>
    const queryToken = client.handshake.query?.token;
    if (queryToken) return Array.isArray(queryToken) ? queryToken[0] : queryToken;

    // Authorization header fallback
    const header = client.handshake.headers?.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);

    return undefined;
  }
}
