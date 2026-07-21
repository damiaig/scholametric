import { Controller, Get } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { GradeBoundariesService } from "./grade-boundaries.service";

// Separate controller from GradeBoundariesController only because it needs
// its own top-level path (/grading-presets, not nested under
// /grade-boundaries) — same module, same service, static data only.
@Roles(UserRole.PROPRIETOR, UserRole.SCHOOL_ADMIN)
@Controller("grading-presets")
export class GradingPresetsController {
  constructor(private readonly gradeBoundariesService: GradeBoundariesService) {}

  @Get()
  findAll() {
    return this.gradeBoundariesService.findPresets();
  }
}
