import { IsUUID } from "class-validator";

// No termId — Lesson is session+date scoped, not term-scoped (unlike
// Homework's GetHomeworkQueryDto).
export class GetLessonsQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;
}
