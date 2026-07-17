import { ArrayUnique, IsArray, IsUUID } from "class-validator";

export class SetSubjectLevelsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  classLevelIds!: string[];
}
