import type { Prisma } from "@prisma/client";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { hash } from "bcryptjs";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { AccountingService } from "../accounting/accounting.service";
import { CreateEmployeePaymentDto } from "./dto/create-employee-payment.dto";
import { CreateEmployeeShiftDto } from "./dto/create-employee-shift.dto";
import { EmployeeListQueryDto } from "./dto/employee-list-query.dto";
import { EmployeeNoteDto } from "./dto/employee-note.dto";
import { UpdateEmployeeAccountSettingsDto } from "./dto/update-employee-account-settings.dto";
import { UpdateEmployeePaymentDto } from "./dto/update-employee-payment.dto";
import { UpdateEmployeeOtherInfoDto } from "./dto/update-employee-other-info.dto";
import { UpdateEmployeePersonalInfoDto } from "./dto/update-employee-personal-info.dto";

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly accountingService: AccountingService,
  ) {}

  async getDetail(id: string, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "staff.view");
    const employee = await this.getScopedEmployee(id, actor, {
      company: true,
      branch: true,
      staffRole: { include: { permissions: { include: { permission: true } } } },
      user: {
        include: {
          roles: {
            include: {
              branch: true,
              role: {
                include: {
                  permissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      },
      personalProfile: true,
      contactProfile: true,
      financialProfile: true,
      emergencyContact: true,
      statusLogs: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { createdByUser: true },
      },
    });

    const shiftWhere = { employeeProfileId: id };
    const paymentWhere = { employeeProfileId: id, deletedAt: null };

    const [shiftAggregate, approvedShiftCount, pendingShiftCount, lastShift, nextShift, paymentPaidAggregate, paymentReceivableAggregate, lastPayment, recentPayments] = await Promise.all([
      this.prisma.shift.aggregate({
        where: shiftWhere,
        _count: { id: true },
        _sum: { totalBreakMinutes: true, lateMinutes: true, overtimeMinutes: true },
      }),
      this.prisma.shift.count({ where: { ...shiftWhere, approvalStatus: "approved" } }),
      this.prisma.shift.count({ where: { ...shiftWhere, approvalStatus: { not: "approved" } } }),
      this.prisma.shift.findFirst({
        where: shiftWhere,
        orderBy: { scheduledStartAt: "desc" },
        include: { branch: true },
      }),
      this.prisma.shift.findFirst({
        where: { ...shiftWhere, scheduledStartAt: { gte: new Date() } },
        orderBy: { scheduledStartAt: "asc" },
        include: { branch: true },
      }),
      this.prisma.payrollPayment.aggregate({
        where: { ...paymentWhere, movementType: "PAYMENT" },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.payrollPayment.aggregate({
        where: { ...paymentWhere, movementType: "RECEIVABLE" },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.payrollPayment.findFirst({
        where: { ...paymentWhere, movementType: "PAYMENT" },
        include: { account: true, branch: true },
        orderBy: { paymentDate: "desc" },
      }),
      this.prisma.payrollPayment.findMany({
        where: paymentWhere,
        include: { account: true, branch: true },
        orderBy: { paymentDate: "desc" },
        take: 5,
      }),
    ]);

    const ledgerSummary = await this.buildLedgerSummary(id);
    const assignedRoles = (employee.user?.roles ?? []).map((link: any) => ({
      id: link.role.id,
      key: link.role.key,
      name: link.role.name,
      branchId: link.branchId,
      branchName: link.branch?.name ?? null,
      isPrimary: link.roleId === employee.staffRoleId,
    }));
    const effectivePermissions = [
      ...new Set(
        assignedRoles.flatMap((role: { id: string }) =>
          (employee.user?.roles ?? [])
            .filter((link: any) => link.role.id === role.id)
            .flatMap((link: any) => (link.role.permissions ?? []).map((permissionLink: any) => permissionLink.permission.key)),
        ),
      ),
    ];

    return this.success("Personel detay bilgisi getirildi.", {
      main: {
        id: employee.id,
        businessId: employee.companyId,
        branchId: employee.branchId,
        branchName: employee.branch.name,
        employeeCode: employee.employeeCode,
        firstName: employee.user?.firstName ?? this.extractFirstName(employee.user?.fullName),
        lastName: employee.user?.lastName ?? this.extractLastName(employee.user?.fullName),
        fullName: employee.user?.fullName ?? "",
        email: employee.user?.email ?? "",
        phone: employee.user?.phone ?? "",
        pinCodeMasked: this.maskSensitive(this.decodeSensitive(employee.pinCodeEnc)),
        restaurantRole: employee.restaurantRole ?? "",
        staffRoleId: employee.staffRoleId ?? null,
        staffRoleName: employee.staffRole?.name ?? "",
        hireDate: employee.hireDate,
        isActive: employee.isActive,
        isOwner: employee.isOwner,
        overtimeEnabled: employee.overtimeEnabled,
        dailyFreeDrinkLimit: employee.dailyFreeDrinkLimit,
        totalBreakMinutes: employee.totalBreakMinutes,
        createdAt: employee.createdAt,
        updatedAt: employee.updatedAt,
      },
      personalInfo: {
        photo: employee.personalProfile?.photo ?? "",
        nationality: employee.personalProfile?.nationality ?? "",
        identityNumberMasked: this.maskSensitive(this.decodeSensitive(employee.personalProfile?.identityNumberEnc)),
        gender: employee.personalProfile?.gender ?? "",
        bloodType: employee.personalProfile?.bloodType ?? "",
        disabilityStatus: employee.personalProfile?.disabilityStatus ?? "",
        educationStatus: employee.personalProfile?.educationStatus ?? "",
        highestEducationLevel: employee.personalProfile?.highestEducationLevel ?? "",
        lastEducationSchool: employee.personalProfile?.lastEducationSchool ?? "",
        maritalStatus: employee.personalProfile?.maritalStatus ?? "",
        childrenCount: employee.personalProfile?.childrenCount ?? null,
        birthDate: employee.personalProfile?.birthDate ?? employee.birthDate ?? null,
      },
      contactInfo: {
        address: employee.contactProfile?.address ?? "",
        country: employee.contactProfile?.country ?? "",
        city: employee.contactProfile?.city ?? "",
        district: employee.contactProfile?.district ?? "",
        postalCode: employee.contactProfile?.postalCode ?? "",
        homePhone: employee.contactProfile?.homePhone ?? "",
      },
      financialInfo: {
        salary: employee.financialProfile?.salary ?? employee.salary ?? null,
        salaryPaymentDay: employee.financialProfile?.salaryPaymentDay ?? null,
        bankName: employee.financialProfile?.bankName ?? "",
        accountType: employee.financialProfile?.accountType ?? "",
        accountNumberMasked: this.maskSensitive(this.decodeSensitive(employee.financialProfile?.accountNumberEnc)),
        ibanMasked: this.maskSensitive(this.decodeSensitive(employee.financialProfile?.ibanEnc)),
      },
      emergencyContact: {
        contactName: employee.emergencyContact?.contactName ?? "",
        contactPhone: employee.emergencyContact?.contactPhone ?? "",
        relation: employee.emergencyContact?.relation ?? "",
      },
      shiftSummary: {
        totalShifts: shiftAggregate._count.id,
        approvedShiftCount,
        pendingShiftCount,
        totalBreakMinutes: Number(shiftAggregate._sum.totalBreakMinutes ?? 0),
        totalLateMinutes: Number(shiftAggregate._sum.lateMinutes ?? 0),
        totalOvertimeMinutes: Number(shiftAggregate._sum.overtimeMinutes ?? 0),
        lastShift: this.serializeShift(lastShift),
        nextShift: this.serializeShift(nextShift),
      },
      paymentSummary: {
        paymentCount: paymentPaidAggregate._count.id,
        receivableCount: paymentReceivableAggregate._count.id,
        totalPaid: Number(paymentPaidAggregate._sum.amount ?? 0),
        totalRequired: Number(paymentReceivableAggregate._sum.amount ?? 0),
        remainingAmount: Number(paymentReceivableAggregate._sum.amount ?? 0) - Number(paymentPaidAggregate._sum.amount ?? 0),
        lastPayment: this.serializePayment(lastPayment),
        recentPayments: recentPayments.map((item) => this.serializePayment(item)),
      },
      accountMovementSummary: ledgerSummary.summary,
      rolePermissions: {
        primaryStaffRole: employee.staffRole
          ? {
              id: employee.staffRole.id,
              key: employee.staffRole.key,
              name: employee.staffRole.name,
            }
          : null,
        assignedRoles,
        effectivePermissions,
      },
      statusLogs: (employee.statusLogs ?? []).map((log: any) => ({
        id: log.id,
        actionType: log.actionType,
        oldStatus: log.oldStatus,
        newStatus: log.newStatus,
        note: log.note,
        createdAt: log.createdAt,
        createdBy: log.createdByUser?.fullName ?? null,
      })),
    });
  }

  async updateAccountSettings(id: string, dto: UpdateEmployeeAccountSettingsDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "staff.manage");
    const employee = await this.getScopedEmployee(id, actor, {
      staffRole: true,
      user: {
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      },
    });
    const branchId = dto.branchId ?? employee.branchId;
    this.ensureBranchAccess(actor, branchId);
    const normalizedEmail = dto.email !== undefined ? dto.email.trim().toLowerCase() : undefined;
    const normalizedPassword = dto.password !== undefined ? dto.password.trim() : undefined;
    const normalizedPinCode = dto.pinCode !== undefined ? dto.pinCode.trim() : undefined;
    const normalizedPhone = dto.phone !== undefined ? dto.phone.trim() : undefined;
    const normalizedRestaurantRole = dto.restaurantRole !== undefined ? dto.restaurantRole.trim() : undefined;
    const overtimeEnabled = dto.overtimeEnabled ?? employee.overtimeEnabled;
    const totalBreakMinutes = overtimeEnabled ? dto.totalBreakMinutes ?? undefined : 0;

    if (dto.email !== undefined && !normalizedEmail) {
      throw new BadRequestException("E-posta zorunlu.");
    }

    if (normalizedPinCode !== undefined && normalizedPinCode && !/^\d{4}$/.test(normalizedPinCode)) {
      throw new BadRequestException("Satis ekrani pin kodu 4 haneli ve sadece sayi olmali.");
    }

    if (normalizedPassword !== undefined && normalizedPassword && normalizedPassword.length < 8) {
      throw new BadRequestException("Parola en az 8 karakter olmali.");
    }

    if (normalizedPhone !== undefined && normalizedPhone && !this.isValidPhoneFormat(normalizedPhone)) {
      throw new BadRequestException("Telefon formati gecersiz.");
    }
    if (dto.hireDate !== undefined && dto.hireDate && Number.isNaN(new Date(dto.hireDate).getTime())) {
      throw new BadRequestException("Ise giris tarihi gecersiz.");
    }

    if (employee.userId && normalizedEmail) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          id: { not: employee.userId },
          email: { equals: normalizedEmail, mode: "insensitive" },
        },
        select: { id: true },
      });

      if (existingUser) {
        throw new BadRequestException("Bu e-posta adresi baska bir personel tarafindan kullaniliyor.");
      }
    }

    const { firstName, lastName, fullName } = this.resolveNameParts({
      firstName: dto.firstName ?? employee.user?.firstName,
      lastName: dto.lastName ?? employee.user?.lastName,
      fullName: employee.user?.fullName,
    });
    const staffRoleId = dto.staffRoleId ? await this.resolveRoleId(dto.staffRoleId, actor) : dto.staffRoleId === "" ? null : undefined;
    const oldSnapshot = this.buildEmployeeAccountAuditSnapshot(employee);
    const newSnapshot = this.buildEmployeeAccountAuditSnapshot(employee, {
      branchId,
      firstName,
      lastName,
      fullName,
      email: normalizedEmail ?? employee.user?.email ?? "",
      phone: normalizedPhone ?? employee.user?.phone ?? "",
      restaurantRole: normalizedRestaurantRole !== undefined ? normalizedRestaurantRole : employee.restaurantRole ?? "",
      staffRoleId: staffRoleId !== undefined ? staffRoleId : employee.staffRoleId ?? null,
      hireDate: dto.hireDate !== undefined ? (dto.hireDate ? new Date(dto.hireDate).toISOString() : null) : this.toAuditDate(employee.hireDate),
      overtimeEnabled,
      dailyFreeDrinkLimit: dto.dailyFreeDrinkLimit ?? employee.dailyFreeDrinkLimit,
      totalBreakMinutes,
      pinCodeMasked:
        normalizedPinCode !== undefined
          ? this.maskSensitive(normalizedPinCode)
          : this.maskSensitive(this.decodeSensitive(employee.pinCodeEnc)),
      assignedRoleKeys: dto.roleKeys ?? (employee.user?.roles ?? []).map((item: any) => String(item.role?.key ?? "")).filter(Boolean),
    });

    await this.prisma.$transaction(async (tx) => {
      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: {
            firstName,
            lastName,
            fullName,
            email: normalizedEmail ?? undefined,
            phone: normalizedPhone ?? undefined,
            defaultBranchId: branchId,
            passwordHash: normalizedPassword ? await hash(normalizedPassword, 10) : undefined,
          },
        });
      }

      await tx.employeeProfile.update({
        where: { id },
        data: {
          branchId,
          pinCodeEnc: normalizedPinCode !== undefined ? this.encodeSensitiveOptional(normalizedPinCode) : undefined,
          restaurantRole: normalizedRestaurantRole !== undefined ? normalizedRestaurantRole || null : undefined,
          staffRoleId,
          hireDate: dto.hireDate !== undefined ? (dto.hireDate ? new Date(dto.hireDate) : null) : undefined,
          overtimeEnabled: dto.overtimeEnabled ?? undefined,
          dailyFreeDrinkLimit: dto.dailyFreeDrinkLimit ?? undefined,
          totalBreakMinutes,
        },
      });

      if (employee.userId && dto.roleKeys) {
        await this.syncUserRolesTx(tx, employee.userId, branchId, dto.roleKeys, actor);
      }
    });

    const updated = await this.getDetail(id, actor);
    await this.writeAudit("employee.account_settings.update", id, dto, actor, branchId, oldSnapshot, newSnapshot);
    await this.writeChangedFieldAudit("employee.role.change", id, actor, branchId, oldSnapshot, newSnapshot, [
      "staffRoleId",
      "restaurantRole",
      "assignedRoleKeys",
    ]);
    await this.writeChangedFieldAudit("employee.pin.change", id, actor, branchId, oldSnapshot, newSnapshot, ["pinCodeMasked"]);
    await this.writeChangedFieldAudit("employee.email.change", id, actor, branchId, oldSnapshot, newSnapshot, ["email"]);
    return this.success("Personel hesap ayarlari guncellendi.", updated.data);
  }

  async updatePersonalInfo(id: string, dto: UpdateEmployeePersonalInfoDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "staff.manage");
    const employee = await this.getScopedEmployee(id, actor, { personalProfile: true, user: true });
    const normalizedBirthDate = dto.birthDate !== undefined ? dto.birthDate.trim() : undefined;
    const normalizedPhoto = dto.photo !== undefined ? this.normalizeEmployeePhoto(dto.photo) : undefined;
    const normalizedIdentityNumber = dto.identityNumber !== undefined ? dto.identityNumber.trim() : undefined;
    const normalizedPhone = dto.phone !== undefined ? dto.phone.trim() : undefined;

    if (normalizedPhone && !this.isValidPhoneFormat(normalizedPhone)) {
      throw new BadRequestException("Telefon formati gecersiz.");
    }

    if (normalizedBirthDate) {
      const birthDate = new Date(normalizedBirthDate);
      if (Number.isNaN(birthDate.getTime())) {
        throw new BadRequestException("Dogum tarihi gecersiz.");
      }
      if (birthDate > new Date()) {
        throw new BadRequestException("Dogum tarihi ileri tarih olamaz.");
      }
      if (birthDate.getFullYear() < 1900) {
        throw new BadRequestException("Dogum tarihi mantikli bir aralikta olmali.");
      }
      const age = this.diffYears(new Date(), birthDate);
      if (age < 14) {
        throw new BadRequestException("Personel dogum tarihi calisma yasi icin uygun degil.");
      }
    }

    const oldSnapshot = this.buildEmployeePersonalAuditSnapshot(employee);
    const newSnapshot = this.buildEmployeePersonalAuditSnapshot(employee, {
      photo: normalizedPhoto !== undefined ? normalizedPhoto : employee.personalProfile?.photo ?? "",
      nationality: dto.nationality !== undefined ? dto.nationality || "" : employee.personalProfile?.nationality ?? "",
      identityNumberMasked:
        normalizedIdentityNumber !== undefined
          ? this.maskSensitive(normalizedIdentityNumber)
          : this.maskSensitive(this.decodeSensitive(employee.personalProfile?.identityNumberEnc)),
      gender: dto.gender !== undefined ? dto.gender || "" : employee.personalProfile?.gender ?? "",
      bloodType: dto.bloodType !== undefined ? dto.bloodType || "" : employee.personalProfile?.bloodType ?? "",
      disabilityStatus: dto.disabilityStatus !== undefined ? dto.disabilityStatus || "" : employee.personalProfile?.disabilityStatus ?? "",
      educationStatus: dto.educationStatus !== undefined ? dto.educationStatus || "" : employee.personalProfile?.educationStatus ?? "",
      highestEducationLevel:
        dto.highestEducationLevel !== undefined ? dto.highestEducationLevel || "" : employee.personalProfile?.highestEducationLevel ?? "",
      lastEducationSchool:
        dto.lastEducationSchool !== undefined ? dto.lastEducationSchool || "" : employee.personalProfile?.lastEducationSchool ?? "",
      maritalStatus: dto.maritalStatus !== undefined ? dto.maritalStatus || "" : employee.personalProfile?.maritalStatus ?? "",
      childrenCount: dto.childrenCount !== undefined ? dto.childrenCount ?? null : employee.personalProfile?.childrenCount ?? null,
      birthDate:
        normalizedBirthDate !== undefined
          ? normalizedBirthDate || null
          : this.toAuditDate(employee.personalProfile?.birthDate ?? employee.birthDate),
    });

    await this.prisma.$transaction(async (tx) => {
      if (employee.userId && normalizedPhone !== undefined) {
        await tx.user.update({
          where: { id: employee.userId },
          data: {
            phone: normalizedPhone || null,
          },
        });
      }

      await tx.employeePersonalProfile.upsert({
        where: { employeeId: id },
        create: {
          employeeId: id,
          photo: normalizedPhoto ?? null,
          nationality: dto.nationality ?? null,
          identityNumberEnc: this.encodeSensitiveOptional(normalizedIdentityNumber) ?? null,
          identityNumberLast4: this.last4(normalizedIdentityNumber),
          gender: dto.gender ?? null,
          bloodType: dto.bloodType ?? null,
          disabilityStatus: dto.disabilityStatus ?? null,
          educationStatus: dto.educationStatus ?? null,
          highestEducationLevel: dto.highestEducationLevel ?? null,
          lastEducationSchool: dto.lastEducationSchool ?? null,
          maritalStatus: dto.maritalStatus ?? null,
          childrenCount: dto.childrenCount ?? null,
          birthDate: normalizedBirthDate ? new Date(normalizedBirthDate) : null,
        },
        update: {
          photo: normalizedPhoto !== undefined ? normalizedPhoto || null : undefined,
          nationality: dto.nationality !== undefined ? dto.nationality || null : undefined,
          identityNumberEnc: normalizedIdentityNumber !== undefined ? this.encodeSensitiveOptional(normalizedIdentityNumber) : undefined,
          identityNumberLast4: normalizedIdentityNumber !== undefined ? this.last4(normalizedIdentityNumber) : undefined,
          gender: dto.gender !== undefined ? dto.gender || null : undefined,
          bloodType: dto.bloodType !== undefined ? dto.bloodType || null : undefined,
          disabilityStatus: dto.disabilityStatus !== undefined ? dto.disabilityStatus || null : undefined,
          educationStatus: dto.educationStatus !== undefined ? dto.educationStatus || null : undefined,
          highestEducationLevel: dto.highestEducationLevel !== undefined ? dto.highestEducationLevel || null : undefined,
          lastEducationSchool: dto.lastEducationSchool !== undefined ? dto.lastEducationSchool || null : undefined,
          maritalStatus: dto.maritalStatus !== undefined ? dto.maritalStatus || null : undefined,
          childrenCount: dto.childrenCount !== undefined ? dto.childrenCount : undefined,
          birthDate: normalizedBirthDate !== undefined ? (normalizedBirthDate ? new Date(normalizedBirthDate) : null) : undefined,
        },
      });

      if (normalizedBirthDate !== undefined) {
        await tx.employeeProfile.update({
          where: { id },
          data: { birthDate: normalizedBirthDate ? new Date(normalizedBirthDate) : null },
        });
      }
    });

    await this.writeAudit("employee.personal_info.update", id, dto, actor, employee.branchId, oldSnapshot, newSnapshot);
    const updated = await this.getDetail(id, actor);
    return this.success("Personel kisisel bilgileri guncellendi.", updated.data);
  }

  async updateOtherInfo(id: string, dto: UpdateEmployeeOtherInfoDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "staff.manage");
    const employee = await this.getScopedEmployee(id, actor, {
      contactProfile: true,
      financialProfile: true,
      emergencyContact: true,
    });
    const normalizedCountry = dto.country !== undefined ? dto.country.trim() : undefined;
    const normalizedCity = dto.city !== undefined ? dto.city.trim() : undefined;
    const normalizedDistrict = dto.district !== undefined ? dto.district.trim() : undefined;
    const normalizedHomePhone = dto.homePhone !== undefined ? dto.homePhone.trim() : undefined;
    const normalizedBankName = dto.bankName !== undefined ? dto.bankName.trim() : undefined;
    const normalizedAccountType = dto.accountType !== undefined ? dto.accountType.trim() : undefined;
    const normalizedAccountNumber = dto.accountNumber !== undefined ? dto.accountNumber.replace(/\s+/g, "").trim() : undefined;
    const normalizedIban = dto.iban !== undefined ? dto.iban.replace(/\s+/g, "").toUpperCase().trim() : undefined;
    const normalizedContactPhone = dto.contactPhone !== undefined ? dto.contactPhone.trim() : undefined;

    if (normalizedHomePhone && !this.isValidPhoneFormat(normalizedHomePhone)) {
      throw new BadRequestException("Ev telefonu formati gecersiz.");
    }

    if (normalizedContactPhone && !this.isValidPhoneFormat(normalizedContactPhone)) {
      throw new BadRequestException("Acil durum telefonu formati gecersiz.");
    }
    if (dto.salary !== undefined && dto.salary < 0) {
      throw new BadRequestException("Maas negatif olamaz.");
    }
    if (dto.salaryPaymentDay !== undefined && (dto.salaryPaymentDay < 1 || dto.salaryPaymentDay > 31)) {
      throw new BadRequestException("Maas odeme gunu 1 ile 31 arasinda olmali.");
    }

    const hasBankPayload = [normalizedBankName, normalizedAccountType, normalizedAccountNumber, normalizedIban].some((value) => Boolean(value));
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

    const oldSnapshot = this.buildEmployeeOtherAuditSnapshot(employee);
    const newSnapshot = this.buildEmployeeOtherAuditSnapshot(employee, {
      address: dto.address !== undefined ? dto.address || "" : employee.contactProfile?.address ?? "",
      country: normalizedCountry !== undefined ? normalizedCountry || "" : employee.contactProfile?.country ?? "",
      city: normalizedCity !== undefined ? normalizedCity || "" : employee.contactProfile?.city ?? "",
      district: normalizedDistrict !== undefined ? normalizedDistrict || "" : employee.contactProfile?.district ?? "",
      postalCode: dto.postalCode !== undefined ? dto.postalCode || "" : employee.contactProfile?.postalCode ?? "",
      homePhone: normalizedHomePhone !== undefined ? normalizedHomePhone || "" : employee.contactProfile?.homePhone ?? "",
      salary: dto.salary !== undefined ? dto.salary ?? null : employee.financialProfile?.salary ?? employee.salary ?? null,
      salaryPaymentDay:
        dto.salaryPaymentDay !== undefined ? dto.salaryPaymentDay ?? null : employee.financialProfile?.salaryPaymentDay ?? null,
      bankName: normalizedBankName !== undefined ? normalizedBankName || "" : employee.financialProfile?.bankName ?? "",
      accountType: normalizedAccountType !== undefined ? normalizedAccountType || "" : employee.financialProfile?.accountType ?? "",
      accountNumberMasked:
        normalizedAccountNumber !== undefined
          ? this.maskSensitive(normalizedAccountNumber)
          : this.maskSensitive(this.decodeSensitive(employee.financialProfile?.accountNumberEnc)),
      ibanMasked:
        normalizedIban !== undefined ? this.maskSensitive(normalizedIban) : this.maskSensitive(this.decodeSensitive(employee.financialProfile?.ibanEnc)),
      contactName: dto.contactName !== undefined ? dto.contactName || "" : employee.emergencyContact?.contactName ?? "",
      contactPhone: normalizedContactPhone !== undefined ? normalizedContactPhone || "" : employee.emergencyContact?.contactPhone ?? "",
      relation: dto.relation !== undefined ? dto.relation || "" : employee.emergencyContact?.relation ?? "",
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeContactProfile.upsert({
        where: { employeeId: id },
        create: {
          employeeId: id,
          address: dto.address ?? null,
          country: normalizedCountry ?? null,
          city: normalizedCity ?? null,
          district: normalizedDistrict ?? null,
          postalCode: dto.postalCode ?? null,
          homePhone: normalizedHomePhone ?? null,
        },
        update: {
          address: dto.address !== undefined ? dto.address || null : undefined,
          country: normalizedCountry !== undefined ? normalizedCountry || null : undefined,
          city: normalizedCity !== undefined ? normalizedCity || null : undefined,
          district: normalizedDistrict !== undefined ? normalizedDistrict || null : undefined,
          postalCode: dto.postalCode !== undefined ? dto.postalCode || null : undefined,
          homePhone: normalizedHomePhone !== undefined ? normalizedHomePhone || null : undefined,
        },
      });

      await tx.employeeFinancialProfile.upsert({
        where: { employeeId: id },
        create: {
          employeeId: id,
          salary: dto.salary ?? null,
          salaryPaymentDay: dto.salaryPaymentDay ?? null,
          bankName: normalizedBankName ?? null,
          accountType: normalizedAccountType ?? null,
          accountNumberEnc: this.encodeSensitiveOptional(normalizedAccountNumber) ?? null,
          accountNumberLast4: this.last4(normalizedAccountNumber),
          ibanEnc: this.encodeSensitiveOptional(normalizedIban) ?? null,
          ibanLast4: this.last4(normalizedIban),
        },
        update: {
          salary: dto.salary !== undefined ? dto.salary : undefined,
          salaryPaymentDay: dto.salaryPaymentDay !== undefined ? dto.salaryPaymentDay : undefined,
          bankName: normalizedBankName !== undefined ? normalizedBankName || null : undefined,
          accountType: normalizedAccountType !== undefined ? normalizedAccountType || null : undefined,
          accountNumberEnc: normalizedAccountNumber !== undefined ? this.encodeSensitiveOptional(normalizedAccountNumber) : undefined,
          accountNumberLast4: normalizedAccountNumber !== undefined ? this.last4(normalizedAccountNumber) : undefined,
          ibanEnc: normalizedIban !== undefined ? this.encodeSensitiveOptional(normalizedIban) : undefined,
          ibanLast4: normalizedIban !== undefined ? this.last4(normalizedIban) : undefined,
        },
      });

      await tx.employeeEmergencyContact.upsert({
        where: { employeeId: id },
        create: {
          employeeId: id,
          contactName: dto.contactName ?? null,
          contactPhone: normalizedContactPhone ?? null,
          relation: dto.relation ?? null,
        },
        update: {
          contactName: dto.contactName !== undefined ? dto.contactName || null : undefined,
          contactPhone: normalizedContactPhone !== undefined ? normalizedContactPhone || null : undefined,
          relation: dto.relation !== undefined ? dto.relation || null : undefined,
        },
      });

      if (dto.salary !== undefined) {
        await tx.employeeProfile.update({
          where: { id },
          data: { salary: dto.salary },
        });
      }
    });

    await this.writeAudit("employee.other_info.update", id, dto, actor, employee.branchId, oldSnapshot, newSnapshot);
    await this.writeChangedFieldAudit("employee.salary.change", id, actor, employee.branchId, oldSnapshot, newSnapshot, [
      "salary",
      "salaryPaymentDay",
    ]);
    await this.writeChangedFieldAudit("employee.bank_info.change", id, actor, employee.branchId, oldSnapshot, newSnapshot, [
      "bankName",
      "accountType",
      "accountNumberMasked",
      "ibanMasked",
    ]);
    const updated = await this.getDetail(id, actor);
    return this.success("Personel diger bilgileri guncellendi.", updated.data);
  }

  async getPayments(id: string, query: EmployeeListQueryDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "staff.view");
    await this.getScopedEmployee(id, actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      employeeProfileId: id,
      deletedAt: null,
      ...(this.buildDateRangeFilter("paymentDate", query) ?? {}),
    };

    const [items, total, paidAggregate, receivableAggregate] = await Promise.all([
      this.prisma.payrollPayment.findMany({
        where,
        include: { account: true, branch: true },
        orderBy: { paymentDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payrollPayment.count({ where }),
      this.prisma.payrollPayment.aggregate({
        where: { ...where, movementType: "PAYMENT" },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.payrollPayment.aggregate({
        where: { ...where, movementType: "RECEIVABLE" },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    return this.success("Personel odeme kayitlari getirildi.", {
      items: items.map((item) => this.serializePayment(item)),
      summary: {
        paymentCount: paidAggregate._count.id,
        receivableCount: receivableAggregate._count.id,
        totalPaid: Number(paidAggregate._sum.amount ?? 0),
        totalRequired: Number(receivableAggregate._sum.amount ?? 0),
        remainingAmount: Number(receivableAggregate._sum.amount ?? 0) - Number(paidAggregate._sum.amount ?? 0),
        totalRecords: total,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  }

  async createPayment(id: string, dto: CreateEmployeePaymentDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "accounting.manage");
    const employee = await this.getScopedEmployee(id, actor);
    this.ensureEmployeeActiveForCriticalAction(employee, "Pasif personel icin odeme/alacak kaydi olusturulamaz.");
    const branchId = dto.branchId ?? employee.branchId;
    this.ensureBranchAccess(actor, branchId);
    if (branchId !== employee.branchId) {
      throw new BadRequestException("Odeme kaydi personelin bagli oldugu sube ile uyumlu olmali.");
    }

    const payload = this.normalizeEmployeePaymentPayload(dto);
    const created = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payrollPayment.create({
        data: {
          branchId,
          employeeProfileId: id,
          accountId: payload.accountId,
          createdByUserId: actor.userId,
          amount: dto.amount,
          paymentDate: payload.paymentDate,
          movementType: payload.movementType,
          transactionType: payload.transactionType,
          paymentMethod: payload.paymentMethod,
          documentUrl: payload.documentUrl,
          notes: payload.notes,
        },
        include: { account: true, branch: true },
      });

      await this.syncEmployeePaymentLedgerTx(tx, payment, actor);
      return payment;
    });

    await this.writeAudit("employee.payment.create", id, dto, actor, branchId, null, this.serializePayment(created));
    return this.success(payload.movementType === "RECEIVABLE" ? "Personel alacak kaydi olusturuldu." : "Personel odeme kaydi olusturuldu.", this.serializePayment(created));
  }

  async updatePayment(id: string, paymentId: string, dto: UpdateEmployeePaymentDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "accounting.manage");
    const employee = await this.getScopedEmployee(id, actor);
    this.ensureEmployeeActiveForCriticalAction(employee, "Pasif personelin odeme kaydi guncellenemez.");
    const payment = await this.getScopedPayment(id, paymentId, actor);
    const payload = this.normalizeEmployeePaymentPayload(dto, payment);
    const updated = await this.prisma.$transaction(async (tx) => {
      const entity = await tx.payrollPayment.update({
        where: { id: paymentId },
        data: {
          accountId: payload.accountId,
          amount: dto.amount ?? undefined,
          paymentDate: payload.paymentDate,
          movementType: payload.movementType,
          transactionType: payload.transactionType,
          paymentMethod: payload.paymentMethod,
          documentUrl: payload.documentUrl,
          notes: payload.notes,
        },
        include: { account: true, branch: true },
      });

      await this.syncEmployeePaymentLedgerTx(tx, entity, actor);
      return entity;
    });

    await this.writeAudit(
      "employee.payment.update",
      id,
      { paymentId, ...dto },
      actor,
      payment.branchId,
      this.serializePayment(payment),
      this.serializePayment(updated),
    );
    return this.success("Personel odeme kaydi guncellendi.", this.serializePayment(updated));
  }

  async deletePayment(id: string, paymentId: string, dto: EmployeeNoteDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "accounting.manage");
    const employee = await this.getScopedEmployee(id, actor);
    this.ensureEmployeeActiveForCriticalAction(employee, "Pasif personelin odeme kaydi silinemez.");
    const payment = await this.getScopedPayment(id, paymentId, actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollPayment.update({
        where: { id: paymentId },
        data: {
          deletedAt: new Date(),
          deletedByUserId: actor.userId,
          deletionNote: dto.note?.trim() || null,
        },
      });
      await tx.ledgerEntry.deleteMany({
        where: {
          sourceType: "payroll",
          sourceId: paymentId,
        },
      });
    });

    await this.writeAudit(
      "employee.payment.delete",
      id,
      { paymentId, note: dto.note ?? null },
      actor,
      payment.branchId,
      this.serializePayment(payment),
      {
        id: payment.id,
        deletedAt: new Date().toISOString(),
        deletedByUserId: actor.userId,
        deletionNote: dto.note?.trim() || null,
      },
    );
    return this.success("Personel odeme kaydi kaldirildi.", { id: paymentId, deletedAt: new Date().toISOString() });
  }

  async getAccountMovements(id: string, query: EmployeeListQueryDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "staff.view");
    await this.getScopedEmployee(id, actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const paymentWhere: Prisma.PayrollPaymentWhereInput = {
      employeeProfileId: id,
      deletedAt: null,
      ...(this.buildDateRangeFilter("paymentDate", query) ?? {}),
    };
    const statusLogWhere: Prisma.EmployeeStatusLogWhereInput = {
      employeeId: id,
      ...(this.buildDateRangeFilter("createdAt", query) ?? {}),
    };

    const [payments, statusLogs] = await Promise.all([
      this.prisma.payrollPayment.findMany({
        where: paymentWhere,
        include: { account: true, branch: true },
        orderBy: { paymentDate: "desc" },
      }),
      this.prisma.employeeStatusLog.findMany({
        where: statusLogWhere,
        include: { createdByUser: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const creatorIds = [...new Set(payments.map((item) => item.createdByUserId).filter((value): value is string => Boolean(value)))];
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const creatorMap = new Map(creators.map((user) => [user.id, user.fullName]));

    const timeline = [
      ...payments.map((payment) => {
        const signedAmount = payment.movementType === "RECEIVABLE" ? Number(payment.amount ?? 0) : -Number(payment.amount ?? 0);
        return {
          id: `payment-${payment.id}`,
          sourceType: "financial",
          sourceKey: payment.id,
          occurredAt: payment.paymentDate,
          movementType: payment.movementType === "RECEIVABLE" ? "Alacak" : "Odeme",
          transactionType: this.formatEmployeeTransactionType(payment.transactionType),
          amount: Number(payment.amount ?? 0),
          signedAmount,
          description: payment.notes ?? this.formatEmployeeTransactionType(payment.transactionType),
          createdBy: payment.createdByUserId ? creatorMap.get(payment.createdByUserId) ?? null : null,
          referenceRecord: `PAY-${payment.id}`,
          accountName: payment.account?.name ?? null,
          branchName: payment.branch?.name ?? null,
          paymentMethod: payment.paymentMethod ?? null,
          documentUrl: payment.documentUrl ?? null,
        };
      }),
      ...statusLogs.map((log) => ({
        id: `status-${log.id}`,
        sourceType: "status",
        sourceKey: log.id,
        occurredAt: log.createdAt,
        movementType: "Durum Degisikligi",
        transactionType: this.formatEmployeeStatusAction(log.actionType),
        amount: 0,
        signedAmount: 0,
        description: log.note ?? `${log.oldStatus ?? "-"} -> ${log.newStatus ?? "-"}`,
        createdBy: log.createdByUser?.fullName ?? null,
        referenceRecord: `STAT-${log.id}`,
        accountName: null,
        branchName: null,
        paymentMethod: null,
        documentUrl: null,
      })),
    ]
      .filter((item) => {
        const matchesSource =
          !query.sourceType ||
          query.sourceType === "all" ||
          (query.sourceType === "financial" && item.sourceType === "financial") ||
          (query.sourceType === "status" && item.sourceType === "status");
        const search = String(query.search ?? "").trim().toLowerCase();
        const haystack = [item.movementType, item.transactionType, item.description, item.createdBy, item.referenceRecord].join(" ").toLowerCase();
        return matchesSource && (!search || haystack.includes(search));
      })
      .sort((a, b) => (a.occurredAt > b.occurredAt ? -1 : 1));

    const paginated = timeline.slice((page - 1) * limit, page * limit);
    const totalRequired = timeline
      .filter((item) => item.sourceType === "financial" && item.movementType === "Alacak")
      .reduce((sum, item) => sum + item.amount, 0);
    const totalPaid = timeline
      .filter((item) => item.sourceType === "financial" && item.movementType === "Odeme")
      .reduce((sum, item) => sum + item.amount, 0);
    const statusChangeCount = timeline.filter((item) => item.sourceType === "status").length;

    return this.success("Personel hesap hareketleri getirildi.", {
      items: paginated,
      summary: {
        movementCount: timeline.length,
        financialCount: timeline.filter((item) => item.sourceType === "financial").length,
        statusChangeCount,
        totalRequired,
        totalPaid,
        remainingAmount: totalRequired - totalPaid,
        net: totalRequired - totalPaid,
      },
      pagination: {
        page,
        limit,
        total: timeline.length,
        totalPages: Math.max(1, Math.ceil(timeline.length / limit)),
      },
    });
  }

  async getShifts(id: string, query: EmployeeListQueryDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "staff.view");
    await this.getScopedEmployee(id, actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ShiftWhereInput = {
      employeeProfileId: id,
      ...(query.shiftType && query.shiftType !== "all" ? { shiftType: query.shiftType as any } : {}),
      ...(this.buildDateRangeFilter("scheduledStartAt", query) ?? {}),
    };

    const [items, total, aggregate, workCount, leaveCount, offDayCount] = await Promise.all([
      this.prisma.shift.findMany({
        where,
        include: { branch: true, breakRecords: true },
        orderBy: { scheduledStartAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.shift.count({ where }),
      this.prisma.shift.aggregate({
        where,
        _sum: { totalBreakMinutes: true, lateMinutes: true, overtimeMinutes: true },
      }),
      this.prisma.shift.count({ where: { ...where, shiftType: "WORK" } }),
      this.prisma.shift.count({ where: { ...where, shiftType: "LEAVE" } }),
      this.prisma.shift.count({ where: { ...where, shiftType: "OFF_DAY" } }),
    ]);

    const creatorIds = [...new Set(items.map((item) => item.createdByUserId).filter((value): value is string => Boolean(value)))];
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const creatorMap = new Map(creators.map((item) => [item.id, item.fullName]));

    return this.success("Personel vardiya kayitlari getirildi.", {
      items: items.map((item) => this.serializeShift(item, creatorMap.get(item.createdByUserId ?? "") ?? null)),
      summary: {
        totalShifts: total,
        workCount,
        leaveCount,
        offDayCount,
        totalBreakMinutes: Number(aggregate._sum.totalBreakMinutes ?? 0),
        totalLateMinutes: Number(aggregate._sum.lateMinutes ?? 0),
        totalOvertimeMinutes: Number(aggregate._sum.overtimeMinutes ?? 0),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  }

  async createShift(id: string, dto: CreateEmployeeShiftDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "attendance.manage");
    const employee = await this.getScopedEmployee(id, actor);
    if (!employee.isActive) {
      throw new BadRequestException("Pasif personel icin yeni vardiya eklenemez.");
    }

    const branchId = dto.branchId ?? employee.branchId;
    this.ensureBranchAccess(actor, branchId);
    if (branchId !== employee.branchId) {
      throw new BadRequestException("Vardiya personelin bagli oldugu sube ile uyumlu olmali.");
    }

    const scheduledStartAt = new Date(dto.scheduledStartAt);
    const scheduledEndAt = new Date(dto.scheduledEndAt);
    if (Number.isNaN(scheduledStartAt.getTime()) || Number.isNaN(scheduledEndAt.getTime())) {
      throw new BadRequestException("Vardiya tarihleri gecersiz.");
    }
    if (scheduledEndAt <= scheduledStartAt) {
      throw new BadRequestException("Bitis saati baslangictan sonra olmali.");
    }

    await this.ensureNoShiftOverlap(id, branchId, scheduledStartAt, scheduledEndAt);
    const approvalStatus = dto.shiftType === "WORK" ? "approved" : "scheduled";
    const created = await this.prisma.shift.create({
      data: {
        branchId,
        employeeProfileId: id,
        shiftType: dto.shiftType,
        createdByUserId: actor.userId,
        scheduledStartAt,
        scheduledEndAt,
        approvalStatus,
        notes: dto.notes?.trim() || null,
      },
      include: { branch: true, breakRecords: true },
    });

    await this.writeAudit("employee.shift.create", id, dto, actor, branchId, null, this.serializeShift(created, actor.userId));
    return this.success("Personel vardiya kaydi olusturuldu.", this.serializeShift(created, actor.userId));
  }

  async exportShifts(id: string, query: EmployeeListQueryDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "staff.view");
    await this.getScopedEmployee(id, actor);
    const where: Prisma.ShiftWhereInput = {
      employeeProfileId: id,
      ...(query.shiftType && query.shiftType !== "all" ? { shiftType: query.shiftType as any } : {}),
      ...(this.buildDateRangeFilter("scheduledStartAt", query) ?? {}),
    };
    const items = await this.prisma.shift.findMany({
      where,
      include: { branch: true, breakRecords: true },
      orderBy: { scheduledStartAt: "desc" },
    });

    const csvRows = [
      ["Tarih", "Tur", "Baslangic", "Bitis", "Sube", "Mola", "Gecikme", "Mesai", "Durum", "Not"],
      ...items.map((item) => [
        item.scheduledStartAt.toISOString().slice(0, 10),
        this.formatShiftType(item.shiftType),
        item.scheduledStartAt.toISOString(),
        item.scheduledEndAt.toISOString(),
        item.branch.name,
        String(item.totalBreakMinutes ?? 0),
        String(item.lateMinutes ?? 0),
        String(item.overtimeMinutes ?? 0),
        item.approvalStatus,
        item.notes ?? "",
      ]),
    ];

    return this.success("Personel vardiya export hazirlandi.", {
      fileName: `employee-shifts-${id}.csv`,
      content: csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n"),
    });
  }

  async passiveEmployee(id: string, dto: EmployeeNoteDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "staff.manage");
    const employee = await this.getScopedEmployee(id, actor, { user: true });

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeProfile.update({
        where: { id },
        data: { isActive: false },
      });

      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { isActive: false },
        });
      }

      await tx.employeeStatusLog.create({
        data: {
          employeeId: id,
          actionType: "passive",
          oldStatus: employee.isActive ? "active" : "passive",
          newStatus: "passive",
          note: dto.note ?? null,
          createdByUserId: actor.userId,
        },
      });
    });

    await this.writeAudit(
      "employee.passive",
      id,
      dto,
      actor,
      employee.branchId,
      { isActive: employee.isActive, userIsActive: employee.user?.isActive ?? null },
      { isActive: false, userIsActive: false },
    );
    return this.success("Personel pasife alindi.", { id, isActive: false });
  }

  async assignOwner(id: string, dto: EmployeeNoteDto, actor: AuthenticatedUser) {
    this.ensureActorPermission(actor, "staff.manage");
    if (!["tenant_owner", "super_admin"].includes(String(actor.role ?? ""))) {
      throw new ForbiddenException("Isletme sahibi atama islemi sadece yetkili kullanicilar tarafindan yapilabilir.");
    }

    const employee = await this.getScopedEmployee(id, actor, { user: true });
    if (!employee.isActive) {
      throw new BadRequestException("Pasif personel isletme sahibi olarak atanamaz.");
    }

    const ownerRole = await this.prisma.role.findFirst({
      where: {
        companyId: actor.tenantId,
        key: "tenant_owner",
      },
    });

    await this.prisma.$transaction(async (tx) => {
      const currentOwners = await tx.employeeProfile.findMany({
        where: {
          companyId: actor.tenantId,
          isOwner: true,
        },
        select: { id: true, userId: true },
      });

      await tx.employeeProfile.updateMany({
        where: {
          companyId: actor.tenantId,
          isOwner: true,
        },
        data: { isOwner: false },
      });

      await tx.employeeProfile.update({
        where: { id },
        data: { isOwner: true },
      });

      for (const currentOwner of currentOwners.filter((item) => item.id !== id)) {
        await tx.employeeStatusLog.create({
          data: {
            employeeId: currentOwner.id,
            actionType: "owner_removed",
            oldStatus: "owner",
            newStatus: "staff",
            note: dto.note ?? null,
            createdByUserId: actor.userId,
          },
        });
      }

      await tx.employeeStatusLog.create({
        data: {
          employeeId: id,
          actionType: "owner_assigned",
          oldStatus: employee.isOwner ? "owner" : "staff",
          newStatus: "owner",
          note: dto.note ?? null,
          createdByUserId: actor.userId,
        },
      });

      if (ownerRole) {
        const companyUsers = await tx.user.findMany({
          where: { companyId: actor.tenantId },
          select: { id: true },
        });

        await tx.userRole.deleteMany({
          where: {
            roleId: ownerRole.id,
            userId: { in: companyUsers.map((item) => item.id) },
          },
        });

        if (employee.userId) {
          await tx.userRole.create({
            data: {
              userId: employee.userId,
              roleId: ownerRole.id,
              branchId: employee.branchId,
            },
          });
        }
      }
    });

    await this.writeAudit(
      "employee.assign_owner",
      id,
      dto,
      actor,
      employee.branchId,
      { isOwner: employee.isOwner },
      { isOwner: true },
    );
    return this.success("Personel isletme sahibi olarak atandi.", { id, isOwner: true });
  }

  private async getScopedEmployee(id: string, actor: AuthenticatedUser, include?: Record<string, unknown>) {
    const employee = await this.prisma.employeeProfile.findFirst({
      where: {
        id,
        companyId: actor.tenantId,
        branchId: { in: actor.branchIds },
      },
      include: include as any,
    });

    if (!employee) {
      throw new NotFoundException("Personel bulunamadi.");
    }

    return employee as any;
  }

  private async buildLedgerSummary(employeeId: string) {
    const payrollIds = await this.prisma.payrollPayment.findMany({
      where: { employeeProfileId: employeeId, deletedAt: null, movementType: "PAYMENT" },
      select: { id: true },
    });

    if (!payrollIds.length) {
      return {
        summary: {
          movementCount: 0,
          totalDebit: 0,
          totalCredit: 0,
          net: 0,
        },
      };
    }

    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        sourceType: "payroll",
        sourceId: { in: payrollIds.map((item) => item.id) },
      },
      orderBy: { entryDate: "desc" },
      take: 5,
      include: { account: true, branch: true },
    });

    const allEntries = await this.prisma.ledgerEntry.findMany({
      where: {
        sourceType: "payroll",
        sourceId: { in: payrollIds.map((item) => item.id) },
      },
    });

    const totalDebit = allEntries.reduce((sum, item) => sum + Number(item.debit ?? 0), 0);
    const totalCredit = allEntries.reduce((sum, item) => sum + Number(item.credit ?? 0), 0);

    return {
      summary: {
        movementCount: allEntries.length,
        totalDebit,
        totalCredit,
        net: totalDebit - totalCredit,
        recent: entries.map((item) => ({
          id: item.id,
          accountName: (item as any).account?.name ?? null,
          branchName: (item as any).branch?.name ?? null,
          debit: Number(item.debit ?? 0),
          credit: Number(item.credit ?? 0),
          entryDate: item.entryDate,
          description: item.description ?? null,
        })),
      },
    };
  }

  private buildDateRangeFilter(field: string, query: EmployeeListQueryDto) {
    if (!query.dateFrom && !query.dateTo) {
      return undefined;
    }

    return {
      [field]: {
        ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
        ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
      },
    };
  }

  private serializePayment(payment: any) {
    if (!payment) return null;
    return {
      id: payment.id,
      branchId: payment.branchId,
      branchName: payment.branch?.name ?? null,
      accountId: payment.accountId ?? null,
      accountName: payment.account?.name ?? null,
      amount: Number(payment.amount ?? 0),
      paymentDate: payment.paymentDate,
      movementType: payment.movementType ?? "PAYMENT",
      transactionType: payment.transactionType ?? "salary",
      paymentMethod: payment.paymentMethod ?? null,
      documentUrl: payment.documentUrl ?? null,
      createdAt: payment.createdAt ?? null,
      updatedAt: payment.updatedAt ?? null,
      notes: payment.notes ?? null,
    };
  }

  private async getScopedPayment(employeeId: string, paymentId: string, actor: AuthenticatedUser) {
    const payment = await this.prisma.payrollPayment.findFirst({
      where: {
        id: paymentId,
        employeeProfileId: employeeId,
        branchId: { in: actor.branchIds },
        deletedAt: null,
      },
      include: { account: true, branch: true },
    });

    if (!payment) {
      throw new NotFoundException("Personel odeme kaydi bulunamadi.");
    }

    return payment;
  }

  private normalizeEmployeePaymentPayload(dto: Partial<CreateEmployeePaymentDto>, current?: any) {
    const movementType = (dto.movementType ?? current?.movementType ?? "PAYMENT") as "PAYMENT" | "RECEIVABLE";
    const transactionType = String(dto.transactionType ?? current?.transactionType ?? (movementType === "RECEIVABLE" ? "receivable" : "salary")).trim();
    const paymentMethod = dto.paymentMethod ?? current?.paymentMethod ?? null;
    const documentUrl = dto.documentUrl !== undefined ? String(dto.documentUrl || "").trim() || null : current?.documentUrl ?? null;
    const notes = dto.notes !== undefined ? String(dto.notes || "").trim() || null : current?.notes ?? null;
    const accountId = dto.accountId !== undefined ? dto.accountId || null : current?.accountId ?? null;
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : current?.paymentDate ? new Date(current.paymentDate) : new Date();

    if (!["PAYMENT", "RECEIVABLE"].includes(movementType)) {
      throw new BadRequestException("Hareket tipi gecersiz.");
    }
    if (paymentMethod && !["CASH", "CREDIT_CARD", "MEAL_CARD", "GIFT_CARD", "BANK_TRANSFER", "OTHER"].includes(paymentMethod)) {
      throw new BadRequestException("Odeme sekli gecersiz.");
    }
    if (documentUrl && !/^(https?:\/\/|\/)[^\s]+$/i.test(documentUrl)) {
      throw new BadRequestException("Belge alani gecersiz.");
    }
    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException("Odeme tarihi gecersiz.");
    }

    return {
      movementType,
      transactionType,
      paymentMethod,
      documentUrl,
      notes,
      accountId,
      paymentDate,
    };
  }

  private formatEmployeeTransactionType(value?: string | null) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized) return "Genel Hareket";
    const map: Record<string, string> = {
      salary: "Maas",
      receivable: "Alacak",
      advance: "Avans",
      deduction: "Kesinti",
      bonus: "Bonus",
      goal_bonus: "Bonus",
      correction: "Manuel Duzeltme",
      manual_adjustment: "Manuel Duzeltme",
    };
    return map[normalized] ?? normalized.replace(/_/g, " ");
  }

  private formatEmployeeStatusAction(value?: string | null) {
    const normalized = String(value ?? "").trim().toLowerCase();
    const map: Record<string, string> = {
      passive: "Pasif Yapildi",
      owner_assigned: "Sahiplik Atandi",
      owner_removed: "Sahiplik Kaldirildi",
      status_changed: "Durum Guncellendi",
      owner_changed: "Sahiplik Guncellendi",
    };
    return map[normalized] ?? normalized.replace(/_/g, " ");
  }

  private async syncEmployeePaymentLedgerTx(tx: PrismaService | any, payment: any, actor: AuthenticatedUser) {
    await tx.ledgerEntry.deleteMany({
      where: {
        sourceType: "payroll",
        sourceId: payment.id,
      },
    });

    if (!payment.accountId || payment.deletedAt || payment.movementType !== "PAYMENT") {
      return;
    }

    await tx.ledgerEntry.create({
      data: {
        accountId: payment.accountId,
        branchId: payment.branchId,
        sourceType: "payroll",
        sourceId: payment.id,
        debit: 0,
        credit: Number(payment.amount ?? 0),
        entryDate: payment.paymentDate,
        description: payment.transactionType ? `Personel ${String(payment.transactionType)}` : "Personel odemesi",
      },
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: payment.branchId,
      userId: actor.userId,
      module: "employees",
      action: "employee.payment.ledger.sync",
      entityType: "employee_payment",
      entityId: payment.id,
      payload: {
        paymentId: payment.id,
        movementType: payment.movementType,
        transactionType: payment.transactionType,
        amount: Number(payment.amount ?? 0),
      },
    });
  }

  private serializeShift(shift: any, createdBy?: string | null) {
    if (!shift) return null;
    return {
      id: shift.id,
      branchId: shift.branchId,
      branchName: shift.branch?.name ?? null,
      shiftType: shift.shiftType ?? "WORK",
      shiftTypeLabel: this.formatShiftType(shift.shiftType),
      scheduledStartAt: shift.scheduledStartAt,
      scheduledEndAt: shift.scheduledEndAt,
      actualStartAt: shift.actualStartAt ?? null,
      actualEndAt: shift.actualEndAt ?? null,
      totalBreakMinutes: Number(shift.totalBreakMinutes ?? 0),
      lateMinutes: Number(shift.lateMinutes ?? 0),
      overtimeMinutes: Number(shift.overtimeMinutes ?? 0),
      approvalStatus: shift.approvalStatus,
      createdBy,
      createdAt: shift.createdAt ?? null,
      updatedAt: shift.updatedAt ?? null,
      notes: shift.notes ?? null,
      breakCount: Array.isArray(shift.breakRecords) ? shift.breakRecords.length : 0,
    };
  }

  private formatShiftType(value?: string | null) {
    const normalized = String(value ?? "WORK").toUpperCase();
    if (normalized === "LEAVE") return "Izin";
    if (normalized === "OFF_DAY") return "Off Day";
    return "Mesai";
  }

  private async ensureNoShiftOverlap(employeeId: string, branchId: string, scheduledStartAt: Date, scheduledEndAt: Date) {
    const overlapping = await this.prisma.shift.findFirst({
      where: {
        employeeProfileId: employeeId,
        branchId,
        scheduledStartAt: { lt: scheduledEndAt },
        scheduledEndAt: { gt: scheduledStartAt },
      },
      select: { id: true },
    });

    if (overlapping) {
      throw new BadRequestException("Bu zaman araliginda mevcut bir vardiya ile cakisma var.");
    }
  }

  private resolveNameParts(input: { firstName?: string | null; lastName?: string | null; fullName?: string | null }) {
    const rawFullName = String(input.fullName ?? "").trim();
    const firstName = String(input.firstName ?? "").trim() || this.extractFirstName(rawFullName);
    const lastName = String(input.lastName ?? "").trim() || this.extractLastName(rawFullName);
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (!firstName && !fullName) {
      throw new BadRequestException("Personel adi zorunlu.");
    }
    return { firstName: firstName || fullName, lastName: lastName || null, fullName: fullName || rawFullName };
  }

  private extractFirstName(fullName?: string | null) {
    const normalized = String(fullName ?? "").trim();
    if (!normalized) return "";
    return normalized.split(/\s+/)[0] ?? "";
  }

  private extractLastName(fullName?: string | null) {
    const normalized = String(fullName ?? "").trim();
    if (!normalized) return "";
    return normalized.split(/\s+/).slice(1).join(" ");
  }

  private async resolveRoleId(roleId: string, actor: AuthenticatedUser) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        companyId: actor.tenantId,
      },
    });

    if (!role) {
      throw new BadRequestException("Personel rol kaydi bulunamadi.");
    }

    return role.id;
  }

  private async syncUserRolesTx(
    tx: PrismaService | any,
    userId: string,
    branchId: string,
    roleKeys: string[],
    actor: AuthenticatedUser,
  ) {
    await tx.userRole.deleteMany({ where: { userId } });
    if (!roleKeys.length) return;

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

  private last4(value?: string | null) {
    const normalized = String(value ?? "").replace(/\s+/g, "");
    if (!normalized) return null;
    return normalized.slice(-4);
  }

  private diffYears(current: Date, target: Date) {
    let age = current.getFullYear() - target.getFullYear();
    const monthDiff = current.getMonth() - target.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && current.getDate() < target.getDate())) {
      age -= 1;
    }
    return age;
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
        if (code >= 65 && code <= 90) {
          return String(code - 55);
        }
        return char;
      })
      .join("");

    let remainder = 0;
    for (const digit of converted) {
      remainder = Number(`${remainder}${digit}`) % 97;
    }

    return remainder === 1;
  }

  private normalizeEmployeePhoto(value: string | null | undefined) {
    if (value === undefined) return undefined;
    const normalized = String(value ?? "").trim();
    if (!normalized) return null;

    if (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(normalized)) {
      return normalized;
    }

    if (/^(https?:\/\/|\/)[^\s]+$/i.test(normalized)) {
      return normalized;
    }

    throw new BadRequestException("Profil fotografi formati gecersiz.");
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }

  private ensureActorPermission(actor: AuthenticatedUser, permission: string) {
    if (actor.role === "super_admin") return;
    if (!actor.permissions.includes(permission)) {
      throw new ForbiddenException("Bu islem icin yetkin yok.");
    }
  }

  private ensureEmployeeActiveForCriticalAction(employee: { isActive?: boolean | null }, message: string) {
    if (!employee?.isActive) {
      throw new BadRequestException(message);
    }
  }

  private success(message: string, data: unknown) {
    return {
      success: true,
      message,
      data,
    };
  }

  private async writeAudit(
    action: string,
    entityId: string,
    payload: unknown,
    actor: AuthenticatedUser,
    branchId?: string | null,
    oldValues?: unknown,
    newValues?: unknown,
  ) {
    const createdAt = new Date().toISOString();
    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: branchId ?? null,
      userId: actor.userId,
      module: "employees",
      action,
      entityType: "employee",
      entityId,
      payload: this.sanitizeAuditPayload({
        actor_user_id: actor.userId,
        employee_id: entityId,
        action_type: action,
        created_at: createdAt,
        payload,
      }),
      oldValues: this.sanitizeAuditPayload(oldValues),
      newValues: this.sanitizeAuditPayload(newValues),
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? actor.userAgent ?? null,
    });
  }

  private async writeChangedFieldAudit(
    action: string,
    employeeId: string,
    actor: AuthenticatedUser,
    branchId: string | null | undefined,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
    keys: string[],
  ) {
    const diffOld: Record<string, unknown> = {};
    const diffNew: Record<string, unknown> = {};

    for (const key of keys) {
      if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
        diffOld[key] = oldValues[key] ?? null;
        diffNew[key] = newValues[key] ?? null;
      }
    }

    if (!Object.keys(diffOld).length) {
      return;
    }

    await this.writeAudit(action, employeeId, { changedFields: Object.keys(diffOld) }, actor, branchId, diffOld, diffNew);
  }

  private buildEmployeeAccountAuditSnapshot(employee: any, overrides?: Record<string, unknown>) {
    const snapshot = {
      branchId: employee.branchId ?? null,
      firstName: employee.user?.firstName ?? this.extractFirstName(employee.user?.fullName) ?? "",
      lastName: employee.user?.lastName ?? this.extractLastName(employee.user?.fullName) ?? "",
      fullName: employee.user?.fullName ?? "",
      email: employee.user?.email ?? "",
      phone: employee.user?.phone ?? "",
      pinCodeMasked: this.maskSensitive(this.decodeSensitive(employee.pinCodeEnc)),
      restaurantRole: employee.restaurantRole ?? "",
      staffRoleId: employee.staffRoleId ?? null,
      hireDate: this.toAuditDate(employee.hireDate),
      overtimeEnabled: employee.overtimeEnabled ?? false,
      dailyFreeDrinkLimit: employee.dailyFreeDrinkLimit ?? 0,
      totalBreakMinutes: employee.totalBreakMinutes ?? 0,
      assignedRoleKeys: (employee.user?.roles ?? []).map((item: any) => String(item.role?.key ?? "")).filter(Boolean),
    };
    return this.sanitizeAuditPayload({ ...snapshot, ...(overrides ?? {}) }) as Record<string, unknown>;
  }

  private buildEmployeePersonalAuditSnapshot(employee: any, overrides?: Record<string, unknown>) {
    const snapshot = {
      photo: employee.personalProfile?.photo ?? "",
      nationality: employee.personalProfile?.nationality ?? "",
      identityNumberMasked: this.maskSensitive(this.decodeSensitive(employee.personalProfile?.identityNumberEnc)),
      gender: employee.personalProfile?.gender ?? "",
      bloodType: employee.personalProfile?.bloodType ?? "",
      disabilityStatus: employee.personalProfile?.disabilityStatus ?? "",
      educationStatus: employee.personalProfile?.educationStatus ?? "",
      highestEducationLevel: employee.personalProfile?.highestEducationLevel ?? "",
      lastEducationSchool: employee.personalProfile?.lastEducationSchool ?? "",
      maritalStatus: employee.personalProfile?.maritalStatus ?? "",
      childrenCount: employee.personalProfile?.childrenCount ?? null,
      birthDate: this.toAuditDate(employee.personalProfile?.birthDate ?? employee.birthDate),
    };
    return this.sanitizeAuditPayload({ ...snapshot, ...(overrides ?? {}) }) as Record<string, unknown>;
  }

  private buildEmployeeOtherAuditSnapshot(employee: any, overrides?: Record<string, unknown>) {
    const snapshot = {
      address: employee.contactProfile?.address ?? "",
      country: employee.contactProfile?.country ?? "",
      city: employee.contactProfile?.city ?? "",
      district: employee.contactProfile?.district ?? "",
      postalCode: employee.contactProfile?.postalCode ?? "",
      homePhone: employee.contactProfile?.homePhone ?? "",
      salary: employee.financialProfile?.salary ?? employee.salary ?? null,
      salaryPaymentDay: employee.financialProfile?.salaryPaymentDay ?? null,
      bankName: employee.financialProfile?.bankName ?? "",
      accountType: employee.financialProfile?.accountType ?? "",
      accountNumberMasked: this.maskSensitive(this.decodeSensitive(employee.financialProfile?.accountNumberEnc)),
      ibanMasked: this.maskSensitive(this.decodeSensitive(employee.financialProfile?.ibanEnc)),
      contactName: employee.emergencyContact?.contactName ?? "",
      contactPhone: employee.emergencyContact?.contactPhone ?? "",
      relation: employee.emergencyContact?.relation ?? "",
    };
    return this.sanitizeAuditPayload({ ...snapshot, ...(overrides ?? {}) }) as Record<string, unknown>;
  }

  private toAuditDate(value: unknown) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  private sanitizeAuditPayload(payload: unknown) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return payload;
    }

    const normalized = { ...(payload as Record<string, unknown>) };

    if (typeof normalized.password === "string" && normalized.password.trim()) {
      normalized.password = "[REDACTED]";
    }
    if (typeof normalized.pinCode === "string" && normalized.pinCode.trim()) {
      normalized.pinCode = this.maskSensitive(normalized.pinCode);
    }
    if (typeof normalized.identityNumber === "string" && normalized.identityNumber.trim()) {
      normalized.identityNumber = this.maskSensitive(normalized.identityNumber);
    }
    if (typeof normalized.accountNumber === "string" && normalized.accountNumber.trim()) {
      normalized.accountNumber = this.maskSensitive(normalized.accountNumber);
    }
    if (typeof normalized.iban === "string" && normalized.iban.trim()) {
      normalized.iban = this.maskSensitive(normalized.iban);
    }
    if (typeof normalized.photo === "string" && normalized.photo.startsWith("data:image/")) {
      normalized.photo = "[IMAGE_DATA_URL]";
    }

    return normalized;
  }
}
