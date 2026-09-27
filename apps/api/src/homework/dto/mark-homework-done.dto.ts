import { IsBoolean } from "class-validator";

export class MarkHomeworkDoneDto {
  @IsBoolean()
  markedDone!: boolean;
}
