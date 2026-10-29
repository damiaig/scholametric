import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { AllowWhilePasswordChangeRequired } from "../common/decorators/allow-while-password-change-required.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { CsrfHeaderGuard } from "../common/guards/csrf-header.guard";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from "./auth.constants";
import { extractRefreshCookie } from "./refresh-cookie.util";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // v0.8.5 step 1 (SPEC_V0.8.5.md §2) — sets the refresh cookie as a side
  // effect; the JSON body carries only the access token + user now. Never
  // CSRF-guarded (see CsrfHeaderGuard's own doc comment) — login needs the
  // actual password, which a forged cross-site request can't supply.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...body } = await this.authService.login(dto);
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  // Reads the refresh token from the cookie, never the body — a missing
  // or unparseable cookie 401s before the service/DB is ever touched (no
  // point looking up a value that was never there).
  @Public()
  @UseGuards(CsrfHeaderGuard)
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = extractRefreshCookie(req.headers.cookie);
    if (!refreshToken) {
      throw new UnauthorizedException("Unauthorized");
    }
    const { refreshToken: newRefreshToken, ...body } = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(res, newRefreshToken);
    return body;
  }

  // v0.8.5 step 1 — a rework of the existing endpoint (it already existed;
  // only the token SOURCE moves from body to cookie), not a new one.
  // Idempotent: clears the cookie unconditionally, and revokes only if a
  // token was actually present — logging out twice, or with an
  // already-expired/absent cookie, is a harmless no-op, never a 401.
  // Still requires a valid access token (JwtAuthGuard, unchanged) to know
  // WHICH user's chain to revoke — the cookie alone doesn't carry userId.
  @AllowWhilePasswordChangeRequired()
  @UseGuards(CsrfHeaderGuard)
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = extractRefreshCookie(req.headers.cookie);
    if (refreshToken) {
      await this.authService.logout(user.userId, refreshToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @AllowWhilePasswordChangeRequired()
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
  }

  // Reissues a token pair (clears the stale mustChangePassword claim) —
  // same cookie treatment as login/refresh: the fresh refresh token goes
  // into the cookie, never the body.
  @AllowWhilePasswordChangeRequired()
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...body } = await this.authService.changePassword(user.userId, dto);
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.configService.get<string>("NODE_ENV") === "production",
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  }
}
