import { IsEmail, IsString, Matches, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "schoolSlug must be a url-safe slug" })
  schoolSlug!: string;
}
