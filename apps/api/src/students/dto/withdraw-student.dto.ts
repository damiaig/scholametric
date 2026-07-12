import { IsString, MinLength } from "class-validator";

export class WithdrawStudentDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
