import { Module } from "@nestjs/common";
import { PortalAccountsController } from "./portal-accounts.controller";
import { PortalAccountsService } from "./portal-accounts.service";

@Module({
  controllers: [PortalAccountsController],
  providers: [PortalAccountsService],
})
export class PortalAccountsModule {}
