import { IsUUID } from "class-validator";

export class GetClassArmResultsQueryDto {
  @IsUUID()
  termId!: string;
}
