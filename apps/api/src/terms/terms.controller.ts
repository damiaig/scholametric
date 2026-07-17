import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { TermsService } from "./terms.service";
import { CreateTermDto } from "./dto/create-term.dto";
import { ListTermsQueryDto } from "./dto/list-terms-query.dto";

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
}
