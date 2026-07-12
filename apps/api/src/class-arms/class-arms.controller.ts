import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { ClassArmsService } from "./class-arms.service";
import { CreateClassArmDto } from "./dto/create-class-arm.dto";
import { UpdateClassArmDto } from "./dto/update-class-arm.dto";
import { ListClassArmsQueryDto } from "./dto/list-class-arms-query.dto";

@Roles(UserRole.SCHOOL_ADMIN)
@Controller("class-arms")
export class ClassArmsController {
  constructor(private readonly classArmsService: ClassArmsService) {}

  @Get()
  findAll(@Query() query: ListClassArmsQueryDto) {
    return this.classArmsService.findAll(query.classLevelId, query.page, query.pageSize);
  }

  @Post()
  create(@Body() dto: CreateClassArmDto) {
    return this.classArmsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateClassArmDto) {
    return this.classArmsService.update(id, dto);
  }
}
