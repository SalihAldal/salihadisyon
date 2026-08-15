import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async layout(actor: AuthenticatedUser, branchId?: string) {
    const resolvedBranchId = branchId ?? actor.branchIds[0];
    if (!resolvedBranchId) {
      throw new BadRequestException("Masa plani icin sube secimi gerekli.");
    }

    this.ensureBranchAccess(actor, resolvedBranchId);

    const [areas, orphanTables] = await Promise.all([
      this.prisma.tableArea.findMany({
        where: { branchId: resolvedBranchId },
        include: {
          tables: {
            orderBy: { name: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.diningTable.findMany({
        where: {
          branchId: resolvedBranchId,
          areaId: null,
        },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      branchId: resolvedBranchId,
      areas: areas.map((area) => ({
        id: area.id,
        name: area.name,
        tables: area.tables.map((table) => ({
          id: table.id,
          code: table.code,
          name: table.name,
          capacity: table.capacity,
          status: table.status,
          colorHex: table.colorHex,
          activeTicketId: table.activeTicketId,
        })),
      })),
      unassignedTables: orphanTables.map((table) => ({
        id: table.id,
        code: table.code,
        name: table.name,
        capacity: table.capacity,
        status: table.status,
        colorHex: table.colorHex,
        activeTicketId: table.activeTicketId,
      })),
    };
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }
}
