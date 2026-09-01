import { IsUUID } from "class-validator";

// Powers the per-term "Show exams" button (SPEC_V0.7.md §4) — one
// subject's exams for one term, for one student. Mirrors
// GetStudentResultsQueryDto's termId/sessionId pair, plus subjectId since
// this view is deliberately subject-scoped (the button sits on one
// subject row of the report card, not the whole term).
export class GetStudentSubjectExamsQueryDto {
  @IsUUID()
  subjectId!: string;

  @IsUUID()
  termId!: string;

  @IsUUID()
  sessionId!: string;
}
