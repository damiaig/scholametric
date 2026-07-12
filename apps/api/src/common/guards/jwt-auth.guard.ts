import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";
import type { AccessTokenPayload } from "../../auth/types/jwt-payload.type";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Global guard (CLAUDE.md §5): every route 401s unless verified access token
 * is presented, except routes marked @Public(). Access tokens are stateless —
 * no DB round trip here; a disabled/deleted user is caught within the 15m
 * access-token lifetime the next time they try to refresh.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException("Unauthorized");
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      request.user = { userId: payload.sub, schoolId: payload.schoolId, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException("Unauthorized");
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return undefined;
    }
    return header.slice("Bearer ".length).trim() || undefined;
  }
}
