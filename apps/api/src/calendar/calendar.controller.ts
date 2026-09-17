import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { CalendarService } from "./calendar.service";
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

// v0.8 step 1 (SPEC_V0.8.md §7 item 1) — the calendar domain's foundation.
// SCHOOL_ADMIN + PROPRIETOR only, no TEACHER path in this step (read views
// for other roles arrive in a later v0.8 step). Genuinely new module tree —
// zero shared files with grades/exams, so the grade engine and publish
// model are untouched by construction, not just by discipline.
@Roles(UserRole.SCHOOL_ADMIN, UserRole.PROPRIETOR)
@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  // ---- Periods ----

  @Get("periods")
  listPeriods() {
    return this.calendarService.listPeriods();
  }

  @Audit("period", "create")
  @Post("periods")
  createPeriod(@Body() dto: CreatePeriodDto) {
    return this.calendarService.createPeriod(dto);
  }

  @Audit("period", "update")
  @Patch("periods/:id")
  updatePeriod(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdatePeriodDto) {
    return this.calendarService.updatePeriod(id, dto);
  }

  @Audit("period", "delete")
  @Delete("periods/:id")
  deletePeriod(@Param("id", ParseUUIDPipe) id: string) {
    return this.calendarService.deletePeriod(id);
  }

  // ---- Breaks ----

  @Get("breaks")
  listBreaks() {
    return this.calendarService.listBreaks();
  }

  @Audit("break", "create")
  @Post("breaks")
  createBreak(@Body() dto: CreateBreakDto) {
    return this.calendarService.createBreak(dto);
  }

  @Audit("break", "update")
  @Patch("breaks/:id")
  updateBreak(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBreakDto) {
    return this.calendarService.updateBreak(id, dto);
  }

  @Audit("break", "delete")
  @Delete("breaks/:id")
  deleteBreak(@Param("id", ParseUUIDPipe) id: string) {
    return this.calendarService.deleteBreak(id);
  }

  // ---- Holidays ----

  @Get("holidays")
  listHolidays(@Query() query: GetHolidaysQueryDto) {
    return this.calendarService.listHolidays(query);
  }

  @Audit("holiday", "create")
  @Post("holidays")
  createHoliday(@Body() dto: CreateHolidayDto) {
    return this.calendarService.createHoliday(dto);
  }

  @Audit("holiday", "update")
  @Patch("holidays/:id")
  updateHoliday(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateHolidayDto) {
    return this.calendarService.updateHoliday(id, dto);
  }

  @Audit("holiday", "delete")
  @Delete("holidays/:id")
  deleteHoliday(@Param("id", ParseUUIDPipe) id: string) {
    return this.calendarService.deleteHoliday(id);
  }

  // ---- Class school-days ----

  @Get("class-school-days")
  listClassSchoolDays() {
    return this.calendarService.listClassSchoolDays();
  }

  @Audit("classSchoolDays", "set")
  @Put("class-school-days/:classArmId")
  setClassSchoolDays(@Param("classArmId", ParseUUIDPipe) classArmId: string, @Body() dto: SetClassSchoolDaysDto) {
    return this.calendarService.setClassSchoolDays(classArmId, dto);
  }

  // ---- Timetable slots (v0.8 step 2) ----

  @Get("timetable-slots")
  listTimetableSlots(@Query() query: GetTimetableSlotsQueryDto) {
    return this.calendarService.listTimetableSlots(query);
  }

  @Audit("timetableSlot", "create")
  @Post("timetable-slots")
  createTimetableSlot(@Body() dto: CreateTimetableSlotDto) {
    return this.calendarService.createTimetableSlot(dto);
  }

  @Audit("timetableSlot", "update")
  @Patch("timetable-slots/:id")
  updateTimetableSlot(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTimetableSlotDto) {
    return this.calendarService.updateTimetableSlot(id, dto);
  }

  @Audit("timetableSlot", "delete")
  @Delete("timetable-slots/:id")
  deleteTimetableSlot(@Param("id", ParseUUIDPipe) id: string) {
    return this.calendarService.deleteTimetableSlot(id);
  }
}
