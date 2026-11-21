import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  [extra: string]: unknown;
}

type LockContentionBody = Pick<ErrorBody, "statusCode" | "message" | "error"> & { retryable: true };

// v0.9 Step 2b (docs/DECISIONS.md) — advisory-lock contention never
// surfaces as an HttpException, so it has to be detected and mapped here,
// before the HttpException-only logic below. Two genuinely different
// causes get two different, both-retryable responses:
//  - A real Postgres lock_timeout firing (SQLSTATE 55P03) means another
//    request is holding the SAME lock right now -> 409, "another save in
//    progress." This shows up as TWO different Prisma error shapes
//    depending on whether the blocked statement was a raw query
//    (PrismaClientKnownRequestError, code P2010, meta.code "55P03") or an
//    ordinary model call like tx.student.update() (confirmed empirically:
//    PrismaClientUnknownRequestError, no .code/.meta at all — "55P03" is
//    only in the raw .message text) — both are checked.
//  - Diagnostic #1 (docs/DECISIONS.md, 2026-11-20) proved Prisma's own
//    `timeout`/`maxWait` never interrupt a connection blocked on the lock
//    — they only notice, after the fact, that the deadline passed once
//    the blocking call returns. Both surface as PrismaClientKnownRequestError
//    code P2028 ("Transaction API error"), but with different meanings:
//    "Unable to start a transaction in the given time" is maxWait
//    exhaustion — the POOL was saturated, not one specific lock -> 503,
//    "server busy." "...cannot be executed on an expired transaction..."
//    is the timeout-while-blocked-on-the-lock case diagnostic #1 proved —
//    the SAME real-world meaning as 55P03 -> the SAME 409 wording.
// P2028 also covers several OTHER, unrelated transaction-lifecycle errors
// (a stale/reused transaction id, reuse after commit/rollback, an
// internal consistency error, an invalid isolationLevel) — those are code
// bugs, not contention, and are deliberately left unmapped here, falling
// through to the generic 500 below rather than getting a misleading
// "try again" message.
function mapLockContentionError(exception: unknown): LockContentionBody | null {
  const isPostgresLockTimeout =
    (exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === "P2010" &&
      (exception.meta as { code?: string } | undefined)?.code === "55P03") ||
    (exception instanceof Prisma.PrismaClientUnknownRequestError &&
      /55P03|canceling statement due to lock timeout/.test(exception.message));
  if (isPostgresLockTimeout) {
    return {
      statusCode: HttpStatus.CONFLICT,
      message: "Another save for this record is already in progress. Please try again in a moment.",
      error: "Conflict",
      retryable: true,
    };
  }

  // P2024: the pool itself (not a specific transaction's maxWait) couldn't
  // hand out a connection within `pool_timeout` (default 10s) — found
  // empirically via AuditInterceptor's own plain (non-transactional)
  // `prisma.auditLog.create()` call, which competes for the same pool
  // after a wrapped transaction completes. Same real-world meaning as
  // P2028's maxWait case — the pool is saturated, not one lock -> 503.
  if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === "P2024") {
    return {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message: "The server is busy right now. Please try again in a moment.",
      error: "Service Unavailable",
      retryable: true,
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === "P2028") {
    if (exception.message.includes("Unable to start a transaction in the given time")) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: "The server is busy right now. Please try again in a moment.",
        error: "Service Unavailable",
        retryable: true,
      };
    }
    if (exception.message.includes("cannot be executed on an expired transaction")) {
      return {
        statusCode: HttpStatus.CONFLICT,
        message: "Another save for this record is already in progress. Please try again in a moment.",
        error: "Conflict",
        retryable: true,
      };
    }
  }

  return null;
}

/** CLAUDE.md §5: every error response uses one envelope; never leak stack traces or SQL. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const lockContention = mapLockContentionError(exception);
    if (lockContention) {
      response.status(lockContention.statusCode).json({
        ...lockContention,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body: ErrorBody = {
      statusCode: status,
      message: this.resolveMessage(exception, status),
      error: this.resolveError(exception, status),
      path: request.url,
      timestamp: new Date().toISOString(),
      // Lets a specific throw site attach structured data beyond the
      // envelope (e.g. grades' 409 lockedStudentIds) by passing an object
      // to an HttpException subclass — statusCode/message/error stay
      // filter-controlled either way, so a thrower can't override them.
      ...this.resolveExtra(exception),
    };

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json(body);
  }

  private resolveMessage(exception: unknown, status: number): string | string[] {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === "string") {
        return payload;
      }
      const message = (payload as { message?: string | string[] }).message;
      return message ?? exception.message;
    }
    return status === HttpStatus.INTERNAL_SERVER_ERROR ? "Internal server error" : "Unexpected error";
  }

  private resolveError(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === "object" && payload && "error" in payload) {
        return String((payload as { error?: string }).error);
      }
    }
    return HttpStatus[status] ?? "Error";
  }

  private resolveExtra(exception: unknown): Record<string, unknown> {
    if (!(exception instanceof HttpException)) {
      return {};
    }
    const payload = exception.getResponse();
    if (typeof payload !== "object" || payload === null) {
      return {};
    }
    const envelopeKeys = new Set(["statusCode", "message", "error"]);
    return Object.fromEntries(Object.entries(payload).filter(([key]) => !envelopeKeys.has(key)));
  }
}
