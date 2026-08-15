import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { GoalProgressService } from "./goal-progress.service";
import { CreateStaffResourceDto } from "./dto/create-staff-resource.dto";
import { ListStaffResourceDto } from "./dto/list-staff-resource.dto";
import { UpdateStaffResourceDto } from "./dto/update-staff-resource.dto";
import { staffRegistry, type StaffFieldConfig } from "./staff.registry";
import type { StaffResource } from "./staff.resources";

const roleResources = new Set<StaffResource>(["roles"]);
const companyScopedResources = new Set<StaffResource>(["roles", "staff-discounts"]);

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly goalProgressService: GoalProgressService,
  ) {}

  async getMeta(resource: StaffResource, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "staff.view");
    const config = staffRegistry[resource];
    const runtimeOptions = await this.getRuntimeOptions(config.relationOptionKeys ?? [], actor);

    return {
      resource,
      title: config.title,
      description: config.description,
      fields: config.fields.map((field) => ({
        ...field,
        options: this.resolveFieldOptions(field, runtimeOptions),
      })),
      columns: config.columns,
      filters: config.filters.map((filter) => ({
        ...filter,
        options: this.resolveFilterOptions(filter, runtimeOptions),
      })),
    };
  }

  async list(resource: StaffResource, query: ListStaffResourceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "staff.view");
    const config = staffRegistry[resource];
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = await this.buildWhere(config, actor, query);
    const delegate = this.getDelegate(config.delegate);
    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        include: config.include,
        orderBy: config.orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      delegate.count({ where }),
    ]);

    const hydratedItems =
      resource === "goals"
        ? await this.goalProgressService.syncGoalSet(items.map((item: { id: string }) => item.id))
        : items;

    return {
      items: await Promise.all(hydratedItems.map((item: unknown) => this.serializeItem(resource, item))),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async detail(resource: StaffResource, id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "staff.view");
    const config = staffRegistry[resource];
    const item = await this.getDelegate(config.delegate).findFirst({
      where: await this.buildWhere(config, actor, {}, id),
      include: config.include,
    });

    if (!item) {
      throw new NotFoundException("Kayit bulunamadi.");
    }

    if (resource === "goals") {
      const syncedGoal = await this.goalProgressService.syncGoalProgress(id);
      return this.serializeItem(resource, syncedGoal ?? item);
    }

    return this.serializeItem(resource, item);
  }

  async create(resource: StaffResource, dto: CreateStaffResourceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "staff.manage");

    if (resource === "team") {
      return this.createTeamMember(dto.data, actor);
    }

    if (resource === "roles") {
      return this.createRole(dto.data, actor);
    }

    if (resource === "tasks") {
      return this.createTask(dto.data, actor);
    }

    if (resource === "goals") {
      return this.createGoal(dto.data, actor);
    }

    const config = staffRegistry[resource];
    const data = await this.buildMutationData(resource, config, dto.data, actor, false);
    const created = await this.getDelegate(config.delegate).create({
      data,
      include: config.include,
    });

    await this.writeAudit(resource, "create", created.id, data, actor);
    return this.serializeItem(resource, created);
  }

  async update(resource: StaffResource, id: string, dto: UpdateStaffResourceDto, actor: AuthenticatedUser) {
    const canManage = actor.permissions.includes("staff.manage") || actor.role === "super_admin";

    if (!canManage && resource !== "tasks") {
      throw new ForbiddenException("Bu modul icin yetkin yok.");
    }

    if (resource === "team") {
      return this.updateTeamMember(id, dto.data, actor);
    }

    if (resource === "roles") {
      return this.updateRole(id, dto.data, actor);
    }

    if (resource === "tasks") {
      return this.updateTask(id, dto.data, actor);
    }

    if (resource === "goals") {
      return this.updateGoal(id, dto.data, actor);
    }

    const config = staffRegistry[resource];
    await this.detail(resource, id, actor);
    const data = await this.buildMutationData(resource, config, dto.data, actor, true);
    const updated = await this.getDelegate(config.delegate).update({
      where: { id },
      data,
      include: config.include,
    });

    await this.writeAudit(resource, "update", id, data, actor);
    return this.serializeItem(resource, updated);
  }

  async remove(resource: StaffResource, id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "staff.manage");

    if (resource === "team") {
      const current = await this.detail(resource, id, actor);
      await this.prisma.employeeProfile.delete({ where: { id } });
      await this.writeAudit(resource, "delete", id, current, actor);
      return { success: true };
    }

    if (resource === "roles") {
      await this.detail(resource, id, actor);
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await this.prisma.userRole.deleteMany({ where: { roleId: id } });
      await this.prisma.role.delete({ where: { id } });
      await this.writeAudit(resource, "delete", id, { id }, actor);
      return { success: true };
    }

    const config = staffRegistry[resource];
    await this.detail(resource, id, actor);
    await this.getDelegate(config.delegate).delete({ where: { id } });
    await this.writeAudit(resource, "delete", id, { id }, actor);
    return { success: true };
  }

  private async createTeamMember(input: Record<string, unknown>, actor: AuthenticatedUser) {
    const branchId = String(input.branchId ?? actor.branchIds[0] ?? "");
    this.ensureBranchAccess(actor, branchId);
    await this.validateTeamPayload(input, actor);
    this.ensureSafeGenericTeamStateChange(input);
    const passwordHash = input.password ? await hash(String(input.password), 10) : await hash("ChangeMe123!", 10);
    const { firstName, lastName, fullName } = this.resolveNameParts(input);
    const isActive = this.toBoolean(input.isActive, true);
    const staffRoleId = await this.resolveScopedRoleId(input.staffRoleId, actor);

    const employeeProfile = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          companyId: actor.tenantId,
          defaultBranchId: branchId,
          fullName,
          firstName,
          lastName,
          email: String(input.email ?? `${Date.now()}@local.staff`),
          phone: input.phone ? String(input.phone) : null,
          passwordHash,
          isActive,
        },
      });

      const createdEmployee = await tx.employeeProfile.create({
        data: {
          companyId: actor.tenantId,
          branchId,
          userId: user.id,
          employeeCode: String(input.employeeCode ?? `EMP-${Date.now()}`),
          pinCodeEnc: this.encodeSensitiveOptional(input.pinCode) ?? null,
          lateToleranceMinutes: input.lateToleranceMinutes !== undefined ? Number(input.lateToleranceMinutes) : 10,
          department: input.department ? String(input.department) : null,
          title: input.title ? String(input.title) : null,
          restaurantRole: input.restaurantRole ? String(input.restaurantRole) : null,
          staffRoleId: staffRoleId ?? null,
          hireDate: input.hireDate ? new Date(String(input.hireDate)) : null,
          birthDate: input.birthDate ? new Date(String(input.birthDate)) : null,
          salary: input.salary ? Number(input.salary) : null,
          isActive,
          isOwner: this.toBoolean(input.isOwner, false),
          overtimeEnabled: this.toBoolean(input.overtimeEnabled, false),
          dailyFreeDrinkLimit: this.toIntegerOrDefault(input.dailyFreeDrinkLimit, 0),
          totalBreakMinutes: this.toIntegerOrDefault(input.totalBreakMinutes, 0),
        },
        include: staffRegistry.team.include,
      });

      await this.syncUserRolesTx(tx, user.id, branchId, input.roleKeysJson, actor);
      await this.syncEmployeeProfileRelationsTx(tx, createdEmployee.id, input);
      return createdEmployee;
    });

    const detailed = await this.detail("team", employeeProfile.id, actor);
    await this.writeAudit("team", "create", employeeProfile.id, input, actor, branchId, null, detailed);
    return detailed;
  }

  private async updateTeamMember(id: string, input: Record<string, unknown>, actor: AuthenticatedUser) {
    await this.detail("team", id, actor);
    const existing = await this.prisma.employeeProfile.findUnique({
      where: { id },
      include: { user: true, personalProfile: true, contactProfile: true, financialProfile: true, emergencyContact: true },
    });

    if (!existing) {
      throw new NotFoundException("Personel bulunamadi.");
    }

    const branchId = String(input.branchId ?? existing.branchId);
    this.ensureBranchAccess(actor, branchId);
    await this.validateTeamPayload(input, actor, existing.userId ?? undefined);
    this.ensureSafeGenericTeamStateChange(input, existing);
    const nextIsActive = input.isActive !== undefined ? this.toBoolean(input.isActive, true) : existing.isActive;
    const nextIsOwner = input.isOwner !== undefined ? this.toBoolean(input.isOwner, false) : existing.isOwner;
    const staffRoleId = await this.resolveScopedRoleId(input.staffRoleId, actor, true);
    const { firstName, lastName, fullName } = this.resolveNameParts(
      {
        ...input,
        firstName: input.firstName ?? existing.user?.firstName,
        lastName: input.lastName ?? existing.user?.lastName,
        fullName: input.fullName ?? existing.user?.fullName,
      },
      existing.user?.fullName ?? undefined,
    );

    await this.prisma.$transaction(async (tx) => {
      if (existing.userId) {
        const updateData: Record<string, unknown> = {
          fullName,
          firstName,
          lastName,
          email: input.email ? String(input.email) : existing.user?.email,
          phone: input.phone ? String(input.phone) : existing.user?.phone,
          isActive: nextIsActive,
          defaultBranchId: branchId,
        };

        if (input.password) {
          updateData.passwordHash = await hash(String(input.password), 10);
        }

        await tx.user.update({
          where: { id: existing.userId },
          data: updateData,
        });

        if (input.roleKeysJson !== undefined) {
          await this.syncUserRolesTx(tx, existing.userId, branchId, input.roleKeysJson, actor);
        }
      }

      await tx.employeeProfile.update({
        where: { id },
        data: {
          companyId: actor.tenantId,
          branchId,
          employeeCode: input.employeeCode ? String(input.employeeCode) : undefined,
          pinCodeEnc: input.pinCode !== undefined ? (this.encodeSensitiveOptional(input.pinCode) ?? null) : undefined,
          lateToleranceMinutes: input.lateToleranceMinutes !== undefined ? Number(input.lateToleranceMinutes) : undefined,
          department: input.department !== undefined ? (input.department ? String(input.department) : null) : undefined,
          title: input.title !== undefined ? (input.title ? String(input.title) : null) : undefined,
          restaurantRole: input.restaurantRole !== undefined ? (input.restaurantRole ? String(input.restaurantRole) : null) : undefined,
          staffRoleId: input.staffRoleId !== undefined ? (staffRoleId ?? null) : undefined,
          hireDate: input.hireDate !== undefined ? (input.hireDate ? new Date(String(input.hireDate)) : null) : undefined,
          birthDate: input.birthDate !== undefined ? (input.birthDate ? new Date(String(input.birthDate)) : null) : undefined,
          salary: input.salary !== undefined ? (input.salary ? Number(input.salary) : null) : undefined,
          isActive: input.isActive !== undefined ? nextIsActive : undefined,
          isOwner: input.isOwner !== undefined ? nextIsOwner : undefined,
          overtimeEnabled: input.overtimeEnabled !== undefined ? this.toBoolean(input.overtimeEnabled, false) : undefined,
          dailyFreeDrinkLimit: input.dailyFreeDrinkLimit !== undefined ? this.toIntegerOrDefault(input.dailyFreeDrinkLimit, 0) : undefined,
          totalBreakMinutes: input.totalBreakMinutes !== undefined ? this.toIntegerOrDefault(input.totalBreakMinutes, 0) : undefined,
        },
      });

      await this.syncEmployeeProfileRelationsTx(tx, id, input);

      if (input.isActive !== undefined && existing.isActive !== nextIsActive) {
        await tx.employeeStatusLog.create({
          data: {
            employeeId: id,
            actionType: "status_changed",
            oldStatus: existing.isActive ? "active" : "passive",
            newStatus: nextIsActive ? "active" : "passive",
            note: input.statusNote ? String(input.statusNote) : null,
            createdByUserId: actor.userId,
          },
        });
      }

      if (input.isOwner !== undefined && existing.isOwner !== nextIsOwner) {
        await tx.employeeStatusLog.create({
          data: {
            employeeId: id,
            actionType: "owner_changed",
            oldStatus: existing.isOwner ? "owner" : "staff",
            newStatus: nextIsOwner ? "owner" : "staff",
            note: input.ownerNote ? String(input.ownerNote) : null,
            createdByUserId: actor.userId,
          },
        });
      }
    });

    const detailed = await this.detail("team", id, actor);
    await this.writeAudit("team", "update", id, input, actor, branchId, this.sanitizeAuditPayload(existing), this.sanitizeAuditPayload(detailed));
    return detailed;
  }

  private async createRole(input: Record<string, unknown>, actor: AuthenticatedUser) {
    const role = await this.prisma.role.create({
      data: {
        companyId: actor.tenantId,
        key: String(input.key ?? "").trim(),
        name: String(input.name ?? "").trim(),
        description: input.description ? String(input.description) : null,
        isSystem: this.toBoolean(input.isSystem, false),
      },
    });

    await this.syncRolePermissions(role.id, input.permissionKeysJson, actor);
    const detailed = await this.detail("roles", role.id, actor);
    await this.writeAudit("roles", "create", role.id, input, actor);
    return detailed;
  }

  private async updateRole(id: string, input: Record<string, unknown>, actor: AuthenticatedUser) {
    await this.detail("roles", id, actor);
    await this.prisma.role.update({
      where: { id },
      data: {
        key: input.key ? String(input.key) : undefined,
        name: input.name ? String(input.name) : undefined,
        description: input.description !== undefined ? (input.description ? String(input.description) : null) : undefined,
        isSystem: input.isSystem !== undefined ? this.toBoolean(input.isSystem, false) : undefined,
      },
    });

    if (input.permissionKeysJson !== undefined) {
      await this.syncRolePermissions(id, input.permissionKeysJson, actor);
    }

    const detailed = await this.detail("roles", id, actor);
    await this.writeAudit("roles", "update", id, input, actor);
    return detailed;
  }

  private async createTask(input: Record<string, unknown>, actor: AuthenticatedUser) {
    const config = staffRegistry.tasks;
    const data = await this.buildMutationData("tasks", config, input, actor, false);
    const branchId = String(data.branchId ?? actor.branchIds[0] ?? "");
    this.ensureBranchAccess(actor, branchId);

    const created = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: data as Prisma.TaskUncheckedCreateInput,
        include: config.include,
      });

      await this.createTaskNotification(tx, task, {
        title: "Yeni gorev atandi",
        message: `${task.title} gorevi size atandi.`,
        status: task.status,
      });

      return task;
    });

    await this.writeAudit("tasks", "create", created.id, data, actor, branchId);
    return this.serializeItem("tasks", created);
  }

  private async updateTask(id: string, input: Record<string, unknown>, actor: AuthenticatedUser) {
    const canManage = actor.permissions.includes("staff.manage") || actor.role === "super_admin";
    const existing = await this.prisma.task.findFirst({
      where: await this.buildWhere(staffRegistry.tasks, actor, {}, id),
      include: staffRegistry.tasks.include,
    });

    if (!existing) {
      throw new NotFoundException("Gorev bulunamadi.");
    }

    if (!canManage && existing.userId !== actor.userId) {
      throw new ForbiddenException("Bu gorevi guncelleme yetkin yok.");
    }

    const sanitizedInput =
      canManage
        ? input
        : {
            status: input.status,
          };
    const data = await this.buildMutationData("tasks", staffRegistry.tasks, sanitizedInput, actor, true);

    const updated = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id },
        data,
        include: staffRegistry.tasks.include,
      });

      const assigneeChanged = canManage && data.userId && String(data.userId) !== existing.userId;
      const statusChanged = data.status !== undefined && String(data.status) !== existing.status;

      if (assigneeChanged) {
        await this.createTaskNotification(tx, task, {
          title: "Gorev size aktarildi",
          message: `${task.title} gorevi size atandi.`,
          status: task.status,
        });
      } else if (statusChanged) {
        await this.createTaskStatusNotification(tx, task, existing.status);
      }

      return task;
    });

    await this.writeAudit("tasks", canManage ? "update" : "self-update", id, data, actor, updated.branchId);
    return this.serializeItem("tasks", updated);
  }

  private async createGoal(input: Record<string, unknown>, actor: AuthenticatedUser) {
    const config = staffRegistry.goals;
    const data = await this.buildMutationData("goals", config, input, actor, false);
    const created = await this.prisma.goal.create({
      data: data as Prisma.GoalUncheckedCreateInput,
      include: config.include,
    });
    const synced = await this.goalProgressService.syncGoalProgress(created.id);
    await this.writeAudit("goals", "create", created.id, data, actor, created.branchId);
    return this.serializeItem("goals", synced ?? created);
  }

  private async updateGoal(id: string, input: Record<string, unknown>, actor: AuthenticatedUser) {
    await this.detail("goals", id, actor);
    const data = await this.buildMutationData("goals", staffRegistry.goals, input, actor, true);
    const updated = await this.prisma.goal.update({
      where: { id },
      data,
      include: staffRegistry.goals.include,
    });
    const synced = await this.goalProgressService.syncGoalProgress(id);
    await this.writeAudit("goals", "update", id, data, actor, updated.branchId);
    return this.serializeItem("goals", synced ?? updated);
  }

  private async syncUserRoles(userId: string, branchId: string, rawRoleKeys: unknown, actor: AuthenticatedUser) {
    return this.syncUserRolesTx(this.prisma, userId, branchId, rawRoleKeys, actor);
  }

  private async syncUserRolesTx(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    branchId: string,
    rawRoleKeys: unknown,
    actor: AuthenticatedUser,
  ) {
    const roleKeys = this.parseJsonArray(rawRoleKeys);
    await tx.userRole.deleteMany({ where: { userId } });

    if (roleKeys.length === 0) {
      return;
    }

    const roles = await tx.role.findMany({
      where: {
        companyId: actor.tenantId,
        key: { in: roleKeys },
      },
    });

    for (const role of roles) {
      await tx.userRole.create({
        data: {
          userId,
          roleId: role.id,
          branchId,
        },
      });
    }
  }

  private async createTaskNotification(
    tx: Prisma.TransactionClient,
    task: {
      id: string;
      branchId: string;
      userId: string;
      title: string;
      priority: string;
      status: string;
    },
    payload: {
      title: string;
      message: string;
      status: string;
    },
  ) {
    await tx.notification.create({
      data: {
        branchId: task.branchId,
        userId: task.userId,
        type: "TASK",
        title: payload.title,
        message: payload.message,
        data: {
          taskId: task.id,
          priority: task.priority,
          status: payload.status,
        },
      },
    });
  }

  private async createTaskStatusNotification(
    tx: Prisma.TransactionClient,
    task: {
      id: string;
      branchId: string;
      userId: string;
      createdByUserId: string | null;
      title: string;
      priority: string;
      status: string;
    },
    previousStatus: string,
  ) {
    if (task.status === "done" && task.createdByUserId && task.createdByUserId !== task.userId) {
      await tx.notification.create({
        data: {
          branchId: task.branchId,
          userId: task.createdByUserId,
          type: "TASK",
          title: "Gorev tamamlandi",
          message: `${task.title} gorevi tamamlandi.`,
          data: {
            taskId: task.id,
            priority: task.priority,
            status: task.status,
            previousStatus,
          },
        },
      });
      return;
    }

    await this.createTaskNotification(tx, task, {
      title: "Gorev durumu guncellendi",
      message: `${task.title} gorevinin durumu guncellendi.`,
      status: task.status,
    });
  }

  private async syncRolePermissions(roleId: string, rawPermissionKeys: unknown, actor: AuthenticatedUser) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        companyId: actor.tenantId,
      },
    });
    if (!role) {
      throw new ForbiddenException("Bu rol icin yetkin yok.");
    }
    const permissionKeys = this.parseJsonArray(rawPermissionKeys);
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });

    if (permissionKeys.length === 0) {
      return;
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });

    for (const permission of permissions) {
      await this.prisma.rolePermission.create({
        data: {
          roleId,
          permissionId: permission.id,
        },
      });
    }
  }

  private parseJsonArray(value: unknown) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((item) => String(item));
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
      } catch {
        throw new BadRequestException("JSON array bekleniyor.");
      }
    }
    return [];
  }

  private async buildWhere(
    config: typeof staffRegistry[StaffResource],
    actor: AuthenticatedUser,
    query: Partial<ListStaffResourceDto>,
    id?: string,
  ) {
    const where: Record<string, any> = {};

    if (id) {
      where.id = id;
    }

    if (companyScopedResources.has(config.key)) {
      where.companyId = actor.tenantId;
    }

    if (config.branchScoped) {
      if (query.branchId) {
        this.ensureBranchAccess(actor, query.branchId);
        where.branchId = query.branchId;
      } else {
        where.branchId = { in: actor.branchIds };
      }
    }

    if (typeof query.isActive === "boolean") {
      where.isActive = query.isActive;
    }

    if (query.status) {
      if (config.key === "tasks" && query.status === "overdue") {
        where.status = { not: "done" };
        where.dueAt = { lt: new Date() };
      } else {
        where.status = query.status;
      }
    }

    if (query.userId && ["tasks", "notifications"].includes(config.key)) {
      where.userId = query.userId;
    }

    if (query.priority && config.key === "tasks") {
      where.priority = query.priority;
    }

    if (query.type && config.key === "notifications") {
      where.type = query.type;
    }

    if (typeof query.isRead === "boolean" && config.key === "notifications") {
      where.isRead = query.isRead;
    }

    if ((query.dateFrom || query.dateTo) && config.key === "tasks") {
      where.dueAt = {
        ...(where.dueAt ?? {}),
        ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
        ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
      };
    }

    if (config.key === "tasks" && !actor.permissions.includes("staff.manage") && actor.role !== "super_admin") {
      where.userId = actor.userId;
    }

    if (query.search && config.searchFields.length > 0) {
      where.OR = config.searchFields.map((field) => ({
        [field]: {
          contains: query.search,
          mode: "insensitive",
        },
      }));
    }

    return where;
  }

  private async buildMutationData(
    resource: StaffResource,
    config: typeof staffRegistry[StaffResource],
    input: Record<string, unknown>,
    actor: AuthenticatedUser,
    isUpdate: boolean,
  ) {
    const data: Record<string, unknown> = {};
    const fieldMap = new Map(config.fields.map((field) => [field.key, field]));

    for (const [key, rawValue] of Object.entries(input)) {
      if (!fieldMap.has(key)) continue;
      data[key] = this.normalizeFieldValue(key, rawValue, config);
    }

    for (const field of config.fields) {
      if (field.required && (data[field.key] === undefined || data[field.key] === null || data[field.key] === "")) {
        throw new BadRequestException(`${field.label} zorunlu.`);
      }
    }

    if (companyScopedResources.has(config.key)) {
      data.companyId = actor.tenantId;
    }

    if (config.branchScoped && !data.branchId) {
      data.branchId = actor.branchIds[0];
    }

    if (typeof data.branchId === "string") {
      this.ensureBranchAccess(actor, data.branchId);
    }

    if (resource === "audit-survey" && data.answersJson && typeof data.answersJson === "string") {
      data.answersJson = JSON.parse(String(data.answersJson));
    }

    if (resource === "tasks") {
      if (!isUpdate) {
        data.createdByUserId = actor.userId;
      }

      if (typeof data.userId === "string") {
        const assignee = await this.prisma.user.findFirst({
          where: {
            id: data.userId,
            companyId: actor.tenantId,
          },
        });

        if (!assignee) {
          throw new BadRequestException("Secilen kullanici bulunamadi.");
        }
      }

      if (data.title !== undefined) {
        data.title = String(data.title).trim();
      }

      if (data.description !== undefined) {
        data.description = data.description ? String(data.description).trim() : null;
      }

      const nextStatus = data.status ? String(data.status) : undefined;
      if (nextStatus && !["todo", "in_progress", "done"].includes(nextStatus)) {
        throw new BadRequestException("Gorev durumu gecersiz.");
      }

      const priority = data.priority ? String(data.priority) : undefined;
      if (priority && !["low", "medium", "high", "critical"].includes(priority)) {
        throw new BadRequestException("Gorev onceligi gecersiz.");
      }

      if (!isUpdate && !data.priority) {
        data.priority = "medium";
      }

      if (nextStatus === "in_progress" && !data.startedAt) {
        data.startedAt = new Date();
      }

      if (nextStatus === "done") {
        data.completedAt = new Date();
      } else if (nextStatus && nextStatus !== "done") {
        data.completedAt = null;
      }
    }

    if (resource === "goals") {
      await this.prepareGoalData(data, actor, isUpdate);
    }

    return data;
  }

  private normalizeFieldValue(key: string, value: unknown, config: typeof staffRegistry[StaffResource]) {
    if (value === "") {
      return null;
    }
    if (config.numberFields?.includes(key)) {
      return value === null || value === undefined ? null : Number(value);
    }
    if (config.booleanFields?.includes(key)) {
      return this.toBoolean(value, false);
    }
    if (config.jsonFields?.includes(key)) {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          throw new BadRequestException(`${key} gecerli JSON olmali.`);
        }
      }
    }
    if (config.dateFields?.includes(key)) {
      return value ? new Date(String(value)) : null;
    }
    return value;
  }

  private toBoolean(value: unknown, defaultValue: boolean) {
    if (value === undefined || value === null) return defaultValue;
    return value === true || value === "true" || value === 1 || value === "1";
  }

  private ensurePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.permissions.includes(permission) && actor.role !== "super_admin") {
      throw new ForbiddenException("Bu modul icin yetkin yok.");
    }
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }

  private getDelegate(delegateName: string) {
    return (this.prisma as Record<string, any>)[delegateName];
  }

  private async getRuntimeOptions(
    keys: Array<"branches" | "users" | "employees" | "permissions" | "roles" | "staffRoles" | "products" | "categories">,
    actor: AuthenticatedUser,
  ) {
    const [branches, users, employees, permissions, roles, staffRoles, products, categories] = await Promise.all([
      keys.includes("branches")
        ? this.prisma.branch.findMany({ where: { id: { in: actor.branchIds } }, orderBy: { name: "asc" } })
        : Promise.resolve([]),
      keys.includes("users")
        ? this.prisma.user.findMany({ where: { companyId: actor.tenantId }, orderBy: { fullName: "asc" }, take: 100 })
        : Promise.resolve([]),
      keys.includes("employees")
        ? this.prisma.employeeProfile.findMany({
            where: { branchId: { in: actor.branchIds } },
            include: { user: true, branch: true },
            orderBy: { employeeCode: "asc" },
            take: 200,
          })
        : Promise.resolve([]),
      keys.includes("permissions")
        ? this.prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] })
        : Promise.resolve([]),
      keys.includes("roles")
        ? this.prisma.role.findMany({ where: { companyId: actor.tenantId }, orderBy: { name: "asc" } })
        : Promise.resolve([]),
      keys.includes("staffRoles")
        ? this.prisma.role.findMany({ where: { companyId: actor.tenantId }, orderBy: { name: "asc" } })
        : Promise.resolve([]),
      keys.includes("products")
        ? this.prisma.menuProduct.findMany({
            where: { companyId: actor.tenantId, OR: [{ branchId: null }, { branchId: { in: actor.branchIds } }] },
            orderBy: { name: "asc" },
            take: 300,
          })
        : Promise.resolve([]),
      keys.includes("categories")
        ? this.prisma.menuCategory.findMany({
            where: { companyId: actor.tenantId, OR: [{ branchId: null }, { branchId: { in: actor.branchIds } }] },
            orderBy: { name: "asc" },
            take: 200,
          })
        : Promise.resolve([]),
    ]);

    return {
      branches: branches.map((branch) => ({ label: branch.name, value: branch.id })),
      users: users.map((user) => ({ label: `${user.fullName} (${user.email})`, value: user.id })),
      employees: employees.map((employee) => ({
        label: `${employee.user?.fullName ?? employee.employeeCode} / ${employee.branch.name}`,
        value: employee.id,
      })),
      permissions: permissions.map((permission) => ({ label: permission.key, value: permission.key })),
      roles: roles.map((role) => ({ label: `${role.name} (${role.key})`, value: role.key })),
      staffRoles: staffRoles.map((role) => ({ label: `${role.name} (${role.key})`, value: role.id })),
      products: products.map((product) => ({ label: product.name, value: product.id })),
      categories: categories.map((category) => ({ label: category.name, value: category.id })),
    };
  }

  private resolveFieldOptions(field: StaffFieldConfig, runtimeOptions: Awaited<ReturnType<StaffService["getRuntimeOptions"]>>) {
    if (field.options?.length) return field.options;
    if (field.key === "branchId") return runtimeOptions.branches;
    if (field.key === "userId" || field.key === "assignedToUserId") return runtimeOptions.users;
    if (field.key === "employeeProfileId") return runtimeOptions.employees;
    if (field.key === "permissionKeysJson") return runtimeOptions.permissions;
    if (field.key === "roleKeysJson") return runtimeOptions.roles;
    if (field.key === "staffRoleId") return runtimeOptions.staffRoles;
    if (field.key === "productId") return runtimeOptions.products;
    if (field.key === "categoryId") return runtimeOptions.categories;
    return undefined;
  }

  private resolveFilterOptions(
    filter: (typeof staffRegistry)[StaffResource]["filters"][number],
    runtimeOptions: Awaited<ReturnType<StaffService["getRuntimeOptions"]>>,
  ) {
    if (filter.options?.length) return filter.options;
    if (filter.key === "branchId") return runtimeOptions.branches;
    if (filter.key === "userId") return runtimeOptions.users;
    return undefined;
  }

  private async serializeItem(resource: StaffResource, item: any) {
    const normalized = JSON.parse(JSON.stringify(item));

    if (resource === "roles") {
      normalized.permissionKeysJson = JSON.stringify(
        (normalized.permissions ?? []).map((item: { permission: { key: string } }) => item.permission.key),
        null,
        2,
      );
    }

    if (resource === "team") {
      if (normalized.user) {
        delete normalized.user.passwordHash;
        delete normalized.user.twoFactorSecret;
      }
      normalized.businessId = normalized.companyId ?? normalized.company?.id ?? null;
      normalized.fullName = normalized.user?.fullName ?? "";
      normalized.firstName = normalized.user?.firstName ?? this.extractFirstName(normalized.user?.fullName);
      normalized.lastName = normalized.user?.lastName ?? this.extractLastName(normalized.user?.fullName);
      normalized.email = normalized.user?.email ?? "";
      normalized.phone = normalized.user?.phone ?? "";
      normalized.pinCode = "";
      normalized.pinCodeMasked = this.maskSensitive(this.decodeSensitive(normalized.pinCodeEnc));
      normalized.attendanceQrEnabled = Boolean(normalized.attendanceQrHash);
      normalized.staffRoleName = normalized.staffRole?.name ?? "";
      normalized.roleKeysJson = JSON.stringify(
        (normalized.user?.roles ?? []).map((roleLink: { role: { key: string } }) => roleLink.role.key),
        null,
        2,
      );
      normalized.photo = normalized.personalProfile?.photo ?? "";
      normalized.nationality = normalized.personalProfile?.nationality ?? "";
      normalized.identityNumber = "";
      normalized.identityNumberMasked = this.maskSensitive(this.decodeSensitive(normalized.personalProfile?.identityNumberEnc));
      normalized.gender = normalized.personalProfile?.gender ?? "";
      normalized.bloodType = normalized.personalProfile?.bloodType ?? "";
      normalized.disabilityStatus = normalized.personalProfile?.disabilityStatus ?? "";
      normalized.educationStatus = normalized.personalProfile?.educationStatus ?? "";
      normalized.highestEducationLevel = normalized.personalProfile?.highestEducationLevel ?? "";
      normalized.lastEducationSchool = normalized.personalProfile?.lastEducationSchool ?? "";
      normalized.maritalStatus = normalized.personalProfile?.maritalStatus ?? "";
      normalized.childrenCount = normalized.personalProfile?.childrenCount ?? null;
      normalized.birthDate = normalized.personalProfile?.birthDate ?? normalized.birthDate ?? null;
      normalized.address = normalized.contactProfile?.address ?? "";
      normalized.country = normalized.contactProfile?.country ?? "";
      normalized.city = normalized.contactProfile?.city ?? "";
      normalized.district = normalized.contactProfile?.district ?? "";
      normalized.postalCode = normalized.contactProfile?.postalCode ?? "";
      normalized.homePhone = normalized.contactProfile?.homePhone ?? "";
      normalized.salary = normalized.financialProfile?.salary ?? normalized.salary ?? null;
      normalized.salaryPaymentDay = normalized.financialProfile?.salaryPaymentDay ?? null;
      normalized.bankName = normalized.financialProfile?.bankName ?? "";
      normalized.accountType = normalized.financialProfile?.accountType ?? "";
      normalized.accountNumber = "";
      normalized.accountNumberMasked = this.maskSensitive(this.decodeSensitive(normalized.financialProfile?.accountNumberEnc));
      normalized.iban = "";
      normalized.ibanMasked = this.maskSensitive(this.decodeSensitive(normalized.financialProfile?.ibanEnc));
      normalized.contactName = normalized.emergencyContact?.contactName ?? "";
      normalized.contactPhone = normalized.emergencyContact?.contactPhone ?? "";
      normalized.relation = normalized.emergencyContact?.relation ?? "";
    }

    if (resource === "tasks") {
      const statusMeta = this.getTaskStatusMeta(normalized.status, normalized.dueAt);
      normalized.priorityLabel = this.formatTaskPriority(normalized.priority);
      normalized.statusLabel = statusMeta.label;
      normalized.statusTone = statusMeta.tone;
      normalized.isOverdue = statusMeta.isOverdue;
      normalized.createdByName = normalized.createdByUser?.fullName ?? "Sistem";
    }

    if (resource === "goals") {
      const progressRate = Number(normalized.progressRate ?? 0);
      normalized.goalTypeLabel = this.formatGoalType(normalized.goalType);
      normalized.goalScopeLabel = this.formatGoalScope(normalized.goalScope);
      normalized.ownerLabel =
        normalized.goalScope === "employee"
          ? normalized.employeeProfile?.user?.fullName ?? normalized.employeeProfile?.employeeCode ?? "Personel secilmedi"
          : "Genel isletme";
      normalized.statusLabel = this.formatGoalStatus(normalized.status);
      normalized.progressRateLabel = `%${progressRate.toFixed(1)}`;
      normalized.bonusSummaryLabel = this.formatGoalBonusSummary(normalized);
    }

    if (resource === "notifications") {
      normalized.recipientName = normalized.user?.fullName ?? "Tum personel";
      normalized.typeLabel = this.formatNotificationType(normalized.type);
      normalized.readStatusLabel = normalized.isRead ? "Okundu" : "Yeni";
    }

    if (normalized.answersJson) normalized.answersJson = JSON.stringify(normalized.answersJson, null, 2);
    if (normalized.data) normalized.data = JSON.stringify(normalized.data, null, 2);
    return normalized;
  }

  private formatTaskPriority(value?: string | null) {
    switch (value) {
      case "critical":
        return "Kritik";
      case "high":
        return "Yuksek";
      case "low":
        return "Dusuk";
      default:
        return "Orta";
    }
  }

  private getTaskStatusMeta(status?: string | null, dueAt?: string | Date | null) {
    const dueDate = dueAt ? new Date(dueAt) : null;
    const isOverdue = Boolean(dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now() && status !== "done");

    if (status === "done") {
      return { label: "Tamamlandi", tone: "success", isOverdue: false };
    }
    if (isOverdue) {
      return { label: "Gecikti", tone: "danger", isOverdue: true };
    }
    if (status === "in_progress") {
      return { label: "Yapiliyor", tone: "warning", isOverdue: false };
    }
    return { label: "Bekliyor", tone: "info", isOverdue: false };
  }

  private formatNotificationType(value?: string | null) {
    switch (value) {
      case "TASK":
        return "Gorev";
      case "ATTENDANCE":
        return "Mesai";
      case "APPROVAL":
        return "Onay";
      case "STOCK_ALERT":
        return "Stok";
      case "CASH_CLOSURE":
        return "Kasa";
      default:
        return "Sistem";
    }
  }

  private formatGoalType(value?: string | null) {
    switch (value) {
      case "product_quantity":
        return "Urun Adedi";
      case "category_quantity":
        return "Kategori Adedi";
      case "payment_method_total":
        return "Odeme Tipi";
      default:
        return "Ciro";
    }
  }

  private formatGoalScope(value?: string | null) {
    return value === "employee" ? "Personel" : "Genel";
  }

  private formatGoalStatus(value?: string | null) {
    switch (value) {
      case "completed":
        return "Tamamlandi";
      case "expired":
        return "Suresi Doldu";
      default:
        return "Aktif";
    }
  }

  private formatGoalBonusSummary(goal: Record<string, any>) {
    if (!goal.bonusType || goal.bonusValue === null || goal.bonusValue === undefined) {
      return "Prim tanimsiz";
    }

    const amount = Number(goal.bonusValue);
    const formatted =
      goal.bonusType === "percentage"
        ? `%${amount.toFixed(2)}`
        : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(amount);
    const suffix = goal.bonusApprovalRequired ? " / Onayli" : " / Otomatik";
    return `${formatted}${suffix}`;
  }

  private async validateTeamPayload(input: Record<string, unknown>, actor: AuthenticatedUser, currentUserId?: string) {
    const normalizedEmail = input.email !== undefined ? String(input.email ?? "").trim().toLowerCase() : undefined;
    const normalizedPhone = input.phone !== undefined ? String(input.phone ?? "").trim() : undefined;
    const normalizedHomePhone = input.homePhone !== undefined ? String(input.homePhone ?? "").trim() : undefined;
    const normalizedContactPhone = input.contactPhone !== undefined ? String(input.contactPhone ?? "").trim() : undefined;
    const normalizedPinCode = input.pinCode !== undefined ? String(input.pinCode ?? "").trim() : undefined;
    const normalizedBirthDate = input.birthDate !== undefined ? String(input.birthDate ?? "").trim() : undefined;
    const normalizedHireDate = input.hireDate !== undefined ? String(input.hireDate ?? "").trim() : undefined;
    const normalizedBankName = input.bankName !== undefined ? String(input.bankName ?? "").trim() : undefined;
    const normalizedAccountType = input.accountType !== undefined ? String(input.accountType ?? "").trim() : undefined;
    const normalizedAccountNumber = input.accountNumber !== undefined ? String(input.accountNumber ?? "").replace(/\s+/g, "").trim() : undefined;
    const normalizedIban = input.iban !== undefined ? String(input.iban ?? "").replace(/\s+/g, "").toUpperCase().trim() : undefined;

    if (normalizedEmail !== undefined) {
      if (!normalizedEmail) {
        throw new BadRequestException("E-posta zorunlu.");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new BadRequestException("Gecerli bir e-posta adresi girilmeli.");
      }
      const existingUser = await this.prisma.user.findFirst({
        where: {
          companyId: actor.tenantId,
          email: { equals: normalizedEmail, mode: "insensitive" },
          ...(currentUserId ? { id: { not: currentUserId } } : {}),
        },
        select: { id: true },
      });
      if (existingUser) {
        throw new BadRequestException("Bu e-posta adresi baska bir personel tarafindan kullaniliyor.");
      }
    }

    if (normalizedPhone && !this.isValidPhoneFormat(normalizedPhone)) {
      throw new BadRequestException("Telefon formati gecersiz.");
    }
    if (normalizedHomePhone && !this.isValidPhoneFormat(normalizedHomePhone)) {
      throw new BadRequestException("Ev telefonu formati gecersiz.");
    }
    if (normalizedContactPhone && !this.isValidPhoneFormat(normalizedContactPhone)) {
      throw new BadRequestException("Acil durum telefonu formati gecersiz.");
    }
    if (normalizedPinCode !== undefined && normalizedPinCode && !/^\d{4}$/.test(normalizedPinCode)) {
      throw new BadRequestException("Satis ekrani pin kodu 4 haneli ve sadece sayi olmali.");
    }
    if (normalizedHireDate && Number.isNaN(new Date(normalizedHireDate).getTime())) {
      throw new BadRequestException("Ise giris tarihi gecersiz.");
    }
    if (normalizedBirthDate) {
      const birthDate = new Date(normalizedBirthDate);
      if (Number.isNaN(birthDate.getTime())) {
        throw new BadRequestException("Dogum tarihi gecersiz.");
      }
      if (birthDate > new Date()) {
        throw new BadRequestException("Dogum tarihi ileri tarih olamaz.");
      }
    }
    if (input.salary !== undefined && (!Number.isFinite(Number(input.salary)) || Number(input.salary) < 0)) {
      throw new BadRequestException("Maas 0 veya daha buyuk olmali.");
    }
    if (input.lateToleranceMinutes !== undefined && (!Number.isFinite(Number(input.lateToleranceMinutes)) || Number(input.lateToleranceMinutes) < 0)) {
      throw new BadRequestException("Gec kalma toleransi 0 veya daha buyuk olmali.");
    }
    if (input.dailyFreeDrinkLimit !== undefined && (!Number.isFinite(Number(input.dailyFreeDrinkLimit)) || Number(input.dailyFreeDrinkLimit) < 0)) {
      throw new BadRequestException("Gunluk ucretsiz icecek limiti 0 veya daha buyuk olmali.");
    }
    if (input.totalBreakMinutes !== undefined && (!Number.isFinite(Number(input.totalBreakMinutes)) || Number(input.totalBreakMinutes) < 0)) {
      throw new BadRequestException("Toplam mola suresi 0 veya daha buyuk olmali.");
    }
    if (input.childrenCount !== undefined && (!Number.isFinite(Number(input.childrenCount)) || Number(input.childrenCount) < 0)) {
      throw new BadRequestException("Cocuk sayisi 0 veya daha buyuk olmali.");
    }
    if (input.salaryPaymentDay !== undefined) {
      const value = Number(input.salaryPaymentDay);
      if (!Number.isFinite(value) || value < 1 || value > 31) {
        throw new BadRequestException("Maas odeme gunu 1-31 araliginda olmali.");
      }
    }
    const hasBankPayload = [normalizedBankName, normalizedAccountType, normalizedAccountNumber, normalizedIban].some(Boolean);
    if (hasBankPayload) {
      if (!normalizedBankName || !normalizedAccountType) {
        throw new BadRequestException("Banka bilgisi giriliyorsa banka adi ve hesap turu birlikte girilmeli.");
      }
      if (!normalizedAccountNumber && !normalizedIban) {
        throw new BadRequestException("Banka bilgisi giriliyorsa hesap numarasi veya IBAN zorunlu.");
      }
    }
    if (normalizedIban && !this.isValidIban(normalizedIban)) {
      throw new BadRequestException("IBAN formati gecersiz.");
    }
    if (input.photo !== undefined && !this.isValidProfilePhoto(String(input.photo ?? ""))) {
      throw new BadRequestException("Profil fotografi formati gecersiz.");
    }
  }

  private ensureSafeGenericTeamStateChange(input: Record<string, unknown>, existing?: { isActive?: boolean | null; isOwner?: boolean | null }) {
    if (input.isOwner !== undefined) {
      const nextIsOwner = this.toBoolean(input.isOwner, false);
      const currentIsOwner = Boolean(existing?.isOwner);
      if (nextIsOwner !== currentIsOwner) {
        throw new BadRequestException("Isletme sahibi atama/kaldirma islemi ozel owner endpointi uzerinden yapilmali.");
      }
    }
    if (existing && input.isActive !== undefined) {
      const nextIsActive = this.toBoolean(input.isActive, true);
      if (existing.isActive && !nextIsActive) {
        throw new BadRequestException("Personel pasiflestirme islemi ozel passive endpointi uzerinden yapilmali.");
      }
    }
  }

  private isValidPhoneFormat(value: string) {
    return /^\+?[0-9\s()-]{10,20}$/.test(value);
  }

  private isValidIban(value: string) {
    const normalized = value.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(normalized)) {
      return false;
    }
    const rearranged = `${normalized.slice(4)}${normalized.slice(0, 4)}`;
    const converted = rearranged
      .split("")
      .map((char) => {
        const code = char.charCodeAt(0);
        return code >= 65 && code <= 90 ? String(code - 55) : char;
      })
      .join("");
    let remainder = 0;
    for (const digit of converted) {
      remainder = Number(`${remainder}${digit}`) % 97;
    }
    return remainder === 1;
  }

  private isValidProfilePhoto(value: string) {
    const normalized = value.trim();
    if (!normalized) return true;
    return /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(normalized) || /^(https?:\/\/|\/)[^\s]+$/i.test(normalized);
  }

  private async resolveScopedRoleId(rawRoleId: unknown, actor: AuthenticatedUser, allowEmpty = false) {
    if (rawRoleId === undefined) return undefined;
    if (rawRoleId === null || rawRoleId === "") {
      return allowEmpty ? null : null;
    }
    const role = await this.prisma.role.findFirst({
      where: {
        id: String(rawRoleId),
        companyId: actor.tenantId,
      },
    });
    if (!role) {
      throw new BadRequestException("Personel rol kaydi bulunamadi.");
    }
    return role.id;
  }

  private resolveNameParts(input: Record<string, unknown>, fallbackFullName?: string) {
    const rawFullName = String(input.fullName ?? fallbackFullName ?? "").trim();
    const rawFirstName = String(input.firstName ?? "").trim();
    const rawLastName = String(input.lastName ?? "").trim();
    const firstName = rawFirstName || this.extractFirstName(rawFullName);
    const lastName = rawLastName || this.extractLastName(rawFullName);
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || rawFullName;
    if (!fullName) {
      throw new BadRequestException("Personel adi zorunlu.");
    }
    return {
      firstName: firstName || fullName,
      lastName: lastName || null,
      fullName,
    };
  }

  private extractFirstName(fullName?: string | null) {
    const normalized = String(fullName ?? "").trim();
    if (!normalized) return "";
    return normalized.split(/\s+/)[0] ?? "";
  }

  private extractLastName(fullName?: string | null) {
    const normalized = String(fullName ?? "").trim();
    if (!normalized) return "";
    const parts = normalized.split(/\s+/);
    return parts.slice(1).join(" ");
  }

  private toIntegerOrDefault(value: unknown, defaultValue: number) {
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : defaultValue;
  }

  private encodeSensitiveOptional(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    return this.encodeSensitive(String(value));
  }

  private encodeSensitive(value: string) {
    return Buffer.from(value, "utf8").toString("base64");
  }

  private decodeSensitive(value?: string | null) {
    if (!value) return "";
    try {
      return Buffer.from(value, "base64").toString("utf8");
    } catch {
      return "";
    }
  }

  private maskSensitive(value?: string | null) {
    const normalized = String(value ?? "");
    if (!normalized) return "";
    if (normalized.length <= 2) return "*".repeat(normalized.length);
    return `${"*".repeat(Math.max(0, normalized.length - 2))}${normalized.slice(-2)}`;
  }

  private last4(value: unknown) {
    const normalized = String(value ?? "").replace(/\s+/g, "");
    if (!normalized) return null;
    return normalized.slice(-4);
  }

  private hasProfilePayload(input: Record<string, unknown>, keys: string[]) {
    return keys.some((key) => Object.prototype.hasOwnProperty.call(input, key));
  }

  private async syncEmployeeProfileRelationsTx(
    tx: Prisma.TransactionClient,
    employeeId: string,
    input: Record<string, unknown>,
  ) {
    if (
      this.hasProfilePayload(input, [
        "photo",
        "nationality",
        "identityNumber",
        "gender",
        "bloodType",
        "disabilityStatus",
        "educationStatus",
        "highestEducationLevel",
        "lastEducationSchool",
        "maritalStatus",
        "childrenCount",
        "birthDate",
      ])
    ) {
      await tx.employeePersonalProfile.upsert({
        where: { employeeId },
        create: {
          employeeId,
          photo: input.photo ? String(input.photo) : null,
          nationality: input.nationality ? String(input.nationality) : null,
          identityNumberEnc: this.encodeSensitiveOptional(input.identityNumber) ?? null,
          identityNumberLast4: this.last4(input.identityNumber),
          gender: input.gender ? String(input.gender) : null,
          bloodType: input.bloodType ? String(input.bloodType) : null,
          disabilityStatus: input.disabilityStatus ? String(input.disabilityStatus) : null,
          educationStatus: input.educationStatus ? String(input.educationStatus) : null,
          highestEducationLevel: input.highestEducationLevel ? String(input.highestEducationLevel) : null,
          lastEducationSchool: input.lastEducationSchool ? String(input.lastEducationSchool) : null,
          maritalStatus: input.maritalStatus ? String(input.maritalStatus) : null,
          childrenCount: input.childrenCount !== undefined ? this.toIntegerOrDefault(input.childrenCount, 0) : null,
          birthDate: input.birthDate ? new Date(String(input.birthDate)) : null,
        },
        update: {
          photo: input.photo !== undefined ? (input.photo ? String(input.photo) : null) : undefined,
          nationality: input.nationality !== undefined ? (input.nationality ? String(input.nationality) : null) : undefined,
          identityNumberEnc: input.identityNumber !== undefined ? (this.encodeSensitiveOptional(input.identityNumber) ?? null) : undefined,
          identityNumberLast4: input.identityNumber !== undefined ? this.last4(input.identityNumber) : undefined,
          gender: input.gender !== undefined ? (input.gender ? String(input.gender) : null) : undefined,
          bloodType: input.bloodType !== undefined ? (input.bloodType ? String(input.bloodType) : null) : undefined,
          disabilityStatus: input.disabilityStatus !== undefined ? (input.disabilityStatus ? String(input.disabilityStatus) : null) : undefined,
          educationStatus: input.educationStatus !== undefined ? (input.educationStatus ? String(input.educationStatus) : null) : undefined,
          highestEducationLevel: input.highestEducationLevel !== undefined ? (input.highestEducationLevel ? String(input.highestEducationLevel) : null) : undefined,
          lastEducationSchool: input.lastEducationSchool !== undefined ? (input.lastEducationSchool ? String(input.lastEducationSchool) : null) : undefined,
          maritalStatus: input.maritalStatus !== undefined ? (input.maritalStatus ? String(input.maritalStatus) : null) : undefined,
          childrenCount: input.childrenCount !== undefined ? this.toIntegerOrDefault(input.childrenCount, 0) : undefined,
          birthDate: input.birthDate !== undefined ? (input.birthDate ? new Date(String(input.birthDate)) : null) : undefined,
        },
      });
    }

    if (this.hasProfilePayload(input, ["address", "country", "city", "district", "postalCode", "homePhone"])) {
      await tx.employeeContactProfile.upsert({
        where: { employeeId },
        create: {
          employeeId,
          address: input.address ? String(input.address) : null,
          country: input.country ? String(input.country) : null,
          city: input.city ? String(input.city) : null,
          district: input.district ? String(input.district) : null,
          postalCode: input.postalCode ? String(input.postalCode) : null,
          homePhone: input.homePhone ? String(input.homePhone) : null,
        },
        update: {
          address: input.address !== undefined ? (input.address ? String(input.address) : null) : undefined,
          country: input.country !== undefined ? (input.country ? String(input.country) : null) : undefined,
          city: input.city !== undefined ? (input.city ? String(input.city) : null) : undefined,
          district: input.district !== undefined ? (input.district ? String(input.district) : null) : undefined,
          postalCode: input.postalCode !== undefined ? (input.postalCode ? String(input.postalCode) : null) : undefined,
          homePhone: input.homePhone !== undefined ? (input.homePhone ? String(input.homePhone) : null) : undefined,
        },
      });
    }

    if (this.hasProfilePayload(input, ["salary", "salaryPaymentDay", "bankName", "accountType", "accountNumber", "iban"])) {
      await tx.employeeFinancialProfile.upsert({
        where: { employeeId },
        create: {
          employeeId,
          salary: input.salary ? Number(input.salary) : null,
          salaryPaymentDay: input.salaryPaymentDay !== undefined ? this.toIntegerOrDefault(input.salaryPaymentDay, 1) : null,
          bankName: input.bankName ? String(input.bankName) : null,
          accountType: input.accountType ? String(input.accountType) : null,
          accountNumberEnc: this.encodeSensitiveOptional(input.accountNumber) ?? null,
          accountNumberLast4: this.last4(input.accountNumber),
          ibanEnc: this.encodeSensitiveOptional(input.iban) ?? null,
          ibanLast4: this.last4(input.iban),
        },
        update: {
          salary: input.salary !== undefined ? (input.salary ? Number(input.salary) : null) : undefined,
          salaryPaymentDay: input.salaryPaymentDay !== undefined ? this.toIntegerOrDefault(input.salaryPaymentDay, 1) : undefined,
          bankName: input.bankName !== undefined ? (input.bankName ? String(input.bankName) : null) : undefined,
          accountType: input.accountType !== undefined ? (input.accountType ? String(input.accountType) : null) : undefined,
          accountNumberEnc: input.accountNumber !== undefined ? (this.encodeSensitiveOptional(input.accountNumber) ?? null) : undefined,
          accountNumberLast4: input.accountNumber !== undefined ? this.last4(input.accountNumber) : undefined,
          ibanEnc: input.iban !== undefined ? (this.encodeSensitiveOptional(input.iban) ?? null) : undefined,
          ibanLast4: input.iban !== undefined ? this.last4(input.iban) : undefined,
        },
      });
    }

    if (this.hasProfilePayload(input, ["contactName", "contactPhone", "relation"])) {
      await tx.employeeEmergencyContact.upsert({
        where: { employeeId },
        create: {
          employeeId,
          contactName: input.contactName ? String(input.contactName) : null,
          contactPhone: input.contactPhone ? String(input.contactPhone) : null,
          relation: input.relation ? String(input.relation) : null,
        },
        update: {
          contactName: input.contactName !== undefined ? (input.contactName ? String(input.contactName) : null) : undefined,
          contactPhone: input.contactPhone !== undefined ? (input.contactPhone ? String(input.contactPhone) : null) : undefined,
          relation: input.relation !== undefined ? (input.relation ? String(input.relation) : null) : undefined,
        },
      });
    }
  }

  private async prepareGoalData(data: Record<string, unknown>, actor: AuthenticatedUser, isUpdate: boolean) {
    if (!isUpdate && !data.branchId) {
      data.branchId = actor.branchIds[0];
    }

    const startsAt = data.startsAt instanceof Date ? data.startsAt : data.startsAt ? new Date(String(data.startsAt)) : null;
    const endsAt = data.endsAt instanceof Date ? data.endsAt : data.endsAt ? new Date(String(data.endsAt)) : null;
    if (!startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt < startsAt) {
      throw new BadRequestException("Hedef tarih araligi gecersiz.");
    }

    const goalType = String(data.goalType ?? "revenue");
    const goalScope = String(data.goalScope ?? "general");
    if (!["product_quantity", "category_quantity", "revenue", "payment_method_total"].includes(goalType)) {
      throw new BadRequestException("Hedef tipi gecersiz.");
    }
    if (!["general", "employee"].includes(goalScope)) {
      throw new BadRequestException("Hedef kapsami gecersiz.");
    }

    if (goalScope === "employee" && !data.employeeProfileId) {
      throw new BadRequestException("Personel bazli hedefte personel secimi zorunlu.");
    }
    if (goalScope !== "employee") {
      data.employeeProfileId = null;
    }

    if (goalType === "product_quantity" && !data.productId) {
      throw new BadRequestException("Urun adet hedefinde urun secimi zorunlu.");
    }
    if (goalType !== "product_quantity") {
      data.productId = null;
    }

    if (goalType === "category_quantity" && !data.categoryId) {
      throw new BadRequestException("Kategori hedefinde kategori secimi zorunlu.");
    }
    if (goalType !== "category_quantity") {
      data.categoryId = null;
    }

    if (goalType === "payment_method_total" && !data.paymentMethod) {
      throw new BadRequestException("Odeme tipi hedefinde odeme tipi secimi zorunlu.");
    }
    if (goalType !== "payment_method_total") {
      data.paymentMethod = null;
    }

    const targetValue = Number(data.targetValue ?? 0);
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      throw new BadRequestException("Hedef degeri 0'dan buyuk olmali.");
    }

    const bonusValue = data.bonusValue === null || data.bonusValue === undefined || data.bonusValue === "" ? null : Number(data.bonusValue);
    if (bonusValue !== null && (!Number.isFinite(bonusValue) || bonusValue <= 0)) {
      throw new BadRequestException("Prim degeri 0'dan buyuk olmali.");
    }

    if (!isUpdate) {
      data.currentValue = 0;
      data.progressRate = 0;
      data.status = "active";
    }
  }

  private async writeAudit(
    resource: StaffResource,
    action: string,
    entityId: string,
    payload: unknown,
    actor: AuthenticatedUser,
    branchId?: string | null,
    oldValues?: unknown,
    newValues?: unknown,
  ) {
    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: branchId ?? null,
      userId: actor.userId,
      module: "staff",
      action: `${resource}.${action}`,
      entityType: resource,
      entityId,
      payload: {
        actor_user_id: actor.userId,
        employee_id: resource === "team" ? entityId : null,
        action_type: `${resource}.${action}`,
        created_at: new Date().toISOString(),
        payload: this.sanitizeAuditPayload(payload),
      },
      oldValues: this.sanitizeAuditPayload(oldValues),
      newValues: this.sanitizeAuditPayload(newValues),
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? actor.userAgent ?? null,
    });
  }

  private sanitizeAuditPayload(payload: unknown) {
    if (!payload || typeof payload !== "object") {
      return payload;
    }
    const normalized = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    if (typeof normalized.password === "string" && normalized.password.trim()) normalized.password = "[REDACTED]";
    if (typeof normalized.pinCode === "string" && normalized.pinCode.trim()) normalized.pinCode = this.maskSensitive(normalized.pinCode);
    if (typeof normalized.identityNumber === "string" && normalized.identityNumber.trim()) normalized.identityNumber = this.maskSensitive(normalized.identityNumber);
    if (typeof normalized.accountNumber === "string" && normalized.accountNumber.trim()) normalized.accountNumber = this.maskSensitive(normalized.accountNumber);
    if (typeof normalized.iban === "string" && normalized.iban.trim()) normalized.iban = this.maskSensitive(normalized.iban);
    return normalized;
  }
}
