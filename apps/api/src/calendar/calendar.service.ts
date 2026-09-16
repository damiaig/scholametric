import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Break, ClassArm, Holiday, Period } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { CreatePeriodDto } from "./dto/create-period.dto";
import { UpdatePeriodDto } from "./dto/update-period.dto";
import { CreateBreakDto } from "./dto/create-break.dto";
import { UpdateBreakDto } from "./dto/update-break.dto";
import { CreateHolidayDto } from "./dto/create-holiday.dto";
import { UpdateHolidayDto } from "./dto/update-holiday.dto";
import { GetHolidaysQueryDto } from "./dto/get-holidays-query.dto";
import { SetClassSchoolDaysDto } from "./dto/set-class-school-days.dto";

export interface ClassSchoolDaysRow {
  classArmId: string;
  classArmName: string;
  classLevelName: string;
  includesSaturday: boolean;
}

// A shared time interval shape both Period and Break satisfy — the
// overlap check below treats them as one combined daily timeline
// (SPEC_V0.8.md §7 item 1: a school's day is one shared clock, a class
// can't be in "Period 3" and "Lunch" at the same time).
interface TimeInterval {
  id: string;
  startsAt: string;
  endsAt: string;
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  // ---- Periods ----

  async listPeriods(): Promise<Period[]> {
    return this.prisma.period.findMany({
      where: forSchool(this.tenantContext.schoolId),
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  async createPeriod(dto: CreatePeriodDto): Promise<Period> {
    const schoolId = this.tenantContext.schoolId;
    this.assertTimeOrder(dto.startsAt, dto.endsAt);
    await this.assertNoOverlap(schoolId, dto.startsAt, dto.endsAt);

    try {
      return await this.prisma.period.create({
        data: forSchool(schoolId, {
          name: dto.name,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          sortOrder: dto.sortOrder,
        }),
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "A period with this name already exists.");
    }
  }

  async updatePeriod(id: string, dto: UpdatePeriodDto): Promise<Period> {
    const schoolId = this.tenantContext.schoolId;
    const existing = await this.findPeriodOrThrow(schoolId, id);

    const startsAt = dto.startsAt ?? existing.startsAt;
    const endsAt = dto.endsAt ?? existing.endsAt;
    this.assertTimeOrder(startsAt, endsAt);
    await this.assertNoOverlap(schoolId, startsAt, endsAt, id);

    try {
      return await this.prisma.period.update({
        where: { id },
        data: {
          name: dto.name,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          sortOrder: dto.sortOrder,
        },
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "A period with this name already exists.");
    }
  }

  async deletePeriod(id: string): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    await this.findPeriodOrThrow(schoolId, id);
    await this.prisma.period.delete({ where: { id } });
    return { id };
  }

  // ---- Breaks ----

  async listBreaks(): Promise<Break[]> {
    return this.prisma.break.findMany({
      where: forSchool(this.tenantContext.schoolId),
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
  }

  async createBreak(dto: CreateBreakDto): Promise<Break> {
    const schoolId = this.tenantContext.schoolId;
    this.assertTimeOrder(dto.startsAt, dto.endsAt);
    await this.assertNoOverlap(schoolId, dto.startsAt, dto.endsAt);

    try {
      return await this.prisma.break.create({
        data: forSchool(schoolId, {
          name: dto.name,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
        }),
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "A break with this name already exists.");
    }
  }

  async updateBreak(id: string, dto: UpdateBreakDto): Promise<Break> {
    const schoolId = this.tenantContext.schoolId;
    const existing = await this.findBreakOrThrow(schoolId, id);

    const startsAt = dto.startsAt ?? existing.startsAt;
    const endsAt = dto.endsAt ?? existing.endsAt;
    this.assertTimeOrder(startsAt, endsAt);
    await this.assertNoOverlap(schoolId, startsAt, endsAt, id);

    try {
      return await this.prisma.break.update({
        where: { id },
        data: {
          name: dto.name,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
        },
      });
    } catch (error) {
      throwIfUniqueConstraint(error, "A break with this name already exists.");
    }
  }

  async deleteBreak(id: string): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    await this.findBreakOrThrow(schoolId, id);
    await this.prisma.break.delete({ where: { id } });
    return { id };
  }

  // ---- Holidays ----

  async listHolidays(query: GetHolidaysQueryDto): Promise<Holiday[]> {
    return this.prisma.holiday.findMany({
      where: forSchool(this.tenantContext.schoolId, { sessionId: query.sessionId }),
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
  }

  async createHoliday(dto: CreateHolidayDto): Promise<Holiday> {
    const schoolId = this.tenantContext.schoolId;
    this.assertDateOrder(dto.startDate, dto.endDate);

    await this.assertSessionInTenant(schoolId, dto.sessionId);
    if (dto.termId) {
      await this.assertTermInTenant(schoolId, dto.termId);
    }

    return this.prisma.holiday.create({
      data: forSchool(schoolId, {
        sessionId: dto.sessionId,
        termId: dto.termId ?? null,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      }),
    });
  }

  async updateHoliday(id: string, dto: UpdateHolidayDto): Promise<Holiday> {
    const schoolId = this.tenantContext.schoolId;
    const existing = await this.findHolidayOrThrow(schoolId, id);

    const startDateInput = dto.startDate ?? existing.startDate.toISOString().slice(0, 10);
    const endDateInput = dto.endDate ?? existing.endDate.toISOString().slice(0, 10);
    this.assertDateOrder(startDateInput, endDateInput);

    if (dto.termId) {
      await this.assertTermInTenant(schoolId, dto.termId);
    }

    return this.prisma.holiday.update({
      where: { id },
      data: {
        termId: dto.termId,
        name: dto.name,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async deleteHoliday(id: string): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    await this.findHolidayOrThrow(schoolId, id);
    await this.prisma.holiday.delete({ where: { id } });
    return { id };
  }

  // ---- Class school-days ----

  // Every class arm in the school, joined with its school-days config —
  // missing rows default to includesSaturday: false (Mon-Fri, the
  // implicit default). One call for the settings table, not a per-arm
  // lookup.
  async listClassSchoolDays(): Promise<ClassSchoolDaysRow[]> {
    const schoolId = this.tenantContext.schoolId;
    const arms = await this.prisma.classArm.findMany({
      where: forSchool(schoolId),
      include: { classLevel: true, classSchoolDays: true },
      orderBy: [{ classLevel: { rank: "asc" } }, { name: "asc" }],
    });

    return arms.map((arm: ClassArm & { classLevel: { name: string }; classSchoolDays: { includesSaturday: boolean } | null }) => ({
      classArmId: arm.id,
      classArmName: arm.name,
      classLevelName: arm.classLevel.name,
      includesSaturday: arm.classSchoolDays?.includesSaturday ?? false,
    }));
  }

  async setClassSchoolDays(classArmId: string, dto: SetClassSchoolDaysDto): Promise<ClassSchoolDaysRow> {
    const schoolId = this.tenantContext.schoolId;
    const arm = await this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: classArmId }), include: { classLevel: true } });
    if (!arm) {
      throw new NotFoundException("Class not found.");
    }

    await this.prisma.classSchoolDays.upsert({
      where: { classArmId },
      create: { schoolId, classArmId, includesSaturday: dto.includesSaturday },
      update: { includesSaturday: dto.includesSaturday },
    });

    return { classArmId: arm.id, classArmName: arm.name, classLevelName: arm.classLevel.name, includesSaturday: dto.includesSaturday };
  }

  // ---- Shared validation ----

  private assertTimeOrder(startsAt: string, endsAt: string): void {
    if (startsAt >= endsAt) {
      throw new BadRequestException("Start time must be before end time.");
    }
  }

  private assertDateOrder(startDate: string, endDate: string): void {
    if (startDate > endDate) {
      throw new BadRequestException("Start date must be on or before the end date.");
    }
  }

  // Periods and breaks share one daily timeline — a school can't have a
  // class "in Period 3" and "at Lunch" at the same clock time. Checks the
  // candidate interval against every OTHER period + break for the school
  // (excludeId lets an update skip comparing a row against itself).
  private async assertNoOverlap(schoolId: string, startsAt: string, endsAt: string, excludeId?: string): Promise<void> {
    const [periods, breaks] = await Promise.all([
      this.prisma.period.findMany({ where: forSchool(schoolId), select: { id: true, name: true, startsAt: true, endsAt: true } }),
      this.prisma.break.findMany({ where: forSchool(schoolId), select: { id: true, name: true, startsAt: true, endsAt: true } }),
    ]);

    const others = [...periods, ...breaks].filter((row) => row.id !== excludeId);
    const overlapping = others.find((row: TimeInterval) => row.startsAt < endsAt && startsAt < row.endsAt);
    if (overlapping) {
      const label = "name" in overlapping ? (overlapping as { name: string }).name : "another slot";
      throw new BadRequestException(`This overlaps "${label}" (${overlapping.startsAt}-${overlapping.endsAt}).`);
    }
  }

  private async assertSessionInTenant(schoolId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { id: sessionId }) });
    if (!session) {
      throw new NotFoundException("Session not found.");
    }
  }

  private async assertTermInTenant(schoolId: string, termId: string): Promise<void> {
    const term = await this.prisma.term.findFirst({ where: forSchool(schoolId, { id: termId }) });
    if (!term) {
      throw new NotFoundException("Term not found.");
    }
  }

  private async findPeriodOrThrow(schoolId: string, id: string): Promise<Period> {
    const period = await this.prisma.period.findFirst({ where: forSchool(schoolId, { id }) });
    if (!period) {
      throw new NotFoundException("Period not found.");
    }
    return period;
  }

  private async findBreakOrThrow(schoolId: string, id: string): Promise<Break> {
    const brk = await this.prisma.break.findFirst({ where: forSchool(schoolId, { id }) });
    if (!brk) {
      throw new NotFoundException("Break not found.");
    }
    return brk;
  }

  private async findHolidayOrThrow(schoolId: string, id: string): Promise<Holiday> {
    const holiday = await this.prisma.holiday.findFirst({ where: forSchool(schoolId, { id }) });
    if (!holiday) {
      throw new NotFoundException("Holiday not found.");
    }
    return holiday;
  }
}
