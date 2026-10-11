import { IsUUID } from "class-validator";

export class GetTeachingWeekdaysQueryDto {
  @IsUUID()
  classArmId!: string;

  @IsUUID()
  subjectId!: string;
}
