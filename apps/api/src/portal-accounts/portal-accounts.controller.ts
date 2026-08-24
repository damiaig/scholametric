import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Audit } from "../common/decorators/audit.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { PortalAccountsService } from "./portal-accounts.service";
import { ReissueForClassArmDto } from "./reissue-for-class-arm.dto";

// SPEC_V0.6.md §5 step 1: admin/proprietor only, school-scoped throughout
// (TenantContext inside the service — never a param/body school id).
@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("portal-accounts")
export class PortalAccountsController {
  constructor(private readonly portalAccountsService: PortalAccountsService) {}

  // No @Audit(): this creates many rows in one call, not the single
  // entity AuditInterceptor's response.id lookup expects — same reasoning
  // as grades' recompute/publish/unpublish, which are also un-audited bulk
  // actions on existing data.
  @Post("provision")
  @HttpCode(HttpStatus.OK)
  provision() {
    return this.portalAccountsService.provision();
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.portalAccountsService.list(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.portalAccountsService.findOne(id);
  }

  // Response has a top-level id — normal single-entity audit shape. The
  // request has no body, so metadata is empty: no tempPassword ever
  // reaches audit_logs (AuditInterceptor only reads response.id, never
  // the response body, and logs request.body as metadata).
  @Audit("portalAccount", "reissue")
  @Post(":id/reissue")
  @HttpCode(HttpStatus.OK)
  reissue(@Param("id", ParseUUIDPipe) id: string) {
    return this.portalAccountsService.reissue(id);
  }

  // Bulk action creating/touching many rows — no @Audit(), same reasoning
  // as provision() above.
  @Post("class-arms/:classArmId/reissue")
  @HttpCode(HttpStatus.OK)
  reissueForClassArm(@Param("classArmId", ParseUUIDPipe) classArmId: string, @Body() dto: ReissueForClassArmDto) {
    return this.portalAccountsService.reissueForClassArm(classArmId, dto.force ?? false);
  }
}
