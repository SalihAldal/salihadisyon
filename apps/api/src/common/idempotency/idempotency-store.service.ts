import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotencyLookupResult =
  | { kind: "miss" }
  | { kind: "replay"; response: unknown }
  | { kind: "processing" }
  | { kind: "acquired" };

@Injectable()
export class IdempotencyStoreService {
  private readonly memory = new Map<string, { status: "processing" | "completed"; response?: unknown }>();

  constructor(private readonly prisma: PrismaService) {}

  async lookup(scopeKey: string): Promise<IdempotencyLookupResult> {
    const memoryHit = this.memory.get(scopeKey);
    if (memoryHit?.status === "completed" && memoryHit.response !== undefined) {
      return { kind: "replay", response: memoryHit.response };
    }
    if (memoryHit?.status === "processing") {
      return { kind: "processing" };
    }

    const row = await this.prisma.apiIdempotencyRecord.findUnique({
      where: { scopeKey },
    });
    if (!row) {
      return { kind: "miss" };
    }
    if (row.status === "completed" && row.responseJson !== null && row.responseJson !== undefined) {
      this.memory.set(scopeKey, { status: "completed", response: row.responseJson });
      return { kind: "replay", response: row.responseJson };
    }
    if (row.status === "processing") {
      this.memory.set(scopeKey, { status: "processing" });
      return { kind: "processing" };
    }

    return { kind: "miss" };
  }

  async acquire(scopeKey: string, ttlMs = DEFAULT_TTL_MS): Promise<IdempotencyLookupResult> {
    const existing = await this.lookup(scopeKey);
    if (existing.kind === "replay" || existing.kind === "processing") {
      return existing;
    }

    const expiresAt = new Date(Date.now() + ttlMs);
    try {
      await this.prisma.apiIdempotencyRecord.create({
        data: {
          scopeKey,
          status: "processing",
          expiresAt,
        },
      });
      this.memory.set(scopeKey, { status: "processing" });
      return { kind: "acquired" };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.lookup(scopeKey);
      }
      throw error;
    }
  }

  async complete(scopeKey: string, response: unknown, ttlMs = DEFAULT_TTL_MS) {
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.prisma.apiIdempotencyRecord.updateMany({
      where: { scopeKey, status: "processing" },
      data: {
        status: "completed",
        responseJson: response as Prisma.InputJsonValue,
        expiresAt,
      },
    });
    this.memory.set(scopeKey, { status: "completed", response });
  }

  async release(scopeKey: string) {
    this.memory.delete(scopeKey);
    await this.prisma.apiIdempotencyRecord.deleteMany({
      where: { scopeKey, status: "processing" },
    });
  }

  processingConflict() {
    return new ConflictException("Ayni idempotency anahtari ile devam eden bir istek var.");
  }
}
