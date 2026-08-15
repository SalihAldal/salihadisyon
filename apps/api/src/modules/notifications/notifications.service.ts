import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { RegisterPushTokenDto } from "./dto/register-push-token.dto";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query?: { branchId?: string; unreadOnly?: string; limit?: string }) {
    const branchId = query?.branchId;
    if (branchId && !actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Istenen sube icin yetki yok.");
    }

    const notifications = await this.prisma.notification.findMany({
      where: {
        OR: [{ userId: actor.userId }, { userId: null, branchId: { in: branchId ? [branchId] : actor.branchIds } }],
        ...(query?.unreadOnly === "true" ? { isRead: false } : {}),
      },
      include: { branch: true },
      orderBy: { createdAt: "desc" },
      take: Number(query?.limit ?? 50),
    });

    return {
      unreadCount: notifications.filter((item) => !item.isRead).length,
      items: notifications.map((item) => ({
        id: item.id,
        branchId: item.branchId,
        branchName: item.branch.name,
        userId: item.userId,
        type: item.type,
        title: item.title,
        message: item.message,
        data: item.data,
        isRead: item.isRead,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async markRead(id: string, actor: AuthenticatedUser) {
    const item = await this.prisma.notification.findFirst({
      where: {
        id,
        OR: [{ userId: actor.userId }, { userId: null, branchId: { in: actor.branchIds } }],
      },
    });
    if (!item) {
      throw new ForbiddenException("Bildirim bulunamadi.");
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllRead(actor: AuthenticatedUser, branchId?: string) {
    if (branchId && !actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Istenen sube icin yetki yok.");
    }

    const result = await this.prisma.notification.updateMany({
      where: {
        isRead: false,
        OR: [{ userId: actor.userId }, { userId: null, branchId: { in: branchId ? [branchId] : actor.branchIds } }],
      },
      data: { isRead: true },
    });

    return { success: true, updatedCount: result.count };
  }

  async registerPushToken(actor: AuthenticatedUser, dto: RegisterPushTokenDto) {
    const existing = dto.fingerprint
      ? await this.prisma.device.findFirst({
          where: { userId: actor.userId, fingerprint: dto.fingerprint },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const device = existing
      ? await this.prisma.device.update({
          where: { id: existing.id },
          data: {
            deviceType: dto.deviceType,
            platform: dto.platform,
            pushToken: dto.pushToken,
            fingerprint: dto.fingerprint ?? existing.fingerprint,
            lastSeenAt: new Date(),
          },
        })
      : await this.prisma.device.create({
          data: {
            userId: actor.userId,
            deviceType: dto.deviceType,
            platform: dto.platform,
            pushToken: dto.pushToken,
            fingerprint: dto.fingerprint ?? null,
            lastSeenAt: new Date(),
          },
        });

    return {
      success: true,
      deviceId: device.id,
      pushReady: true,
      provider: "expo",
    };
  }
}
