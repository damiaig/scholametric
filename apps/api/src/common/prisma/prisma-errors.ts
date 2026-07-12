import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Translates a Prisma unique-constraint violation into a 409 with a readable message; rethrows anything else. */
export function throwIfUniqueConstraint(error: unknown, message: string): never {
  if (isUniqueConstraintError(error)) {
    throw new ConflictException(message);
  }
  throw error;
}
