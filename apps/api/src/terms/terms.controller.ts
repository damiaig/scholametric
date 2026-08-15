import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { TermsService } from "./terms.service";
import { CreateTermDto } from "./dto/create-term.dto";
import { ListTermsQueryDto } from "./dto/list-terms-query.dto";
import { UnlockTermDto } from "./dto/unlock-term.dto";
import { RelockTermDto } from "./dto/relock-term.dto";

@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("terms")
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Get()
  findAll(@Query() query: ListTermsQueryDto) {
    return this.termsService.findAll(query.sessionId, query.page, query.pageSize);
  }

  @Audit("term", "create")
  @Post()
  create(@Body() dto: CreateTermDto) {
    return this.termsService.create(dto);
  }

  @Audit("term", "activate")
  @Post(":id/activate")
  @HttpCode(HttpStatus.OK)
  activate(@Param("id", ParseUUIDPipe) id: string) {
    return this.termsService.activate(id);
  }

  // SPEC_V0.5.md §2.3, v0.5 step 3 — SCHOOL_ADMIN + PROPRIETOR both, same
  // tier as POST /grades/publish (not owner-only like unpublish).
  @Audit("term", "close")
  @Post(":id/close")
  @HttpCode(HttpStatus.OK)
  close(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.termsService.close(id, user);
  }

  @Audit("termUnlock", "unlock")
  @Post(":id/unlock")
  @HttpCode(HttpStatus.OK)
  unlock(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UnlockTermDto, @CurrentUser() user: AuthenticatedUser) {
    return this.termsService.unlock(id, dto, user);
  }

  @Audit("termUnlock", "relock")
  @Post(":id/relock")
  @HttpCode(HttpStatus.OK)
  relock(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RelockTermDto, @CurrentUser() user: AuthenticatedUser) {
    return this.termsService.relock(id, dto, user);
  }
}
