import { Body, Controller, Param, ParseUUIDPipe, Patch } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { GuardiansService } from "./guardians.service";
import { UpdateGuardianDto } from "./dto/update-guardian.dto";

@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("guardians")
export class GuardiansController {
  constructor(private readonly guardiansService: GuardiansService) {}

  @Audit("guardian", "update")
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateGuardianDto) {
    return this.guardiansService.update(id, dto);
  }
}
