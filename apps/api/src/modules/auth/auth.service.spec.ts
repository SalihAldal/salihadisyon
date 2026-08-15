import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  it("pasif personel bagli kullanicinin login olmasini engeller", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "ali@example.com",
          isActive: true,
          companyId: "tenant-1",
          defaultBranchId: "branch-1",
          passwordHash: "hashed-password",
          fullName: "Ali Yilmaz",
          company: {
            branches: [{ id: "branch-1" }],
          },
          roles: [
            {
              branchId: "branch-1",
              role: {
                key: "hr",
                permissions: [],
              },
            },
          ],
        }),
      },
      employeeProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: "emp-1" }),
      },
      refreshTokenSession: {
        create: vi.fn(),
      },
    };

    const jwtService = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn(),
    };

    const auditLogService = {
      create: vi.fn(),
    };
    const securityRateLimitService = {
      check: vi.fn().mockReturnValue({ allowed: true }),
      reset: vi.fn(),
    };

    const service = new AuthService(
      prisma as any,
      jwtService as any,
      auditLogService as any,
      securityRateLimitService as any,
    );
    vi.mock("bcryptjs", async () => {
      const actual = await vi.importActual("bcryptjs");
      return {
        ...actual,
        compare: vi.fn().mockResolvedValue(true),
      };
    });

    await expect(
      service.login({
        email: "ali@example.com",
        password: "secret123",
      } as any),
    ).rejects.toThrow(UnauthorizedException);
  });
});
