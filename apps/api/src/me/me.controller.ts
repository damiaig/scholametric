import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { MeService } from "./me.service";

// No @Roles() here — every authenticated role may ask "what's my own
// teaching load"; the answer is just empty for someone with none.
@Controller("me")
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get("teaching")
  teaching(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.findMyTeaching(user.userId);
  }
}
