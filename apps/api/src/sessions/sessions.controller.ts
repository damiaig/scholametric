import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { PaginationQueryDto } from "../common/pagination/pagination-query.dto";
import { SessionsService } from "./sessions.service";
import { CreateSessionDto } from "./dto/create-session.dto";
import { UpdateSessionDto } from "./dto/update-session.dto";

@Roles(UserRole.SCHOOL_ADMIN)
@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.sessionsService.findAll(query.page, query.pageSize);
  }

  @Post()
  create(@Body() dto: CreateSessionDto) {
    return this.sessionsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSessionDto) {
    return this.sessionsService.update(id, dto);
  }

  @Post(":id/activate")
  @HttpCode(HttpStatus.OK)
  activate(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessionsService.activate(id);
  }
}
