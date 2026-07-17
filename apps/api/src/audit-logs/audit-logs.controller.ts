import { Controller, Get, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { AuditLogsService } from "./audit-logs.service";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto";

@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("audit-logs")
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditLogsService.findAll(query);
  }
}
