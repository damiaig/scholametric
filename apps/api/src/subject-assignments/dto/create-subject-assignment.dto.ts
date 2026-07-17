import { IsUUID } from "class-validator";

export class CreateSubjectAssignmentDto {
  @IsUUID()
  subjectId!: string;

  @IsUUID()
  classArmId!: string;

  @IsUUID()
  teacherUserId!: string;
}
