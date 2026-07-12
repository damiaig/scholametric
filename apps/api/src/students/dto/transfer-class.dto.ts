import { IsUUID } from "class-validator";

export class TransferClassDto {
  @IsUUID()
  classArmId!: string;
}
