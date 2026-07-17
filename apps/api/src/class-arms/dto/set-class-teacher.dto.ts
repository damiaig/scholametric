import { IsUUID } from "class-validator";

export class SetClassTeacherDto {
  @IsUUID()
  teacherUserId!: string;
}
