import { Controller, Get } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { ClassesService } from "./classes.service";

@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
@Controller("classes")
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  findAll() {
    return this.classesService.findAll();
  }
}
