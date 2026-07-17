import { IsString, MinLength } from "class-validator";

export class ActivateSessionDto {
  @IsString()
  @MinLength(1)
  confirmName!: string;
}
