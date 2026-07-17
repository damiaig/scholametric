import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

// The `"query"` event type only enables *listening* — it emits nothing
// unless something calls $on('query', ...), so this is a no-op in
// production. Added so e2e tests can prove "not N+1" by counting real
// query events for an endpoint, instead of asserting on it indirectly.
@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, "query">
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ log: [{ emit: "event", level: "query" }] });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
