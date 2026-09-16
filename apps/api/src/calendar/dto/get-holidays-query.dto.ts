import { IsUUID } from "class-validator";

export class GetHolidaysQueryDto {
  @IsUUID()
  sessionId!: string;
}
