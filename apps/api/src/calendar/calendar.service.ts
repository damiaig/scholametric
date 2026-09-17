import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole, Weekday, type Break, type ClassArm, type Holiday, type Period, type Subject, type TimetableSlot, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import { throwIfUniqueConstraint } from "../common/prisma/prisma-errors";
import { getAssignedSubjectMap } from "../grades/subject-assignment.util";
import { CreatePeriodDto } from "./dto/create-period.dto";
import { UpdatePeriodDto } from "./dto/update-period.dto";
import { CreateBreakDto } from "./dto/create-break.dto";
import { UpdateBreakDto } from "./dto/update-break.dto";
import { CreateHolidayDto } from "./dto/create-holiday.dto";
import { UpdateHolidayDto } from "./dto/update-holiday.dto";
import { GetHolidaysQueryDto } from "./dto/get-holidays-query.dto";
import { SetClassSchoolDaysDto } from "./dto/set-class-school-days.dto";
import { CreateTimetableSlotDto } from "./dto/create-timetable-slot.dto";
import { UpdateTimetableSlotDto } from "./dto/update-timetable-slot.dto";
import { GetTimetableSlotsQueryDto } from "./dto/get-timetable-slots-query.dto";

export interface ClassSchoolDaysRow {
  classArmId: string;
  classArmName: string;
  classLevelName: string;
  includesSaturday: boolean;
}

export interface TimetableSlotRow {
  id: string;
  classArmId: string;
  sessionId: string;
  dayOfWeek: Weekday;
  periodId: string;
  periodName: string;
  subjectId: string;
  subjectName: string;
  teacherUserId: string;
  teacherName: string;
}

type TimetableSlotWithRelations = TimetableSlot & { period: Period; subject: Subject; teacherUser: User };

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

  // ---- Timetable slots (v0.8 step 2, SPEC_V0.8.md §7 item 2) ----

  private static readonly SLOT_INCLUDE = { period: true, subject: true, teacherUser: true } as const;

  async listTimetableSlots(query: GetTimetableSlotsQueryDto): Promise<TimetableSlotRow[]> {
    const schoolId = this.tenantContext.schoolId;
    await this.assertClassArmInTenant(schoolId, query.classArmId);
    await this.assertSessionInTenant(schoolId, query.sessionId);

    const slots = await this.prisma.timetableSlot.findMany({
      where: forSchool(schoolId, { classArmId: query.classArmId, sessionId: query.sessionId }),
      include: CalendarService.SLOT_INCLUDE,
      orderBy: [{ period: { sortOrder: "asc" } }, { dayOfWeek: "asc" }],
    });
    return slots.map((slot) => this.toTimetableSlotRow(slot));
  }

  async createTimetableSlot(dto: CreateTimetableSlotDto): Promise<TimetableSlotRow> {
    const schoolId = this.tenantContext.schoolId;
    await this.assertClassArmInTenant(schoolId, dto.classArmId);
    await this.assertSessionInTenant(schoolId, dto.sessionId);
    await this.assertPeriodInTenant(schoolId, dto.periodId);
    await this.assertSubjectInTenant(schoolId, dto.subjectId);
    await this.assertTeacherInTenant(schoolId, dto.teacherUserId);

    await this.assertSchoolDayAllowed(dto.classArmId, dto.dayOfWeek);
    await this.assertTeacherTeachesSubject(schoolId, dto.classArmId, dto.sessionId, dto.subjectId, dto.teacherUserId);
    await this.assertNoSlotCollision(schoolId, dto.classArmId, dto.dayOfWeek, dto.periodId, dto.sessionId);
    await this.assertNoTeacherDoubleBooking(schoolId, dto.teacherUserId, dto.dayOfWeek, dto.periodId, dto.sessionId);

    try {
      const slot = await this.prisma.timetableSlot.create({
        data: forSchool(schoolId, {
          classArmId: dto.classArmId,
          sessionId: dto.sessionId,
          dayOfWeek: dto.dayOfWeek,
          periodId: dto.periodId,
          subjectId: dto.subjectId,
          teacherUserId: dto.teacherUserId,
        }),
        include: CalendarService.SLOT_INCLUDE,
      });
      return this.toTimetableSlotRow(slot);
    } catch (error) {
      this.rethrowSchedulingConflict(error);
    }
  }

  // Day/period/classArm/session are immutable (see UpdateTimetableSlotDto's
  // own doc comment) — only re-validates what subjectId/teacherUserId
  // changes can actually affect: the teacher-teaches-subject pairing and
  // teacher double-booking. The school-day check and slot-collision check
  // are skipped: neither classArmId nor dayOfWeek/periodId can change here,
  // so re-running them would just re-confirm what create() already proved.
  async updateTimetableSlot(id: string, dto: UpdateTimetableSlotDto): Promise<TimetableSlotRow> {
    const schoolId = this.tenantContext.schoolId;
    const existing = await this.findTimetableSlotOrThrow(schoolId, id);

    const subjectId = dto.subjectId ?? existing.subjectId;
    const teacherUserId = dto.teacherUserId ?? existing.teacherUserId;

    if (dto.subjectId) {
      await this.assertSubjectInTenant(schoolId, dto.subjectId);
    }
    if (dto.teacherUserId) {
      await this.assertTeacherInTenant(schoolId, dto.teacherUserId);
    }

    await this.assertTeacherTeachesSubject(schoolId, existing.classArmId, existing.sessionId, subjectId, teacherUserId);
    await this.assertNoTeacherDoubleBooking(schoolId, teacherUserId, existing.dayOfWeek, existing.periodId, existing.sessionId, id);

    try {
      const slot = await this.prisma.timetableSlot.update({
        where: { id },
        data: { subjectId: dto.subjectId, teacherUserId: dto.teacherUserId },
        include: CalendarService.SLOT_INCLUDE,
      });
      return this.toTimetableSlotRow(slot);
    } catch (error) {
      this.rethrowSchedulingConflict(error);
    }
  }

  async deleteTimetableSlot(id: string): Promise<{ id: string }> {
    const schoolId = this.tenantContext.schoolId;
    await this.findTimetableSlotOrThrow(schoolId, id);
    await this.prisma.timetableSlot.delete({ where: { id } });
    return { id };
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

  // ---- Timetable slot validation ----

  private async assertClassArmInTenant(schoolId: string, classArmId: string): Promise<void> {
    const classArm = await this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: classArmId }) });
    if (!classArm) {
      throw new NotFoundException("Class not found.");
    }
  }

  private async assertPeriodInTenant(schoolId: string, periodId: string): Promise<void> {
    const period = await this.prisma.period.findFirst({ where: forSchool(schoolId, { id: periodId }) });
    if (!period) {
      throw new NotFoundException("Period not found.");
    }
  }

  private async assertSubjectInTenant(schoolId: string, subjectId: string): Promise<void> {
    const subject = await this.prisma.subject.findFirst({ where: forSchool(schoolId, { id: subjectId, deletedAt: null }) });
    if (!subject) {
      throw new NotFoundException("Subject not found.");
    }
  }

  // Mirrors subject-assignments.service.ts's own assertTeacherInTenant
  // exactly (role: TEACHER, deletedAt: null, a real staffProfile) — the
  // same shape, same error message, so a bad teacherUserId reads
  // identically everywhere it's checked in this codebase.
  private async assertTeacherInTenant(schoolId: string, teacherUserId: string): Promise<void> {
    const teacher = await this.prisma.user.findFirst({
      where: forSchool(schoolId, { id: teacherUserId, role: UserRole.TEACHER, deletedAt: null }),
      include: { staffProfile: true },
    });
    if (!teacher || !teacher.staffProfile) {
      throw new NotFoundException("Teacher not found.");
    }
  }

  // Mon-Fri is always allowed. Saturday requires this class arm's
  // ClassSchoolDays.includesSaturday — proves Step 1 and Step 2 compose
  // (a class can't get a Saturday slot until an admin opts it in via
  // PUT /calendar/class-school-days/:classArmId).
  private async assertSchoolDayAllowed(classArmId: string, dayOfWeek: Weekday): Promise<void> {
    if (dayOfWeek !== Weekday.SATURDAY) {
      return;
    }
    const config = await this.prisma.classSchoolDays.findUnique({ where: { classArmId } });
    if (!config?.includesSaturday) {
      throw new BadRequestException("This class doesn't have school on Saturday.");
    }
  }

  // Reuses getAssignedSubjectMap — the exact same canonical source
  // assertTeacherAssignment (grades/exams score entry) reads from, so this
  // can never drift from "who teaches what for this class" as understood
  // everywhere else in the app. No assignment at all -> 404 (mirrors
  // assertTeacherAssignment's own admin-branch behavior: the subject isn't
  // staffed for this class, a missing-resource condition). An assignment
  // exists but names a different teacher -> 400 (the caller's chosen
  // teacherUserId is simply the wrong input, not a missing resource).
  private async assertTeacherTeachesSubject(
    schoolId: string,
    classArmId: string,
    sessionId: string,
    subjectId: string,
    teacherUserId: string,
  ): Promise<void> {
    const assignedSubjects = await getAssignedSubjectMap(this.prisma, { schoolId, classArmId, sessionId });
    const assignment = assignedSubjects.get(subjectId);
    if (!assignment) {
      throw new NotFoundException("No teacher is assigned to teach this subject for this class.");
    }
    if (assignment.teacherUserId !== teacherUserId) {
      throw new BadRequestException(`This teacher isn't assigned to teach ${assignment.subjectName} for this class.`);
    }
  }

  // One thing happening per class/day/period — pre-checked for a clean
  // message; @@unique([classArmId, dayOfWeek, periodId, sessionId]) is the
  // real guarantee (see rethrowSchedulingConflict for the race window).
  private async assertNoSlotCollision(
    schoolId: string,
    classArmId: string,
    dayOfWeek: Weekday,
    periodId: string,
    sessionId: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.timetableSlot.findFirst({
      where: forSchool(schoolId, { classArmId, dayOfWeek, periodId, sessionId, ...(excludeId ? { id: { not: excludeId } } : {}) }),
      include: { subject: true },
    });
    if (existing) {
      throw new BadRequestException(`This class already has ${existing.subject.name} scheduled at this time.`);
    }
  }

  // No teacher double-booking across ANY class in the school — pre-checked
  // for a clean message; @@unique([teacherUserId, dayOfWeek, periodId,
  // sessionId]) is the real guarantee.
  private async assertNoTeacherDoubleBooking(
    schoolId: string,
    teacherUserId: string,
    dayOfWeek: Weekday,
    periodId: string,
    sessionId: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.timetableSlot.findFirst({
      where: forSchool(schoolId, { teacherUserId, dayOfWeek, periodId, sessionId, ...(excludeId ? { id: { not: excludeId } } : {}) }),
      include: { classArm: { include: { classLevel: true } } },
    });
    if (existing) {
      throw new BadRequestException(`This teacher is already teaching ${existing.classArm.classLevel.name} ${existing.classArm.name} at this time.`);
    }
  }

  // The pre-checks above are the common path; this is the race-window
  // fallback if two concurrent requests both pass their pre-check before
  // either commits. Deliberately mapped to the SAME 400 family as the
  // pre-checks (not throwIfUniqueConstraint's 409) — from the caller's
  // perspective it's the identical "this conflicts with another slot"
  // error, whichever of the two code paths happened to catch it.
  private rethrowSchedulingConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new BadRequestException("This slot conflicts with another timetable entry.");
    }
    throw error;
  }

  private async findTimetableSlotOrThrow(schoolId: string, id: string): Promise<TimetableSlot> {
    const slot = await this.prisma.timetableSlot.findFirst({ where: forSchool(schoolId, { id }) });
    if (!slot) {
      throw new NotFoundException("Timetable slot not found.");
    }
    return slot;
  }

  private toTimetableSlotRow(slot: TimetableSlotWithRelations): TimetableSlotRow {
    return {
      id: slot.id,
      classArmId: slot.classArmId,
      sessionId: slot.sessionId,
      dayOfWeek: slot.dayOfWeek,
      periodId: slot.periodId,
      periodName: slot.period.name,
      subjectId: slot.subjectId,
      subjectName: slot.subject.name,
      teacherUserId: slot.teacherUserId,
      teacherName: `${slot.teacherUser.firstName} ${slot.teacherUser.lastName}`,
    };
  }
}
