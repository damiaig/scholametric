import { Global, Module } from "@nestjs/common";
import { TenantContext } from "./tenant-context";

/** First real consumers land in step 4 (sessions/terms/class-levels/class-arms services). */
@Global()
@Module({
  providers: [TenantContext],
  exports: [TenantContext],
})
export class TenantModule {}
