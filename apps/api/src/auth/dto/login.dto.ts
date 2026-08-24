import { IsString, Matches, MinLength } from "class-validator";

// v0.6 step 2 (SPEC_V0.6.md §2.2): staff log in by email, STUDENT/PARENT
// portal accounts by username — one field, resolved against either in
// AuthService.login(). No format validation beyond non-empty: email and
// username are structurally disjoint (email always contains "@", enforced
// at staff creation; a provisioned username never does), so an unknown
// shape simply won't resolve to any user rather than needing to be
// rejected up front.
export class LoginDto {
  @IsString()
  @MinLength(1)
  identifier!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "schoolSlug must be a url-safe slug" })
  schoolSlug!: string;
}
