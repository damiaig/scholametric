import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { HealthResponse } from "@scholametric/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async check(): Promise<HealthResponse> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    return {
      status: db && redis ? "ok" : "error",
      db,
      redis,
    };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn(`Postgres health check failed: ${(error as Error).message}`);
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    const client = new Redis(this.configService.get<string>("REDIS_URL") as string, {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    try {
      await client.connect();
      const pong = await client.ping();
      return pong === "PONG";
    } catch (error) {
      this.logger.warn(`Redis health check failed: ${(error as Error).message}`);
      return false;
    } finally {
      client.disconnect();
    }
  }
}
