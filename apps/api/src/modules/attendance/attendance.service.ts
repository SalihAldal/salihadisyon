import { createHash, createHmac, randomBytes, randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { apiRuntimeConfig } from "@adisyon/config";
import { NotificationType } from "@prisma/client";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { ApproveAttendanceDto } from "./dto/approve-attendance.dto";
import { AttendanceOverviewDto } from "./dto/attendance-overview.dto";
import { CreateQrTokenDto } from "./dto/create-qr-token.dto";
import { ScanQrDto } from "./dto/scan-qr.dto";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getOverview(query: AttendanceOverviewDto, actor: AuthenticatedUser) {
    const branchId = query.branchId ?? actor.branchIds[0];
    if (!branchId) {
      throw new BadRequestException("Sube secimi gerekli.");
    }
    this.ensureBranchAccess(actor, branchId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [pendingShifts, pendingBreaks, pendingEvents, activeTokens, todaysEvents, employees, todayShiftStatuses] = await Promise.all([
      this.prisma.shift.findMany({
        where: { branchId, shiftType: "WORK", approvalStatus: "pending", scheduledStartAt: { gte: todayStart, lte: todayEnd } },
        include: { employeeProfile: { include: { user: true } } },
        orderBy: { scheduledStartAt: "desc" },
      }),
      this.prisma.breakRecord.findMany({
        where: { shift: { branchId }, approvalStatus: "pending", startedAt: { gte: todayStart, lte: todayEnd } },
        include: { employeeProfile: { include: { user: true } }, shift: true },
        orderBy: { startedAt: "desc" },
      }),
      this.prisma.attendanceEvent.findMany({
        where: { branchId, approvalStatus: "pending", occurredAt: { gte: todayStart, lte: todayEnd } },
        include: { employeeProfile: { include: { user: true } }, shift: true },
        orderBy: { occurredAt: "desc" },
      }),
      this.prisma.attendanceQrToken.findMany({
        where: { branchId, expiresAt: { gte: new Date() } },
        orderBy: { expiresAt: "desc" },
      }),
      this.prisma.attendanceEvent.findMany({
        where: { branchId, occurredAt: { gte: todayStart, lte: todayEnd } },
        include: { employeeProfile: { include: { user: true } } },
        orderBy: { occurredAt: "desc" },
        take: 20,
      }),
      this.prisma.employeeProfile.findMany({
        where: { branchId, isActive: true },
        include: { user: true },
        orderBy: { employeeCode: "asc" },
      }),
      this.prisma.shift.findMany({
        where: { branchId, shiftType: "WORK", scheduledStartAt: { gte: todayStart, lte: todayEnd } },
        include: { employeeProfile: { include: { user: true } } },
        orderBy: { scheduledStartAt: "asc" },
      }),
    ]);

    const lateEntries = todaysEvents
      .filter((event) => event.action === "SHIFT_IN" && event.lateMinutes > 0)
      .map((event) => ({
        id: event.id,
        employeeName: event.employeeProfile.user?.fullName ?? event.employeeProfile.employeeCode,
        lateMinutes: event.lateMinutes,
        occurredAt: event.occurredAt.toISOString(),
        tone: event.lateMinutes > 0 ? "danger" : "success",
      }));

    return {
      branchId,
      cards: [
        { key: "pendingShifts", label: "Onay Bekleyen Mesai", value: pendingShifts.length },
        { key: "pendingBreaks", label: "Onay Bekleyen Mola", value: pendingBreaks.length },
        { key: "pendingEvents", label: "Onay Bekleyen Olay", value: pendingEvents.length },
        { key: "activeTokens", label: "Aktif QR", value: activeTokens.length },
      ],
      activeTokens: activeTokens.map((token) => ({
        id: token.id,
        token: token.token,
        action: token.action,
        expiresAt: token.expiresAt.toISOString(),
      })),
      pendingApprovals: {
        shifts: pendingShifts.map((shift) => ({
          id: shift.id,
          employeeName: shift.employeeProfile.user?.fullName ?? shift.employeeProfile.employeeCode,
          lateMinutes: shift.lateMinutes,
          overtimeMinutes: shift.overtimeMinutes,
          approvalStatus: shift.approvalStatus,
        })),
        breaks: pendingBreaks.map((breakRecord) => ({
          id: breakRecord.id,
          employeeName: breakRecord.employeeProfile.user?.fullName ?? breakRecord.employeeProfile.employeeCode,
          totalMinutes: breakRecord.totalMinutes,
          approvalStatus: breakRecord.approvalStatus,
        })),
        events: pendingEvents.map((event) => ({
          id: event.id,
          employeeName: event.employeeProfile.user?.fullName ?? event.employeeProfile.employeeCode,
          action: event.action,
          lateMinutes: event.lateMinutes,
          overtimeMinutes: event.overtimeMinutes,
          approvalStatus: event.approvalStatus,
        })),
      },
      timeline: todaysEvents.map((event) => ({
        id: event.id,
        employeeName: event.employeeProfile.user?.fullName ?? event.employeeProfile.employeeCode,
        action: event.action,
        occurredAt: event.occurredAt.toISOString(),
        approvalStatus: event.approvalStatus,
        note: event.note,
        statusTone: event.action === "SHIFT_IN" && event.lateMinutes > 0 ? "danger" : "success",
      })),
      employees: employees.map((employee) => ({
        id: employee.id,
        employeeName: employee.user?.fullName ?? employee.employeeCode,
        employeeCode: employee.employeeCode,
        qrIssuedAt: employee.attendanceQrIssuedAt?.toISOString() ?? null,
        lateToleranceMinutes: employee.lateToleranceMinutes,
        qrReady: Boolean(employee.attendanceQrHash),
      })),
      shiftStatuses: todayShiftStatuses.map((shift) => ({
        id: shift.id,
        employeeName: shift.employeeProfile.user?.fullName ?? shift.employeeProfile.employeeCode,
        scheduledStartAt: shift.scheduledStartAt.toISOString(),
        actualStartAt: shift.actualStartAt?.toISOString() ?? null,
        lateMinutes: shift.lateMinutes,
        statusLabel: shift.actualStartAt ? (shift.lateMinutes > shift.employeeProfile.lateToleranceMinutes ? "Gec" : "Normal") : "Bekleniyor",
        statusTone: shift.actualStartAt ? (shift.lateMinutes > shift.employeeProfile.lateToleranceMinutes ? "danger" : "success") : "warning",
      })),
      lateEntries,
    };
  }

  async issueEmployeeQr(employeeProfileId: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "attendance.manage");
    const employee = await this.prisma.employeeProfile.findUnique({
      where: { id: employeeProfileId },
      include: { user: true, branch: true },
    });
    if (!employee) {
      throw new NotFoundException("Personel kaydi bulunamadi.");
    }
    this.ensureBranchAccess(actor, employee.branchId);
    if (!employee.isActive) {
      throw new BadRequestException("Pasif personel icin QR olusturulamaz.");
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = this.hashEmployeeQrToken(rawToken);
    await this.prisma.employeeProfile.update({
      where: { id: employeeProfileId },
      data: {
        attendanceQrHash: tokenHash,
        attendanceQrIssuedAt: new Date(),
      },
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: employee.branchId,
      userId: actor.userId,
      module: "attendance",
      action: "employee_qr.issue",
      entityType: "employee_profile",
      entityId: employeeProfileId,
      payload: {
        employeeCode: employee.employeeCode,
      },
    });

    return {
      employeeProfileId,
      employeeName: employee.user?.fullName ?? employee.employeeCode,
      employeeCode: employee.employeeCode,
      qrToken: rawToken,
      qrPayload: `attendance://employee?badge=${rawToken}`,
      issuedAt: new Date().toISOString(),
    };
  }

  async createQrToken(dto: CreateQrTokenDto, actor: AuthenticatedUser) {
    this.ensureBranchAccess(actor, dto.branchId);
    this.ensurePermission(actor, "attendance.manage");

    const nonce = randomUUID();
    const expiresAt = new Date(Date.now() + (dto.expiresInMinutes ?? 20) * 60 * 1000);
    const signature = this.signPayload(dto.branchId, dto.action, nonce, expiresAt.toISOString());
    const token = randomUUID().replace(/-/g, "");

    const created = await this.prisma.attendanceQrToken.create({
      data: {
        branchId: dto.branchId,
        token,
        action: dto.action,
        expiresAt,
        signedPayload: {
          nonce,
          signature,
          branchId: dto.branchId,
          action: dto.action,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: dto.branchId,
      userId: actor.userId,
      module: "attendance",
      action: "qr_token.create",
      entityType: "attendance_qr_token",
      entityId: created.id,
      payload: dto,
    });

    return {
      id: created.id,
      token: created.token,
      action: created.action,
      expiresAt: created.expiresAt.toISOString(),
      qrPayload: `attendance://scan?token=${created.token}`,
    };
  }

  async scan(dto: ScanQrDto) {
    const tokenRecord = await this.prisma.attendanceQrToken.findUnique({
      where: { token: dto.token },
    });

    if (!tokenRecord) {
      throw new NotFoundException("QR token bulunamadi.");
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException("QR token suresi dolmus.");
    }

    const payload = tokenRecord.signedPayload as {
      branchId: string;
      action: "SHIFT_IN" | "SHIFT_OUT" | "BREAK_START" | "BREAK_END";
      nonce: string;
      expiresAt: string;
      signature: string;
    };

    const expectedSignature = this.signPayload(payload.branchId, payload.action, payload.nonce, payload.expiresAt);
    if (payload.signature !== expectedSignature) {
      throw new ForbiddenException("QR payload imzasi gecersiz.");
    }

    const employeeProfile = await this.prisma.employeeProfile.findFirst({
      where: {
        branchId: payload.branchId,
        isActive: true,
        attendanceQrHash: this.hashEmployeeQrToken(dto.employeeQrToken),
      },
      include: { user: true },
    });

    if (!employeeProfile) {
      throw new NotFoundException("Personel QR kaydi bulunamadi.");
    }

    const shift = await this.findCurrentShift(employeeProfile.id, payload.branchId, payload.action);
    const now = new Date();

    if (payload.action === "SHIFT_IN") {
      if (!shift) {
        throw new BadRequestException("Aktif veya planli mesai bulunamadi.");
      }
      if (shift.actualStartAt && !shift.actualEndAt) {
        const lastEvent = await this.findLatestAttendanceEvent(employeeProfile.id, shift.id, "SHIFT_IN");
        await this.consumeQrToken(tokenRecord.id);
        return { success: true, duplicate: true, action: payload.action, shift, event: lastEvent };
      }

      const lateMinutes = Math.max(0, this.diffMinutes(now, shift.scheduledStartAt));
      const approvalStatus = lateMinutes > employeeProfile.lateToleranceMinutes ? "pending" : "approved";

      const updatedShift = await this.prisma.shift.update({
        where: { id: shift.id },
        data: {
          actualStartAt: now,
          lateMinutes,
          approvalStatus,
        },
      });

      const event = await this.prisma.attendanceEvent.create({
        data: {
          branchId: payload.branchId,
          employeeProfileId: employeeProfile.id,
          shiftId: shift.id,
          action: "SHIFT_IN",
          source: "qr",
          occurredAt: now,
          lateMinutes,
          approvalStatus,
          note: dto.note ?? null,
        },
      });

      if (approvalStatus === "pending") {
        await this.createAttendanceNotification(payload.branchId, employeeProfile.userId ?? null, "Gec kalma onayi bekliyor", `${employeeProfile.user?.fullName ?? employeeProfile.employeeCode} icin ${lateMinutes} dk gec kalma.`);
      }

      await this.consumeQrToken(tokenRecord.id);
      return { success: true, action: payload.action, shift: updatedShift, event };
    }

    if (payload.action === "SHIFT_OUT") {
      if (!shift) {
        const latestClosedShift = await this.findLatestClosedShift(employeeProfile.id, payload.branchId);
        if (latestClosedShift) {
          const lastEvent = await this.findLatestAttendanceEvent(employeeProfile.id, latestClosedShift.id, "SHIFT_OUT");
          await this.consumeQrToken(tokenRecord.id);
          return { success: true, duplicate: true, action: payload.action, shift: latestClosedShift, event: lastEvent };
        }
        throw new BadRequestException("Kapatilacak aktif mesai bulunamadi.");
      }

      const overtimeMinutes = Math.max(0, this.diffMinutes(now, shift.scheduledEndAt));
      const approvalStatus = overtimeMinutes > 15 ? "pending" : shift.approvalStatus;

      const updatedShift = await this.prisma.shift.update({
        where: { id: shift.id },
        data: {
          actualEndAt: now,
          overtimeMinutes,
          approvalStatus,
        },
      });

      const event = await this.prisma.attendanceEvent.create({
        data: {
          branchId: payload.branchId,
          employeeProfileId: employeeProfile.id,
          shiftId: shift.id,
          action: "SHIFT_OUT",
          source: "qr",
          occurredAt: now,
          overtimeMinutes,
          approvalStatus,
          note: dto.note ?? null,
        },
      });

      if (approvalStatus === "pending") {
        await this.createAttendanceNotification(payload.branchId, employeeProfile.userId ?? null, "Fazla mesai onayi bekliyor", `${employeeProfile.user?.fullName ?? employeeProfile.employeeCode} icin ${overtimeMinutes} dk fazla mesai.`);
      }

      await this.consumeQrToken(tokenRecord.id);
      return { success: true, action: payload.action, shift: updatedShift, event };
    }

    if (payload.action === "BREAK_START") {
      if (!shift || !shift.actualStartAt || shift.actualEndAt) {
        throw new BadRequestException("Aktif mesai olmadan mola baslatilamaz.");
      }

      const openBreak = await this.prisma.breakRecord.findFirst({
        where: {
          employeeProfileId: employeeProfile.id,
          shiftId: shift.id,
          endedAt: null,
        },
      });

      if (openBreak) {
        const lastEvent = await this.findLatestAttendanceEvent(employeeProfile.id, shift.id, "BREAK_START");
        await this.consumeQrToken(tokenRecord.id);
        return { success: true, duplicate: true, action: payload.action, breakRecord: openBreak, event: lastEvent };
      }

      const breakRecord = await this.prisma.breakRecord.create({
        data: {
          employeeProfileId: employeeProfile.id,
          shiftId: shift.id,
          startedAt: now,
          approvalStatus: "approved",
          notes: dto.note ?? null,
        },
      });

      const event = await this.prisma.attendanceEvent.create({
        data: {
          branchId: payload.branchId,
          employeeProfileId: employeeProfile.id,
          shiftId: shift.id,
          action: "BREAK_START",
          source: "qr",
          occurredAt: now,
          approvalStatus: "approved",
          note: dto.note ?? null,
        },
      });

      await this.consumeQrToken(tokenRecord.id);
      return { success: true, action: payload.action, breakRecord, event };
    }

    if (!shift) {
      throw new BadRequestException("Aktif mesai bulunamadi.");
    }

    const openBreak = await this.prisma.breakRecord.findFirst({
      where: {
        employeeProfileId: employeeProfile.id,
        shiftId: shift.id,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
    });

    if (!openBreak) {
      const lastEvent = await this.findLatestAttendanceEvent(employeeProfile.id, shift.id, "BREAK_END");
      if (lastEvent) {
        await this.consumeQrToken(tokenRecord.id);
        return { success: true, duplicate: true, action: payload.action, shift, event: lastEvent };
      }
      throw new BadRequestException("Bitirilecek acik mola kaydi yok.");
    }

    const totalMinutes = Math.max(1, this.diffMinutes(now, openBreak.startedAt));
    const approvalStatus = totalMinutes > 30 ? "pending" : "approved";

    const updatedBreak = await this.prisma.breakRecord.update({
      where: { id: openBreak.id },
      data: {
        endedAt: now,
        totalMinutes,
        approvalStatus,
        notes: dto.note ?? null,
      },
    });

    const updatedShift = await this.prisma.shift.update({
      where: { id: shift.id },
      data: {
        totalBreakMinutes: shift.totalBreakMinutes + totalMinutes,
        approvalStatus: approvalStatus === "pending" ? "pending" : shift.approvalStatus,
      },
    });

    const event = await this.prisma.attendanceEvent.create({
      data: {
        branchId: payload.branchId,
        employeeProfileId: employeeProfile.id,
        shiftId: shift.id,
        action: "BREAK_END",
        source: "qr",
        occurredAt: now,
        approvalStatus,
        note: dto.note ?? null,
      },
    });

    if (approvalStatus === "pending") {
      await this.createAttendanceNotification(payload.branchId, employeeProfile.userId ?? null, "Uzun mola onayi bekliyor", `${employeeProfile.user?.fullName ?? employeeProfile.employeeCode} icin ${totalMinutes} dk mola kaydi.`);
    }

    await this.consumeQrToken(tokenRecord.id);
    return { success: true, action: payload.action, breakRecord: updatedBreak, shift: updatedShift, event };
  }

  async approveShift(id: string, dto: ApproveAttendanceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "attendance.approve");
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException("Mesai bulunamadi.");
    this.ensureBranchAccess(actor, shift.branchId);

    const updated = await this.prisma.shift.update({
      where: { id },
      data: {
        approvalStatus: dto.approved ? "approved" : "rejected",
        approvedByUserId: actor.userId,
        notes: dto.note ?? shift.notes,
      },
    });

    return updated;
  }

  async approveBreak(id: string, dto: ApproveAttendanceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "attendance.approve");
    const breakRecord = await this.prisma.breakRecord.findUnique({
      where: { id },
      include: { shift: true },
    });
    if (!breakRecord) throw new NotFoundException("Mola kaydi bulunamadi.");
    if (!breakRecord.shift) throw new BadRequestException("Mola kaydina bagli mesai yok.");
    this.ensureBranchAccess(actor, breakRecord.shift.branchId);

    return this.prisma.breakRecord.update({
      where: { id },
      data: {
        approvalStatus: dto.approved ? "approved" : "rejected",
        notes: dto.note ?? breakRecord.notes,
      },
    });
  }

  async approveEvent(id: string, dto: ApproveAttendanceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "attendance.approve");
    const event = await this.prisma.attendanceEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException("Olay kaydi bulunamadi.");
    this.ensureBranchAccess(actor, event.branchId);

    return this.prisma.attendanceEvent.update({
      where: { id },
      data: {
        approvalStatus: dto.approved ? "approved" : "rejected",
        approvedByUserId: actor.userId,
        note: dto.note ?? event.note,
      },
    });
  }

  private signPayload(branchId: string, action: string, nonce: string, expiresAt: string) {
    return createHmac("sha256", apiRuntimeConfig.jwtAccessSecret).update(`${branchId}:${action}:${nonce}:${expiresAt}`).digest("hex");
  }

  private hashEmployeeQrToken(rawToken: string) {
    return createHash("sha256").update(`${rawToken}:${apiRuntimeConfig.jwtAccessSecret}`).digest("hex");
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }

  private async consumeQrToken(tokenId: string) {
    await this.prisma.attendanceQrToken.delete({ where: { id: tokenId } });
  }

  private ensurePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.permissions.includes(permission) && actor.role !== "super_admin") {
      throw new ForbiddenException("Bu islem icin yetkin yok.");
    }
  }

  private diffMinutes(dateLeft: Date, dateRight: Date) {
    return Math.round((dateLeft.getTime() - dateRight.getTime()) / (1000 * 60));
  }

  private async findCurrentShift(employeeProfileId: string, branchId: string, action: "SHIFT_IN" | "SHIFT_OUT" | "BREAK_START" | "BREAK_END") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    if (action === "SHIFT_OUT" || action === "BREAK_START" || action === "BREAK_END") {
      return this.prisma.shift.findFirst({
        where: {
          employeeProfileId,
          branchId,
          shiftType: "WORK",
          actualStartAt: { not: null },
          actualEndAt: null,
          scheduledStartAt: { gte: start, lte: end },
        },
        orderBy: { scheduledStartAt: "desc" },
      });
    }

    const openShift = await this.prisma.shift.findFirst({
      where: {
        employeeProfileId,
        branchId,
        shiftType: "WORK",
        actualStartAt: { not: null },
        actualEndAt: null,
        scheduledStartAt: { gte: start, lte: end },
      },
      orderBy: { scheduledStartAt: "desc" },
    });
    if (openShift) return openShift;

    return this.prisma.shift.findFirst({
      where: {
        employeeProfileId,
        branchId,
        shiftType: "WORK",
        actualStartAt: null,
        scheduledStartAt: { gte: start, lte: end },
      },
      orderBy: { scheduledStartAt: "asc" },
    });
  }

  private async findLatestClosedShift(employeeProfileId: string, branchId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return this.prisma.shift.findFirst({
      where: {
        employeeProfileId,
        branchId,
        shiftType: "WORK",
        actualEndAt: { not: null },
        scheduledStartAt: { gte: start, lte: end },
      },
      orderBy: { actualEndAt: "desc" },
    });
  }

  private async findLatestAttendanceEvent(
    employeeProfileId: string,
    shiftId: string | null | undefined,
    action: "SHIFT_IN" | "SHIFT_OUT" | "BREAK_START" | "BREAK_END",
  ) {
    if (!shiftId) return null;
    return this.prisma.attendanceEvent.findFirst({
      where: {
        employeeProfileId,
        shiftId,
        action,
      },
      orderBy: { occurredAt: "desc" },
    });
  }

  private async createAttendanceNotification(branchId: string, userId: string | null, title: string, message: string) {
    await this.prisma.notification.create({
      data: {
        branchId,
        userId,
        type: NotificationType.ATTENDANCE,
        title,
        message,
      },
    });
  }
}
