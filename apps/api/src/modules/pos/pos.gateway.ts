import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer, WsException } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { apiRuntimeConfig } from "@adisyon/config";
import type { Server, Socket } from "socket.io";
import { PrismaService } from "../../common/database/prisma.service";

@WebSocketGateway({
  namespace: "/pos",
  cors: {
    origin: true,
    credentials: true,
  },
})
export class PosGateway implements OnGatewayConnection {
  private readonly logger = new Logger(PosGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @WebSocketServer()
  server!: Server;

  private resolveBranchIds(payload: { branchId?: string; branchIds?: string[] }) {
    const ids = new Set<string>();
    if (payload.branchId) {
      ids.add(payload.branchId);
    }
    for (const branchId of payload.branchIds ?? []) {
      if (branchId) {
        ids.add(branchId);
      }
    }
    return [...ids];
  }

  async handleConnection(client: Socket) {
    try {
      await this.authenticateClient(client);
    } catch (error) {
      this.logger.warn(`Socket auth failed: ${error instanceof Error ? error.message : "unknown_error"}`);
      client.emit("pos.auth.error", { message: "Token gecersiz veya suresi dolmus." });
      client.disconnect(true);
    }
  }

  private async authenticateClient(client: Socket) {
    const rawToken =
      client.handshake.auth?.token ??
      client.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, "").trim();

    if (!rawToken || typeof rawToken !== "string") {
      throw new WsException("Socket yetkilendirmesi gerekli.");
    }

    let payload: { sub: string; tenantId: string; branchIds?: string[] };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; tenantId: string; branchIds?: string[] }>(rawToken, {
        secret: apiRuntimeConfig.jwtAccessSecret,
      });
    } catch {
      throw new WsException("Token gecersiz veya suresi dolmus.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        companyId: true,
        isActive: true,
        roles: {
          select: {
            branchId: true,
          },
        },
      },
    });

    if (!user || !user.isActive || user.companyId !== payload.tenantId) {
      throw new WsException("Socket oturumu gecersiz.");
    }

    const allowedBranchIds = [
      ...new Set(
        user.roles
          .map((roleLink) => roleLink.branchId)
          .filter((branchId): branchId is string => Boolean(branchId))
          .concat(payload.branchIds ?? []),
      ),
    ];

    client.data.auth = {
      userId: user.id,
      tenantId: user.companyId,
      branchIds: allowedBranchIds,
    };
  }

  @SubscribeMessage("subscribe")
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { branchId?: string; branchIds?: string[]; terminalId?: string; ticketId?: string; userId?: string },
  ) {
    if (!client.data.auth) {
      await this.authenticateClient(client);
    }

    const allowedBranchIds = new Set<string>(client.data.auth.branchIds ?? []);
    for (const branchId of this.resolveBranchIds(payload).filter((id) => allowedBranchIds.has(id))) {
      client.join(`branch:${branchId}`);
    }
    if (payload.terminalId && typeof payload.terminalId === "string") client.join(`terminal:${payload.terminalId}`);
    if (payload.ticketId && typeof payload.ticketId === "string") client.join(`ticket:${payload.ticketId}`);
    if (payload.userId && payload.userId === client.data.auth.userId) client.join(`user:${payload.userId}`);
    return { success: true };
  }

  @SubscribeMessage("unsubscribe")
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { branchId?: string; branchIds?: string[]; terminalId?: string; ticketId?: string; userId?: string },
  ) {
    for (const branchId of this.resolveBranchIds(payload)) {
      client.leave(`branch:${branchId}`);
    }
    if (payload.terminalId) client.leave(`terminal:${payload.terminalId}`);
    if (payload.ticketId) client.leave(`ticket:${payload.ticketId}`);
    if (payload.userId) client.leave(`user:${payload.userId}`);
    return { success: true };
  }

  emitToBranch(branchId: string, event: string, payload: Record<string, unknown>) {
    this.server.to(`branch:${branchId}`).emit(event, payload);
  }

  emitToTicket(ticketId: string, event: string, payload: Record<string, unknown>) {
    this.server.to(`ticket:${ticketId}`).emit(event, payload);
  }

  emitToTerminal(terminalId: string, event: string, payload: Record<string, unknown>) {
    this.server.to(`terminal:${terminalId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: Record<string, unknown>) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
