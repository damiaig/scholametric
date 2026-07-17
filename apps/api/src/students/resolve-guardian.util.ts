import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Guardian, Prisma } from "@prisma/client";
import { forSchool } from "../common/tenant/for-school";

export interface GuardianInput {
  guardianId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

/**
 * Two modes per SPEC_V0.2.md §2: link an existing guardian by id (the
 * sibling case), or create a new one. Always called inside the caller's
 * own $transaction so a failure after the guardian is created (e.g. the
 * link insert) rolls back the whole thing — no orphan guardian rows.
 */
export async function resolveOrCreateGuardian(
  tx: Prisma.TransactionClient,
  schoolId: string,
  input: GuardianInput,
): Promise<Guardian> {
  if (input.guardianId) {
    const guardian = await tx.guardian.findFirst({
      where: forSchool(schoolId, { id: input.guardianId, deletedAt: null }),
    });
    if (!guardian) {
      throw new NotFoundException("Guardian not found.");
    }
    return guardian;
  }

  if (!input.firstName || !input.lastName || !input.phone) {
    throw new BadRequestException(
      "Provide guardianId to link an existing guardian, or firstName, lastName, and phone to create a new one.",
    );
  }

  return tx.guardian.create({
    data: {
      schoolId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      address: input.address,
    },
  });
}
