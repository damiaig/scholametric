import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}

/** CLAUDE.md §5: every error response uses one envelope; never leak stack traces or SQL. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body: ErrorBody = {
      statusCode: status,
      message: this.resolveMessage(exception, status),
      error: this.resolveError(exception, status),
      path: request.url,
      timestamp: new Date().toISOString(),
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
}
