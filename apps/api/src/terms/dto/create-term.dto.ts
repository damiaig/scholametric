import { IsDateString, IsEnum, IsUUID } from "class-validator";
import { TermName } from "@prisma/client";

export class CreateTermDto {
  @IsUUID()
  sessionId!: string;

  @IsEnum(TermName)
  name!: TermName;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;
}
