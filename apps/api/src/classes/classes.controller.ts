import { Controller, Get } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { ClassesService } from "./classes.service";

@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
@Controller("classes")
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.classesService.findAll(user);
  }
}
