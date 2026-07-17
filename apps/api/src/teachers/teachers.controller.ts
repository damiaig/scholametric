import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { TeachersService } from "./teachers.service";
import { ListTeachersQueryDto } from "./dto/list-teachers-query.dto";

// Read-shaped view over personnel + assignments (SPEC_V0.2.md §2) — unlike
// /personnel, TEACHER can read this (their own profile/assignments live here).
@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
@Controller("teachers")
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get()
  findAll(@Query() query: ListTeachersQueryDto) {
    return this.teachersService.findAll(query);
  }

  @Get(":userId")
  findOne(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.teachersService.findOne(userId);
  }
}
