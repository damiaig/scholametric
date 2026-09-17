import { IsUUID } from "class-validator";

export class GetTimetableSlotsQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  sessionId!: string;
}
