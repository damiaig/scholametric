import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  TimetableExceptionType,
  UserRole,
  Weekday,
  type Break,
  type ClassArm,
  type Holiday,
  type Period,
  type Subject,
  type TimetableException,
  type TimetableSlot,
  type User,
} from "@prisma/client";
import { isPeriodTimePast } from "@scholametric/shared";
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
import { GetTimetableRangeDto, assertTimetableRangeValid } from "./dto/get-timetable-range.dto";
import { CreateTeacherAbsenceDto } from "./dto/create-teacher-absence.dto";
import { ReplaceTimetableExceptionDto } from "./dto/replace-timetable-exception.dto";

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

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — on-read composition. AnyWeekday
// (unlike the Weekday enum) includes SUNDAY: a resolved calendar day still
// has to report itself AS a Sunday, even though no slot can ever exist on
// one — Weekday's own missing SUNDAY member is what makes a slot on it
// structurally impossible, not this response-only type.
export type AnyWeekday = Weekday | "SUNDAY";

const WEEKDAY_BY_JS_INDEX: AnyWeekday[] = [
  "SUNDAY",
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.SATURDAY,
];

export type TimetableExceptionStatus = "CANCELLED" | "REPLACED";

export interface ResolvedPeriodEntry {
  periodId: string;
  periodName: string;
  startsAt: string;
  endsAt: string;
  subjectId: string | null;
  subjectName: string | null;
  teacherUserId: string | null;
  teacherName: string | null;
  // Populated only in the teacher's cross-class view — a class view's
  // periods are all implicitly the caller's own class already.
  classArmId: string | null;
  className: string | null;
  // v0.8 step 4 (SPEC_V0.8.md §4) — the exception overlay. null status
  // means "no exception, taught as scheduled." subjectId/subjectName/
  // teacherUserId/teacherName above are always the ORIGINAL slot's values,
  // unchanged by cancellation/replacement. note is populated ONLY in
  // resolveTeacherSchedule (the absent teacher's own view) — resolveClass-
  // Schedule (student/parent) never sets it, by construction, not by a
  // field-level redaction step.
  status: TimetableExceptionStatus | null;
  exceptionId: string | null;
  note: string | null;
  replacementTeacherUserId: string | null;
  replacementTeacherName: string | null;
  replacementSubjectId: string | null;
  replacementSubjectName: string | null;
  activityLabel: string | null;
}

export interface ResolvedBreakEntry {
  breakId: string;
  name: string;
  startsAt: string;
  endsAt: string;
}

export interface ResolvedTimetableDay {
  date: string;
  dayOfWeek: AnyWeekday;
  isSchoolDay: boolean;
  nonSchoolReason: "HOLIDAY" | "WEEKEND" | null;
  holidayName: string | null;
  periods: ResolvedPeriodEntry[];
  breaks: ResolvedBreakEntry[];
}

export interface ClassTimetableResponse {
  classArmId: string;
  className: string;
  from: string;
  to: string;
  days: ResolvedTimetableDay[];
}

export interface TeacherTimetableResponse {
  teacherUserId: string;
  from: string;
  to: string;
  days: ResolvedTimetableDay[];
}

export interface TeacherAbsenceRow {
  id: string;
  teacherUserId: string;
  teacherName: string;
  date: string;
  // exceptionId/classArmId/status let the admin's absences list link
  // straight to PATCH /calendar/timetable-exceptions/:id for a given
  // period, without a separate "list exceptions" endpoint — every period
  // here was created 1:1 with a TimetableException at absence-creation
  // time, so this is a join back to that same row, not new state.
  periods: { periodId: string; periodName: string; endsAt: string; classArmId: string; className: string; exceptionId: string; status: TimetableExceptionStatus }[];
  note: string;
  createdAt: string;
}

export interface TimetableExceptionRow {
  id: string;
  classArmId: string;
  className: string;
  date: string;
  periodId: string;
  periodName: string;
  type: TimetableExceptionType;
  teacherUserId: string;
  teacherName: string;
  note: string | null;
  replacementTeacherUserId: string | null;
  replacementTeacherName: string | null;
  replacementSubjectId: string | null;
  replacementSubjectName: string | null;
  activityLabel: string | null;
}

type TimetableExceptionWithRelations = TimetableException & {
  replacementTeacherUser: User | null;
  replacementSubject: Subject | null;
};

// v0.8 step 5 (SPEC_V0.8.md §7 item 5) — a coverage assignment as seen
// from the REPLACEMENT teacher's own side: teacherUser here is always the
// ORIGINAL absent teacher ("original stays original," same invariant the
// class view already uses), classArm is needed for className since the
// caller has no own slot at this period to read it from.
type CoverageExceptionWithRelations = TimetableException & {
  teacherUser: User;
  replacementSubject: Subject | null;
  classArm: ClassArm & { classLevel: { name: string } };
};

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

  // ---- On-read composition (v0.8 step 3, SPEC_V0.8.md §7 item 3) ----

  // One class's full week, resolved for [from, to]. Called ONLY from
  // MeService (STUDENT's own class / PARENT's linked child's class) —
  // classArmId always arrives server-resolved from the caller's own
  // current enrollment, never a request param, so there is no id here for
  // a caller to substitute another class with.
  async resolveClassSchedule(classArmId: string, from: string, to: string): Promise<ClassTimetableResponse> {
    const schoolId = this.tenantContext.schoolId;
    assertTimetableRangeValid(from, to);

    const arm = await this.prisma.classArm.findFirst({ where: forSchool(schoolId, { id: classArmId }), include: { classLevel: true } });
    if (!arm) {
      throw new NotFoundException("Class not found.");
    }
    const session = await this.getCurrentSessionOrThrow(schoolId);

    const [periods, breaks, holidays, schoolDays, slots, exceptions] = await Promise.all([
      this.prisma.period.findMany({ where: forSchool(schoolId), orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      this.prisma.break.findMany({ where: forSchool(schoolId), orderBy: [{ startsAt: "asc" }, { id: "asc" }] }),
      this.prisma.holiday.findMany({ where: forSchool(schoolId, { sessionId: session.id }) }),
      this.prisma.classSchoolDays.findUnique({ where: { classArmId } }),
      this.prisma.timetableSlot.findMany({
        where: forSchool(schoolId, { classArmId, sessionId: session.id }),
        include: { subject: true, teacherUser: true },
      }),
      this.prisma.timetableException.findMany({
        where: forSchool(schoolId, { classArmId, date: this.dateRangeFilter(from, to) }),
        include: { replacementTeacherUser: true, replacementSubject: true },
      }),
    ]);
    const includesSaturday = schoolDays?.includesSaturday ?? false;
    const exceptionByKey = this.buildExceptionOverlay(exceptions);

    const days = this.enumerateDates(from, to).map((date) => {
      const weekday = this.weekdayOf(date);
      const dayStatus = this.isSchoolDayForClass(weekday, includesSaturday, holidays, date);
      if (!dayStatus.isSchoolDay) {
        return this.buildNonSchoolDay(date, weekday, dayStatus.reason!, dayStatus.holidayName);
      }

      const slotsByPeriod = new Map(slots.filter((slot) => slot.dayOfWeek === weekday).map((slot) => [slot.periodId, slot]));
      return {
        date,
        dayOfWeek: weekday,
        isSchoolDay: true,
        nonSchoolReason: null,
        holidayName: null,
        periods: periods.map((period) => {
          const slot = slotsByPeriod.get(period.id);
          const exception = exceptionByKey.get(this.exceptionKey(classArmId, date, period.id));
          return {
            periodId: period.id,
            periodName: period.name,
            startsAt: period.startsAt,
            endsAt: period.endsAt,
            subjectId: slot?.subjectId ?? null,
            subjectName: slot?.subject.name ?? null,
            teacherUserId: slot?.teacherUserId ?? null,
            teacherName: slot ? `${slot.teacherUser.firstName} ${slot.teacherUser.lastName}` : null,
            classArmId: null,
            className: null,
            ...this.exceptionOverlayFields(exception, false),
          };
        }),
        breaks: breaks.map((brk) => ({ breakId: brk.id, name: brk.name, startsAt: brk.startsAt, endsAt: brk.endsAt })),
      };
    });

    return { classArmId: arm.id, className: `${arm.classLevel.name} ${arm.name}`, from, to, days };
  }

  // A teacher's own slots across every class they teach, resolved for
  // [from, to]. teacherUserId always arrives as the JWT subject
  // (@CurrentUser().userId in MeController), never a request param.
  //
  // Saturday is deliberately NOT a whole-day exclusion here, unlike the
  // class view above: a teacher can span classes with DIFFERENT
  // includesSaturday policies (confirmed design — Step 2's own seed has
  // one teacher teaching both a Saturday-enabled and a Mon-Fri-only arm).
  // Each slot is filtered individually by ITS OWN class's Saturday
  // setting; a class that opted out simply has no slot that day (a free
  // period), rather than the caller's whole Saturday disappearing because
  // of one unrelated class's policy.
  async resolveTeacherSchedule(teacherUserId: string, from: string, to: string): Promise<TeacherTimetableResponse> {
    const schoolId = this.tenantContext.schoolId;
    assertTimetableRangeValid(from, to);

    const session = await this.getCurrentSessionOrThrow(schoolId);
    const [periods, breaks, holidays, slots, exceptions, coverageExceptions] = await Promise.all([
      this.prisma.period.findMany({ where: forSchool(schoolId), orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      this.prisma.break.findMany({ where: forSchool(schoolId), orderBy: [{ startsAt: "asc" }, { id: "asc" }] }),
      this.prisma.holiday.findMany({ where: forSchool(schoolId, { sessionId: session.id }) }),
      this.prisma.timetableSlot.findMany({
        where: forSchool(schoolId, { teacherUserId, sessionId: session.id }),
        include: { subject: true, classArm: { include: { classLevel: true, classSchoolDays: true } } },
      }),
      // Only exceptions where THIS teacher is the ORIGINAL absent teacher.
      this.prisma.timetableException.findMany({
        where: forSchool(schoolId, { teacherUserId, date: this.dateRangeFilter(from, to) }),
        include: { replacementTeacherUser: true, replacementSubject: true },
      }),
      // v0.8 step 5 — exceptions where THIS teacher is the ASSIGNED COVER.
      // Scoped by replacementTeacherUserId = the JWT subject, never a
      // request param — same wall shape as every other scoping field on
      // this method. A teacher with none of these gets [] here, and the
      // merge below is a no-op — identical to pre-Step-5 behavior.
      this.prisma.timetableException.findMany({
        where: forSchool(schoolId, { replacementTeacherUserId: teacherUserId, date: this.dateRangeFilter(from, to) }),
        include: { teacherUser: true, replacementSubject: true, classArm: { include: { classLevel: true } } },
      }),
    ]);
    const exceptionByKey = this.buildExceptionOverlay(exceptions);
    const coverageByKey = this.buildCoverageOverlay(coverageExceptions);

    // Resolving the ORIGINAL subject for each covered (classArmId,
    // weekday, periodId) — exceptions don't store subjectId, only the
    // template TimetableSlot does. Only queried when there's actually a
    // coverage assignment to resolve (zero cost in the common case).
    const coverageClassArmIds = [...new Set(coverageExceptions.map((exception) => exception.classArmId))];
    const [coverageOriginalSlots, self] = await Promise.all([
      coverageClassArmIds.length
        ? this.prisma.timetableSlot.findMany({
            where: forSchool(schoolId, { classArmId: { in: coverageClassArmIds }, sessionId: session.id }),
            include: { subject: true },
          })
        : Promise.resolve([]),
      coverageExceptions.length
        ? this.prisma.user.findUniqueOrThrow({ where: { id: teacherUserId }, select: { firstName: true, lastName: true } })
        : Promise.resolve(null),
    ]);
    const originalSlotByKey = new Map(
      coverageOriginalSlots.map((slot) => [`${slot.classArmId}|${slot.dayOfWeek}|${slot.periodId}`, slot]),
    );

    const days = this.enumerateDates(from, to).map((date) => {
      const weekday = this.weekdayOf(date);
      // Day-level check only excludes Sunday/holiday here — unlike the
      // class view, Saturday is never excluded at the whole-day level
      // (includesSaturday: true forces that branch off); the per-slot
      // filter below is what actually applies each slot's OWN class's
      // Saturday policy, since one teacher can span classes that disagree.
      const dayStatus = this.isSchoolDayForClass(weekday, true, holidays, date);
      if (!dayStatus.isSchoolDay) {
        return this.buildNonSchoolDay(date, weekday, dayStatus.reason!, dayStatus.holidayName);
      }

      const daySlots = slots.filter(
        (slot) => slot.dayOfWeek === weekday && (weekday !== Weekday.SATURDAY || slot.classArm.classSchoolDays?.includesSaturday),
      );
      const slotsByPeriod = new Map(daySlots.map((slot) => [slot.periodId, slot]));
      return {
        date,
        dayOfWeek: weekday,
        isSchoolDay: true,
        nonSchoolReason: null,
        holidayName: null,
        periods: periods.map((period) => {
          const slot = slotsByPeriod.get(period.id);
          if (slot) {
            const exception = exceptionByKey.get(this.exceptionKey(slot.classArmId, date, period.id));
            return {
              periodId: period.id,
              periodName: period.name,
              startsAt: period.startsAt,
              endsAt: period.endsAt,
              subjectId: slot.subjectId,
              subjectName: slot.subject.name,
              teacherUserId,
              teacherName: null,
              classArmId: slot.classArmId,
              className: `${slot.classArm.classLevel.name} ${slot.classArm.name}`,
              ...this.exceptionOverlayFields(exception, true),
            };
          }

          // No own slot here — this teacher's OWN template has nothing at
          // this weekday+period, in ANY class (a genuine free period,
          // unless a coverage assignment fills it — see below). Own-slot
          // precedence above is what makes this branch reachable only for
          // periods the caller doesn't normally teach; Step 4's own
          // assertReplacementTeacherAvailable already forbids assigning a
          // cover who has a normal slot at this exact weekday+period, so
          // the two branches can never both apply to the same period.
          const coverage = coverageByKey.get(`${date}|${period.id}`);
          if (coverage) {
            const originalSlot = originalSlotByKey.get(`${coverage.classArmId}|${weekday}|${period.id}`);
            return {
              periodId: period.id,
              periodName: period.name,
              startsAt: period.startsAt,
              endsAt: period.endsAt,
              subjectId: originalSlot?.subjectId ?? null,
              subjectName: originalSlot?.subject.name ?? null,
              teacherUserId: coverage.teacherUserId,
              teacherName: `${coverage.teacherUser.firstName} ${coverage.teacherUser.lastName}`,
              classArmId: coverage.classArmId,
              className: `${coverage.classArm.classLevel.name} ${coverage.classArm.name}`,
              status: "REPLACED" as const,
              exceptionId: coverage.id,
              // Never shown to the covering teacher — this is the absent
              // teacher's private note, not theirs (Step 4's privacy rule
              // extends unchanged to this new consumer).
              note: null,
              replacementTeacherUserId: teacherUserId,
              replacementTeacherName: self ? `${self.firstName} ${self.lastName}` : null,
              replacementSubjectId: coverage.replacementSubjectId,
              replacementSubjectName: coverage.replacementSubject?.name ?? null,
              activityLabel: coverage.activityLabel,
            };
          }

          return {
            periodId: period.id,
            periodName: period.name,
            startsAt: period.startsAt,
            endsAt: period.endsAt,
            subjectId: null,
            subjectName: null,
            teacherUserId: null,
            teacherName: null,
            classArmId: null,
            className: null,
            ...this.exceptionOverlayFields(undefined, true),
          };
        }),
        breaks: breaks.map((brk) => ({ breakId: brk.id, name: brk.name, startsAt: brk.startsAt, endsAt: brk.endsAt })),
      };
    });

    return { teacherUserId, from, to, days };
  }

  // ---- Teacher absence + replacement (v0.8 step 4, SPEC_V0.8.md §4) ----

  // Every period is validated BEFORE any write (all-or-nothing): a bad
  // periodId in a multi-period submission fails the whole request, not
  // just that one period. No classArmId in the DTO — the affected class is
  // resolved per period from the CALLER's own TimetableSlot, so there is
  // no field through which a teacher could name a colleague's class.
  async createTeacherAbsence(teacherUserId: string, dto: CreateTeacherAbsenceDto): Promise<TeacherAbsenceRow> {
    const schoolId = this.tenantContext.schoolId;
    const session = await this.getCurrentSessionOrThrow(schoolId);
    const weekday = this.weekdayOf(dto.date);

    const resolved: { periodId: string; periodName: string; endsAt: string; classArmId: string; className: string }[] = [];
    for (const periodId of dto.periodIds) {
      // Weekday has no SUNDAY member — a Sunday date can never match a
      // real TimetableSlot, so this 404s exactly like a bad periodId would,
      // with no separate "Sunday isn't allowed" check needed.
      const slot =
        weekday === "SUNDAY"
          ? null
          : await this.prisma.timetableSlot.findFirst({
              where: forSchool(schoolId, { teacherUserId, dayOfWeek: weekday, periodId, sessionId: session.id }),
              include: { period: true, classArm: { include: { classLevel: true } } },
            });
      if (!slot) {
        throw new NotFoundException("You don't teach a class at this period on this day.");
      }

      const dayStatus = await this.isSchoolDayForClassOnDate(schoolId, slot.classArmId, dto.date);
      if (!dayStatus) {
        throw new BadRequestException("This isn't a school day for this class.");
      }

      const existingException = await this.prisma.timetableException.findFirst({
        where: forSchool(schoolId, { classArmId: slot.classArmId, date: new Date(`${dto.date}T00:00:00Z`), periodId }),
      });
      if (existingException) {
        throw new ConflictException("This period already has an exception recorded for this date.");
      }

      resolved.push({
        periodId,
        periodName: slot.period.name,
        endsAt: slot.period.endsAt,
        classArmId: slot.classArmId,
        className: `${slot.classArm.classLevel.name} ${slot.classArm.name}`,
      });
    }

    let absence: Prisma.TeacherAbsenceGetPayload<{ include: { teacherUser: true } }>;
    let createdExceptionIds: string[];
    try {
      const [createdAbsence, ...createdExceptions] = await this.prisma.$transaction([
        this.prisma.teacherAbsence.create({
          data: forSchool(schoolId, {
            teacherUserId,
            date: new Date(`${dto.date}T00:00:00Z`),
            periodIds: dto.periodIds,
            note: dto.note,
          }),
          include: { teacherUser: true },
        }),
        ...resolved.map((entry) =>
          this.prisma.timetableException.create({
            data: forSchool(schoolId, {
              classArmId: entry.classArmId,
              date: new Date(`${dto.date}T00:00:00Z`),
              periodId: entry.periodId,
              type: TimetableExceptionType.CANCELLED_TEACHER_ABSENT,
              teacherUserId,
              note: dto.note,
            }),
          }),
        ),
      ]);
      absence = createdAbsence;
      createdExceptionIds = createdExceptions.map((exception) => exception.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This period already has an exception recorded for this date.");
      }
      throw error;
    }

    return {
      id: absence.id,
      teacherUserId: absence.teacherUserId,
      teacherName: `${absence.teacherUser.firstName} ${absence.teacherUser.lastName}`,
      date: dto.date,
      periods: resolved.map((entry, index) => ({
        periodId: entry.periodId,
        periodName: entry.periodName,
        endsAt: entry.endsAt,
        classArmId: entry.classArmId,
        className: entry.className,
        exceptionId: createdExceptionIds[index],
        status: "CANCELLED" as const,
      })),
      note: absence.note,
      createdAt: absence.createdAt.toISOString(),
    };
  }

  // SCHOOL_ADMIN/PROPRIETOR-only admin list — the one place the absence
  // note is ever exposed outside the absent teacher's own view.
  async listTeacherAbsences(query: GetTimetableRangeDto): Promise<TeacherAbsenceRow[]> {
    const schoolId = this.tenantContext.schoolId;
    assertTimetableRangeValid(query.from, query.to);

    const [absences, periods, exceptions] = await Promise.all([
      this.prisma.teacherAbsence.findMany({
        where: forSchool(schoolId, { date: this.dateRangeFilter(query.from, query.to) }),
        include: { teacherUser: true },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.period.findMany({ where: forSchool(schoolId) }),
      // Every absence period was created 1:1 with a TimetableException at
      // absence-creation time — joined back here by (teacherUserId, date,
      // periodId) so the admin list can link straight to PATCH .../
      // timetable-exceptions/:id without a separate "list exceptions"
      // endpoint. teacherUserId on the exception still names the ORIGINAL
      // absent teacher even once REPLACED, so this join survives a
      // replacement too.
      this.prisma.timetableException.findMany({
        where: forSchool(schoolId, { date: this.dateRangeFilter(query.from, query.to) }),
        include: { classArm: { include: { classLevel: true } } },
      }),
    ]);
    const periodNameById = new Map(periods.map((period) => [period.id, period.name]));
    // v0.8.1 step 3 (SPEC_V0.8.1.md §2.8) — endsAt lets the client (and the
    // replace endpoint's own guard) decide whether a period has already
    // passed. No new query — `periods` is already fetched above for
    // periodNameById.
    const periodEndsAtById = new Map(periods.map((period) => [period.id, period.endsAt]));
    const exceptionByKey = new Map(
      exceptions.map((exception) => [`${exception.teacherUserId}|${exception.date.toISOString().slice(0, 10)}|${exception.periodId}`, exception]),
    );

    return absences.map((absence) => {
      const date = absence.date.toISOString().slice(0, 10);
      return {
        id: absence.id,
        teacherUserId: absence.teacherUserId,
        teacherName: `${absence.teacherUser.firstName} ${absence.teacherUser.lastName}`,
        date,
        periods: absence.periodIds.map((periodId) => {
          const exception = exceptionByKey.get(`${absence.teacherUserId}|${date}|${periodId}`);
          return {
            periodId,
            periodName: periodNameById.get(periodId) ?? "Unknown period",
            endsAt: periodEndsAtById.get(periodId) ?? "",
            classArmId: exception?.classArmId ?? "",
            className: exception ? `${exception.classArm.classLevel.name} ${exception.classArm.name}` : "",
            exceptionId: exception?.id ?? "",
            status: exception?.type === TimetableExceptionType.REPLACED ? ("REPLACED" as const) : ("CANCELLED" as const),
          };
        }),
        note: absence.note,
        createdAt: absence.createdAt.toISOString(),
      };
    });
  }

  // Assigning a replacement teacher and/or subject/activity moves the
  // exception from CANCELLED to REPLACED. Sending all three fields as null
  // (or omitting all three that were never set) reverts it back to
  // CANCELLED — there is no DELETE endpoint (SPEC_V0.8.md §4, confirmed).
  async replaceTimetableException(id: string, dto: ReplaceTimetableExceptionDto): Promise<TimetableExceptionRow> {
    const schoolId = this.tenantContext.schoolId;
    const existing = await this.prisma.timetableException.findFirst({ where: forSchool(schoolId, { id }), include: { period: true } });
    if (!existing) {
      throw new NotFoundException("Timetable exception not found.");
    }
    // v0.8.1 step 3 (SPEC_V0.8.1.md §2.8) — can't cover a class that's
    // already happened. Blocks setting, editing, AND reverting a
    // replacement alike (isRevert below is irrelevant here) — once the
    // period is over, nothing about it is modifiable. Defense in depth for
    // the web's own hidden-button rule: a stale page could still POST.
    if (isPeriodTimePast(existing.date.toISOString().slice(0, 10), existing.period.endsAt)) {
      throw new BadRequestException("This period has already passed and can no longer be modified.");
    }

    const replacementTeacherUserId = dto.replacementTeacherUserId !== undefined ? dto.replacementTeacherUserId : existing.replacementTeacherUserId;
    const replacementSubjectId = dto.replacementSubjectId !== undefined ? dto.replacementSubjectId : existing.replacementSubjectId;
    const activityLabel = dto.activityLabel !== undefined ? dto.activityLabel : existing.activityLabel;
    const isRevert = !replacementTeacherUserId && !replacementSubjectId && !activityLabel;

    if (!isRevert) {
      if (replacementTeacherUserId) {
        await this.assertTeacherInTenant(schoolId, replacementTeacherUserId);
        await this.assertReplacementTeacherAvailable(schoolId, replacementTeacherUserId, existing.date, existing.periodId, existing.id);
      }
      if (replacementSubjectId) {
        await this.assertSubjectInTenant(schoolId, replacementSubjectId);
      }
    }

    const updated = await this.prisma.timetableException.update({
      where: { id },
      data: {
        type: isRevert ? TimetableExceptionType.CANCELLED_TEACHER_ABSENT : TimetableExceptionType.REPLACED,
        replacementTeacherUserId: replacementTeacherUserId ?? null,
        replacementSubjectId: replacementSubjectId ?? null,
        activityLabel: activityLabel ?? null,
      },
      include: { classArm: { include: { classLevel: true } }, period: true, teacherUser: true, replacementTeacherUser: true, replacementSubject: true },
    });
    return this.toTimetableExceptionRow(updated);
  }

  // Same rules a resolved schedule would apply to this (classArmId, date)
  // pair — reuses the pure isSchoolDayForClass helper above, just fetching
  // its inputs for one date/class instead of a whole range.
  private async isSchoolDayForClassOnDate(schoolId: string, classArmId: string, date: string): Promise<boolean> {
    const session = await this.getCurrentSessionOrThrow(schoolId);
    const [holidays, schoolDays] = await Promise.all([
      this.prisma.holiday.findMany({ where: forSchool(schoolId, { sessionId: session.id }) }),
      this.prisma.classSchoolDays.findUnique({ where: { classArmId } }),
    ]);
    const weekday = this.weekdayOf(date);
    return this.isSchoolDayForClass(weekday, schoolDays?.includesSaturday ?? false, holidays, date).isSchoolDay;
  }

  // Checks the replacement teacher against BOTH a normal TimetableSlot
  // (their everyday teaching duty at this weekday+period) AND every other
  // TimetableException where they're already covering as a replacement at
  // this exact date+period — a cover teacher can't be double-booked either.
  private async assertReplacementTeacherAvailable(
    schoolId: string,
    replacementTeacherUserId: string,
    date: Date,
    periodId: string,
    excludeExceptionId: string,
  ): Promise<void> {
    const dateStr = date.toISOString().slice(0, 10);
    const weekday = this.weekdayOf(dateStr);
    if (weekday !== "SUNDAY") {
      const session = await this.getCurrentSessionOrThrow(schoolId);
      const conflictingSlot = await this.prisma.timetableSlot.findFirst({
        where: forSchool(schoolId, { teacherUserId: replacementTeacherUserId, dayOfWeek: weekday, periodId, sessionId: session.id }),
        include: { classArm: { include: { classLevel: true } } },
      });
      if (conflictingSlot) {
        throw new BadRequestException(`This teacher already teaches ${conflictingSlot.classArm.classLevel.name} ${conflictingSlot.classArm.name} at this time.`);
      }
    }

    const conflictingException = await this.prisma.timetableException.findFirst({
      where: forSchool(schoolId, { replacementTeacherUserId, date, periodId, id: { not: excludeExceptionId } }),
      include: { classArm: { include: { classLevel: true } } },
    });
    if (conflictingException) {
      throw new BadRequestException(
        `This teacher is already covering ${conflictingException.classArm.classLevel.name} ${conflictingException.classArm.name} at this time.`,
      );
    }
  }

  private toTimetableExceptionRow(
    exception: TimetableException & {
      classArm: ClassArm & { classLevel: { name: string } };
      period: Period;
      teacherUser: User;
      replacementTeacherUser: User | null;
      replacementSubject: Subject | null;
    },
  ): TimetableExceptionRow {
    return {
      id: exception.id,
      classArmId: exception.classArmId,
      className: `${exception.classArm.classLevel.name} ${exception.classArm.name}`,
      date: exception.date.toISOString().slice(0, 10),
      periodId: exception.periodId,
      periodName: exception.period.name,
      type: exception.type,
      teacherUserId: exception.teacherUserId,
      teacherName: `${exception.teacherUser.firstName} ${exception.teacherUser.lastName}`,
      note: exception.note,
      replacementTeacherUserId: exception.replacementTeacherUserId,
      replacementTeacherName: exception.replacementTeacherUser
        ? `${exception.replacementTeacherUser.firstName} ${exception.replacementTeacherUser.lastName}`
        : null,
      replacementSubjectId: exception.replacementSubjectId,
      replacementSubjectName: exception.replacementSubject?.name ?? null,
      activityLabel: exception.activityLabel,
    };
  }

  private buildNonSchoolDay(date: string, dayOfWeek: AnyWeekday, reason: "HOLIDAY" | "WEEKEND", holidayName: string | null): ResolvedTimetableDay {
    return { date, dayOfWeek, isSchoolDay: false, nonSchoolReason: reason, holidayName, periods: [], breaks: [] };
  }

  private enumerateDates(from: string, to: string): string[] {
    const dates: string[] = [];
    for (let cursor = Date.parse(`${from}T00:00:00Z`); cursor <= Date.parse(`${to}T00:00:00Z`); cursor += 86_400_000) {
      dates.push(new Date(cursor).toISOString().slice(0, 10));
    }
    return dates;
  }

  private weekdayOf(date: string): AnyWeekday {
    return WEEKDAY_BY_JS_INDEX[new Date(`${date}T00:00:00Z`).getUTCDay()];
  }

  private findHolidayFor(holidays: Holiday[], date: string): Holiday | undefined {
    return holidays.find((holiday) => holiday.startDate.toISOString().slice(0, 10) <= date && date <= holiday.endDate.toISOString().slice(0, 10));
  }

  // v0.8 step 4 (SPEC_V0.8.md §4) — extracted verbatim from Step 3's
  // resolveClassSchedule (holiday check first, then weekend), and now
  // shared by resolveTeacherSchedule's day-level check too. Pure: holidays
  // and includesSaturday are supplied by the caller (already fetched once
  // per request), so this extraction adds no query-per-date. Also reused
  // by createTeacherAbsence to validate a single (classArmId, date) pair
  // against the same rules a resolved schedule would apply.
  private isSchoolDayForClass(
    weekday: AnyWeekday,
    includesSaturday: boolean,
    holidays: Holiday[],
    date: string,
  ): { isSchoolDay: boolean; reason: "HOLIDAY" | "WEEKEND" | null; holidayName: string | null } {
    const holidayMatch = this.findHolidayFor(holidays, date);
    if (holidayMatch) {
      return { isSchoolDay: false, reason: "HOLIDAY", holidayName: holidayMatch.name };
    }
    if (weekday === "SUNDAY" || (weekday === Weekday.SATURDAY && !includesSaturday)) {
      return { isSchoolDay: false, reason: "WEEKEND", holidayName: null };
    }
    return { isSchoolDay: true, reason: null, holidayName: null };
  }

  private dateRangeFilter(from: string, to: string): Prisma.DateTimeFilter {
    return { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) };
  }

  private exceptionKey(classArmId: string, date: string, periodId: string): string {
    return `${classArmId}|${date}|${periodId}`;
  }

  private buildExceptionOverlay(exceptions: TimetableExceptionWithRelations[]): Map<string, TimetableExceptionWithRelations> {
    return new Map(
      exceptions.map((exception) => [this.exceptionKey(exception.classArmId, exception.date.toISOString().slice(0, 10), exception.periodId), exception]),
    );
  }

  // v0.8 step 5 — keyed by (date, periodId) only, NOT classArmId: this is
  // looked up from the COVERING teacher's own agenda, which doesn't know
  // in advance which class it's covering at a given period the way
  // buildExceptionOverlay's class-view/own-slot callers do.
  private buildCoverageOverlay(exceptions: CoverageExceptionWithRelations[]): Map<string, CoverageExceptionWithRelations> {
    return new Map(exceptions.map((exception) => [`${exception.date.toISOString().slice(0, 10)}|${exception.periodId}`, exception]));
  }

  // includeNote is false for resolveClassSchedule (student/parent — the
  // note is never their business) and true for resolveTeacherSchedule
  // (always the absent teacher's own view of their own slot, per the
  // teacherUserId-scoped query above).
  private exceptionOverlayFields(
    exception: TimetableExceptionWithRelations | undefined,
    includeNote: boolean,
  ): Pick<
    ResolvedPeriodEntry,
    "status" | "exceptionId" | "note" | "replacementTeacherUserId" | "replacementTeacherName" | "replacementSubjectId" | "replacementSubjectName" | "activityLabel"
  > {
    if (!exception) {
      return {
        status: null,
        exceptionId: null,
        note: null,
        replacementTeacherUserId: null,
        replacementTeacherName: null,
        replacementSubjectId: null,
        replacementSubjectName: null,
        activityLabel: null,
      };
    }
    return {
      status: exception.type === TimetableExceptionType.REPLACED ? "REPLACED" : "CANCELLED",
      exceptionId: exception.id,
      note: includeNote ? exception.note : null,
      replacementTeacherUserId: exception.replacementTeacherUserId,
      replacementTeacherName: exception.replacementTeacherUser
        ? `${exception.replacementTeacherUser.firstName} ${exception.replacementTeacherUser.lastName}`
        : null,
      replacementSubjectId: exception.replacementSubjectId,
      replacementSubjectName: exception.replacementSubject?.name ?? null,
      activityLabel: exception.activityLabel,
    };
  }

  // Mirrors subject-assignments.service.ts's own getCurrentSessionOrThrow
  // exactly (same message) — a school with no current session configured
  // has nothing meaningful to resolve a "current" timetable against.
  private async getCurrentSessionOrThrow(schoolId: string) {
    const session = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });
    if (!session) {
      throw new BadRequestException("No current academic session configured for this school.");
    }
    return session;
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
