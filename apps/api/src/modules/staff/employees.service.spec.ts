import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { EmployeesService } from "./employees.service";

const actor = {
  tenantId: "tenant-1",
  userId: "actor-1",
  branchIds: ["branch-1"],
  role: "hr",
  permissions: ["staff.view", "staff.manage", "accounting.manage", "attendance.manage"],
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  deviceInfo: "vitest",
};

const unauthorizedActor = {
  ...actor,
  permissions: ["staff.view"],
};

function createEmployee(overrides?: Record<string, unknown>) {
  return {
    id: "emp-1",
    companyId: "tenant-1",
    branchId: "branch-1",
    userId: "user-1",
    employeeCode: "EMP-1",
    pinCodeEnc: Buffer.from("1234", "utf8").toString("base64"),
    restaurantRole: "garson",
    staffRoleId: "role-1",
    hireDate: new Date("2024-01-10T00:00:00.000Z"),
    overtimeEnabled: true,
    dailyFreeDrinkLimit: 2,
    totalBreakMinutes: 30,
    salary: 25000,
    isActive: true,
    isOwner: false,
    user: {
      id: "user-1",
      firstName: "Ali",
      lastName: "Yilmaz",
      fullName: "Ali Yilmaz",
      email: "ali@example.com",
      phone: "+905551112233",
      isActive: true,
      roles: [
        {
          role: {
            key: "staff",
            name: "Staff",
          },
        },
      ],
    },
    staffRole: {
      id: "role-1",
      name: "Kasiyer",
      key: "cashier",
    },
    personalProfile: {
      photo: "",
      nationality: "TR",
      identityNumberEnc: Buffer.from("12345678901", "utf8").toString("base64"),
      gender: "male",
      bloodType: "A+",
      disabilityStatus: "",
      educationStatus: "lise",
      highestEducationLevel: "lise",
      lastEducationSchool: "Anadolu",
      maritalStatus: "single",
      childrenCount: 0,
      birthDate: new Date("1995-05-01T00:00:00.000Z"),
    },
    contactProfile: {
      address: "Adres",
      country: "TR",
      city: "Istanbul",
      district: "Kadikoy",
      postalCode: "34710",
      homePhone: "+902161112233",
    },
    financialProfile: {
      salary: 25000,
      salaryPaymentDay: 5,
      bankName: "Banka",
      accountType: "TRY",
      accountNumberEnc: Buffer.from("12345678", "utf8").toString("base64"),
      ibanEnc: Buffer.from("TR330006100519786457841326", "utf8").toString("base64"),
    },
    emergencyContact: {
      contactName: "Ayse",
      contactPhone: "+905331112233",
      relation: "Anne",
    },
    ...overrides,
  };
}

function createDetailData(overrides?: Record<string, unknown>) {
  return {
    main: {
      id: "emp-1",
      businessId: "tenant-1",
      branchId: "branch-1",
      branchName: "Merkez",
      employeeCode: "EMP-1",
      firstName: "Ali",
      lastName: "Yilmaz",
      fullName: "Ali Yilmaz",
      email: "ali@example.com",
      phone: "+905551112233",
      pinCodeMasked: "**34",
      restaurantRole: "garson",
      staffRoleId: "role-1",
      staffRoleName: "Kasiyer",
      hireDate: "2024-01-10T00:00:00.000Z",
      isActive: true,
      isOwner: false,
      overtimeEnabled: true,
      dailyFreeDrinkLimit: 2,
      totalBreakMinutes: 30,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    },
    personalInfo: {},
    contactInfo: {},
    financialInfo: {},
    emergencyContact: {},
    shiftSummary: {},
    paymentSummary: {},
    accountMovementSummary: {},
    rolePermissions: {
      assignedRoles: [],
      effectivePermissions: [],
    },
    statusLogs: [],
    ...overrides,
  };
}

function createService() {
  const tx = {
    user: {
      update: vi.fn(),
      findMany: vi.fn(),
    },
    employeeProfile: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    employeePersonalProfile: {
      upsert: vi.fn(),
    },
    employeeContactProfile: {
      upsert: vi.fn(),
    },
    employeeFinancialProfile: {
      upsert: vi.fn(),
    },
    employeeEmergencyContact: {
      upsert: vi.fn(),
    },
    employeeStatusLog: {
      create: vi.fn(),
    },
    payrollPayment: {
      create: vi.fn(),
      update: vi.fn(),
    },
    ledgerEntry: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    userRole: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (callback: (innerTx: typeof tx) => unknown) => callback(tx)),
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    payrollPayment: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      findFirst: vi.fn(),
    },
    shift: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    employeeStatusLog: {
      findMany: vi.fn(),
    },
  };

  const auditLogService = {
    create: vi.fn(),
  };

  const service = new EmployeesService(prisma as any, auditLogService as any, {} as any);
  return { service, prisma, tx, auditLogService };
}

describe("EmployeesService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("personel hesap ayarlarinda e-posta ve pin degisikligini audit ile kaydeder", async () => {
    const { service, prisma, tx, auditLogService } = createService();
    const employee = createEmployee();
    const updatedDetail = createDetailData({
      main: {
        ...createDetailData().main,
        email: "yeni@example.com",
        pinCodeMasked: "**78",
      },
    });

    vi.spyOn(service as any, "getScopedEmployee").mockResolvedValue(employee);
    vi.spyOn(service as any, "getDetail").mockResolvedValue({ data: updatedDetail });
    vi.spyOn(service as any, "resolveRoleId").mockResolvedValue("role-1");
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.updateAccountSettings(
      "emp-1",
      {
        firstName: "Ali",
        lastName: "Yilmaz",
        email: "yeni@example.com",
        pinCode: "5678",
        restaurantRole: "garson",
      },
      actor as any,
    );

    expect(result.success).toBe(true);
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.employeeProfile.update).toHaveBeenCalled();
    const actions = auditLogService.create.mock.calls.map(([input]) => input.action);
    expect(actions).toContain("employee.account_settings.update");
    expect(actions).toContain("employee.email.change");
    expect(actions).toContain("employee.pin.change");
  });

  it("personel bilgisinde fotograf ve telefonu tek akista gunceller", async () => {
    const { service, tx } = createService();
    const employee = createEmployee();
    const updatedDetail = createDetailData({
      main: {
        ...createDetailData().main,
        phone: "+905554445566",
      },
      personalInfo: {
        photo: "data:image/png;base64,AAAA",
      },
    });

    vi.spyOn(service as any, "getScopedEmployee").mockResolvedValue(employee);
    vi.spyOn(service as any, "getDetail").mockResolvedValue({ data: updatedDetail });

    const result = await service.updatePersonalInfo(
      "emp-1",
      {
        phone: "+905554445566",
        photo: "data:image/png;base64,AAAA",
        nationality: "TR",
      },
      actor as any,
    );

    expect(result.success).toBe(true);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: "+905554445566",
        }),
      }),
    );
    expect(tx.employeePersonalProfile.upsert).toHaveBeenCalled();
  });

  it("maas ve iban guncellemesinde finansal audit uretir", async () => {
    const { service, auditLogService } = createService();
    const employee = createEmployee();
    vi.spyOn(service as any, "getScopedEmployee").mockResolvedValue(employee);
    vi.spyOn(service as any, "getDetail").mockResolvedValue({ data: createDetailData() });

    const result = await service.updateOtherInfo(
      "emp-1",
      {
        salary: 32000,
        salaryPaymentDay: 10,
        bankName: "Yeni Banka",
        accountType: "TRY",
        iban: "TR330006100519786457841326",
      },
      actor as any,
    );

    expect(result.success).toBe(true);
    const actions = auditLogService.create.mock.calls.map(([input]) => input.action);
    expect(actions).toContain("employee.other_info.update");
    expect(actions).toContain("employee.salary.change");
    expect(actions).toContain("employee.bank_info.change");
  });

  it("odeme ekleme senaryosunda payment kaydini olusturur", async () => {
    const { service, tx } = createService();
    vi.spyOn(service as any, "getScopedEmployee").mockResolvedValue(createEmployee());
    vi.spyOn(service as any, "syncEmployeePaymentLedgerTx").mockResolvedValue(undefined);
    tx.payrollPayment.create.mockResolvedValue({
      id: "pay-1",
      branchId: "branch-1",
      employeeProfileId: "emp-1",
      accountId: "acc-1",
      createdByUserId: "actor-1",
      amount: 500,
      paymentDate: new Date("2026-03-10T00:00:00.000Z"),
      movementType: "PAYMENT",
      transactionType: "salary",
      paymentMethod: "BANK_TRANSFER",
      documentUrl: null,
      notes: "Maas",
      account: { name: "Banka Hesabi" },
      branch: { name: "Merkez" },
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      updatedAt: new Date("2026-03-10T00:00:00.000Z"),
      deletedAt: null,
    });

    const result = await service.createPayment(
      "emp-1",
      {
        amount: 500,
        accountId: "acc-1",
        transactionType: "salary",
        paymentMethod: "BANK_TRANSFER",
      },
      actor as any,
    );

    expect(result.message).toContain("odeme");
    expect(tx.payrollPayment.create).toHaveBeenCalled();
  });

  it("alacak ekleme senaryosunda receivable mesaji doner", async () => {
    const { service, tx } = createService();
    vi.spyOn(service as any, "getScopedEmployee").mockResolvedValue(createEmployee());
    vi.spyOn(service as any, "syncEmployeePaymentLedgerTx").mockResolvedValue(undefined);
    tx.payrollPayment.create.mockResolvedValue({
      id: "pay-2",
      branchId: "branch-1",
      employeeProfileId: "emp-1",
      accountId: null,
      createdByUserId: "actor-1",
      amount: 800,
      paymentDate: new Date("2026-03-10T00:00:00.000Z"),
      movementType: "RECEIVABLE",
      transactionType: "receivable",
      paymentMethod: null,
      documentUrl: null,
      notes: "Avans alacagi",
      account: null,
      branch: { name: "Merkez" },
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      updatedAt: new Date("2026-03-10T00:00:00.000Z"),
      deletedAt: null,
    });

    const result = await service.createPayment(
      "emp-1",
      {
        amount: 800,
        movementType: "RECEIVABLE",
        transactionType: "receivable",
      },
      actor as any,
    );

    expect(result.message).toContain("alacak");
    expect(tx.payrollPayment.create).toHaveBeenCalled();
  });

  it("personeli pasiflestirme kullanici ve personel durumunu birlikte kapatir", async () => {
    const { service, tx, auditLogService } = createService();
    vi.spyOn(service as any, "getScopedEmployee").mockResolvedValue(createEmployee());

    const result = await service.passiveEmployee("emp-1", { note: "Ayrildi" }, actor as any);

    expect(result.data).toMatchObject({ id: "emp-1", isActive: false });
    expect(tx.employeeProfile.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
    expect(auditLogService.create).toHaveBeenCalledWith(expect.objectContaining({ action: "employee.passive" }));
  });

  it("isletme sahibi atama sadece yetkili rolde calisir", async () => {
    const { service } = createService();
    await expect(service.assignOwner("emp-1", { note: "yetkisiz" }, unauthorizedActor as any)).rejects.toThrow(ForbiddenException);
  });

  it("vardiya goruntulemede liste ve summary kartlari dogru hesaplanir", async () => {
    const { service, prisma } = createService();
    vi.spyOn(service as any, "getScopedEmployee").mockResolvedValue(createEmployee());
    prisma.shift.findMany.mockResolvedValue([
      {
        id: "shift-1",
        branchId: "branch-1",
        branch: { name: "Merkez" },
        shiftType: "WORK",
        scheduledStartAt: new Date("2026-03-10T08:00:00.000Z"),
        scheduledEndAt: new Date("2026-03-10T17:00:00.000Z"),
        actualStartAt: null,
        actualEndAt: null,
        totalBreakMinutes: 30,
        lateMinutes: 5,
        overtimeMinutes: 10,
        approvalStatus: "approved",
        createdByUserId: "actor-1",
        createdAt: new Date("2026-03-09T00:00:00.000Z"),
        updatedAt: new Date("2026-03-09T00:00:00.000Z"),
        notes: null,
        breakRecords: [],
      },
    ]);
    prisma.shift.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    prisma.shift.aggregate.mockResolvedValue({
      _sum: { totalBreakMinutes: 30, lateMinutes: 5, overtimeMinutes: 10 },
    });
    prisma.user.findMany.mockResolvedValue([{ id: "actor-1", fullName: "Yonetici" }]);

    const result = await service.getShifts("emp-1", {}, actor as any);

    expect(result.data.items).toHaveLength(1);
    expect(result.data.summary).toMatchObject({
      totalShifts: 1,
      workCount: 1,
      leaveCount: 0,
      offDayCount: 0,
      totalBreakMinutes: 30,
      totalLateMinutes: 5,
      totalOvertimeMinutes: 10,
    });
  });

  it("odeme listesinde summary kartlari PAYMENT ve RECEIVABLE toplamlarina gore hesaplanir", async () => {
    const { service, prisma } = createService();
    vi.spyOn(service as any, "getScopedEmployee").mockResolvedValue(createEmployee());
    prisma.payrollPayment.findMany.mockResolvedValue([
      {
        id: "pay-1",
        branchId: "branch-1",
        amount: 1000,
        paymentDate: new Date("2026-03-10T00:00:00.000Z"),
        movementType: "PAYMENT",
        transactionType: "salary",
        paymentMethod: "CASH",
        accountId: null,
        notes: null,
        documentUrl: null,
        account: null,
        branch: { name: "Merkez" },
        createdAt: new Date("2026-03-10T00:00:00.000Z"),
        updatedAt: new Date("2026-03-10T00:00:00.000Z"),
      },
      {
        id: "pay-2",
        branchId: "branch-1",
        amount: 1500,
        paymentDate: new Date("2026-03-11T00:00:00.000Z"),
        movementType: "RECEIVABLE",
        transactionType: "receivable",
        paymentMethod: null,
        accountId: null,
        notes: null,
        documentUrl: null,
        account: null,
        branch: { name: "Merkez" },
        createdAt: new Date("2026-03-11T00:00:00.000Z"),
        updatedAt: new Date("2026-03-11T00:00:00.000Z"),
      },
    ]);
    prisma.payrollPayment.count.mockResolvedValue(2);
    prisma.payrollPayment.aggregate
      .mockResolvedValueOnce({ _count: { id: 1 }, _sum: { amount: 1000 } })
      .mockResolvedValueOnce({ _count: { id: 1 }, _sum: { amount: 1500 } });

    const result = await service.getPayments("emp-1", {}, actor as any);

    expect(result.data.summary).toMatchObject({
      paymentCount: 1,
      receivableCount: 1,
      totalPaid: 1000,
      totalRequired: 1500,
      remainingAmount: 500,
      totalRecords: 2,
    });
  });

  it("eksik alanlarla kayit denemesinde validation hatasi verir", async () => {
    const { service } = createService();
    vi.spyOn(service as any, "getScopedEmployee").mockResolvedValue(createEmployee());

    await expect(
      service.updateAccountSettings(
        "emp-1",
        {
          firstName: "Ali",
          lastName: "Yilmaz",
          email: "",
        },
        actor as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("yetkisiz kullanici muhasebe islemlerine erisemez", async () => {
    const { service } = createService();
    await expect(service.createPayment("emp-1", { amount: 100 }, unauthorizedActor as any)).rejects.toThrow(ForbiddenException);
  });
});
