import { IsUUID } from "class-validator";

export class GetStudentResultsQueryDto {
  @IsUUID()
  termId!: string;

  @IsUUID()
  sessionId!: string;
}
