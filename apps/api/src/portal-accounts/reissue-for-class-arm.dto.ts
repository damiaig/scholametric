import { IsBoolean, IsOptional } from "class-validator";

// force=true re-arms accounts that already changed their temp password
// (mustChangePassword=false) — a real product action (invalidates a
// family's current login), never the default (portal-accounts.controller.ts).
export class ReissueForClassArmDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
