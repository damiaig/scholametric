import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { PrismaService } from "../src/prisma/prisma.service";
import { randomUUID } from "node:crypto";
import { generateOpaqueToken, hashToken } from "../src/auth/refresh-token.util";
import type { AccessTokenPayload } from "../src/auth/types/jwt-payload.type";

// Matches prisma/seed.ts SEED_PASSWORD — seeded demo credentials, not a real secret.
const SEED_PASSWORD = "Passw0rd!";
const SUNRISE_ADMIN_EMAIL = "admin@sunrise.test";
const SUNRISE_SLUG = "sunrise";
const HILLCREST_SLUG = "hillcrest";

// v0.8.5 step 1 (SPEC_V0.8.5.md §4) — the CSRF header CsrfHeaderGuard
// requires on /auth/refresh and /auth/logout (presence-only check; this
// exact value doesn't matter to the backend).
const CSRF_HEADER = { "X-Requested-With": "XMLHttpRequest" };

// v0.8.5 step 1 (SPEC_V0.8.5.md §2) — the refresh token travels only as an
// httpOnly cookie now, never a body field: these two helpers are this
// file's whole "cookie jar," since no existing e2e file uses supertest's
// request.agent() and introducing one just for auth's own describe blocks
// isn't worth it. findSetCookie reads a Set-Cookie response header;
// asCookieHeader strips it down to the bare "name=value" a later request's
// own Cookie header needs (dropping Path/HttpOnly/Max-Age etc.).
function findSetCookie(response: request.Response, name: string): string | undefined {
  const raw = response.headers["set-cookie"] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((c) => c.startsWith(`${name}=`));
}

function asCookieHeader(setCookieString: string): string {
  return setCookieString.split(";")[0];
}

/** Just the raw cookie VALUE (no "name="), for feeding back into refresh()/the next request. */
function rawCookieValue(setCookieString: string): string {
  return asCookieHeader(setCookieString).split("=")[1];
}

// Low bcrypt cost — test-only fixtures, same convention as
// teacher-visibility.e2e-spec.ts's scratch teacher.
const SCRATCH_BCRYPT_COST = 4;

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminUserId: string;
  let sunriseSchoolId: string;

  // v0.6 step 2: a real STUDENT portal account, for the enumeration-parity
  // and cross-school tests — a real username with a known password.
  let scratchStudentUsername: string;
  let scratchStudentId: string;
  let scratchStudentUserId: string;
  const SCRATCH_STUDENT_PASSWORD = "483920";

  // A second, separate STUDENT account still flagged mustChangePassword —
  // kept independent of the one above so the enumeration tests never
  // observe a password this test later changes.
  let mustChangeStudentUsername: string;
  let mustChangeStudentId: string;
  let mustChangeStudentUserId: string;
  const MUST_CHANGE_TEMP_PASSWORD = "719204";

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await prisma.user.findFirstOrThrow({ where: { email: SUNRISE_ADMIN_EMAIL } });
    adminUserId = admin.id;
    sunriseSchoolId = admin.schoolId;

    async function makeStudentAccount(admissionSuffix: string, username: string, password: string, mustChangePassword: boolean) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseSchoolId,
          admissionNumber: `SUN/2026/E2EAUTH-${admissionSuffix}`,
          firstName: "E2E",
          lastName: "AuthFixture",
          gender: "MALE",
          dateOfBirth: new Date("2014-01-01"),
          guardianName: "x",
          guardianPhone: "+2348000000099",
        },
      });
      const passwordHash = await bcrypt.hash(password, SCRATCH_BCRYPT_COST);
      const user = await prisma.user.create({
        data: {
          schoolId: sunriseSchoolId,
          role: "STUDENT",
          username,
          studentId: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          passwordHash,
          mustChangePassword,
        },
      });
      return { studentId: student.id, userId: user.id };
    }

    scratchStudentUsername = "E2EAUTHSTUDENT1";
    const scratch = await makeStudentAccount("1", scratchStudentUsername, SCRATCH_STUDENT_PASSWORD, false);
    scratchStudentId = scratch.studentId;
    scratchStudentUserId = scratch.userId;

    mustChangeStudentUsername = "E2EAUTHSTUDENT2";
    const mustChange = await makeStudentAccount("2", mustChangeStudentUsername, MUST_CHANGE_TEMP_PASSWORD, true);
    mustChangeStudentId = mustChange.studentId;
    mustChangeStudentUserId = mustChange.userId;
  });

  afterAll(async () => {
    // Keep the local dev DB tidy across repeated test runs. audit_logs
    // (written by the change-password call above) FKs to users, so it
    // must go first.
    const scratchUserIds = [adminUserId, scratchStudentUserId, mustChangeStudentUserId];
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: scratchUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: scratchUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [scratchStudentUserId, mustChangeStudentUserId] } } });
    await prisma.student.deleteMany({ where: { id: { in: [scratchStudentId, mustChangeStudentId] } } });
    await app.close();
  });

  const login = (overrides: Partial<{ identifier: string; password: string; schoolSlug: string }> = {}) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        identifier: SUNRISE_ADMIN_EMAIL,
        password: SEED_PASSWORD,
        schoolSlug: SUNRISE_SLUG,
        ...overrides,
      });

  // v0.8.5 step 1 — both helpers below exist specifically to test
  // refresh/logout WITHOUT spending POST /auth/login's throttle quota
  // (10/min/IP, unchanged this step): a planted refreshToken row and a
  // directly-signed access token exercise the exact same guard/service
  // code a real login would reach, without calling the throttled route.
  //
  // v0.8.5 step 2 — plantRefreshToken now mints a real family (a fresh
  // familyId, sequence 0) exactly like AuthService.issueTokenPair does at
  // login — required now that family_id/family_sequence are non-nullable
  // columns, and also what makes this the right fixture for the new
  // reuse-detection tests below (each is its own independent family,
  // mirroring a real login one generation in).
  async function plantRefreshToken(userId: string, rawValue: string = generateOpaqueToken()): Promise<{ rawValue: string; familyId: string }> {
    const familyId = randomUUID();
    await prisma.refreshToken.create({
      data: { userId, familyId, familySequence: 0, tokenHash: hashToken(rawValue), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    return { rawValue, familyId };
  }

  async function signAccessToken(userId: string, schoolId: string): Promise<string> {
    const jwtService = app.get(JwtService);
    const configService = app.get(ConfigService);
    const payload: AccessTokenPayload = { sub: userId, schoolId, role: "SCHOOL_ADMIN", mustChangePassword: false };
    return jwtService.signAsync(payload, { secret: configService.getOrThrow<string>("JWT_ACCESS_SECRET"), expiresIn: "15m" });
  }

  function refresh(cookieHeader: string) {
    return request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", `refreshToken=${cookieHeader}`).set(CSRF_HEADER);
  }

  describe("POST /auth/login", () => {
    it("logs in with valid credentials — accessToken+user in the body, refreshToken ONLY as an httpOnly cookie", async () => {
      const response = await login();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: expect.any(String),
        user: expect.objectContaining({
          email: SUNRISE_ADMIN_EMAIL,
          role: "SCHOOL_ADMIN",
          school: expect.objectContaining({ slug: SUNRISE_SLUG }),
        }),
      });
      expect(response.body).not.toHaveProperty("refreshToken");

      // v0.8.5 step 1 (SPEC_V0.8.5.md §2/§8 flag 3) — cookie attributes:
      // httpOnly, a Path that actually covers the real mounted refresh
      // route (never sent on every API call), and a Max-Age matching the
      // 7d refresh lifetime. Secure is env-keyed (SPEC_V0.8.5.md §8 flag
      // 1) — off whenever NODE_ENV isn't "production" (Secure cookies
      // won't set over local http at all), on in production;
      // createTestApp() boots under this repo's own .env
      // (NODE_ENV=development), so this confirms the OFF side of that
      // branch here, folded into this same login rather than a separate
      // test (every extra login() call eats into the unchanged-this-step
      // 10/min throttle the rest of this file is already right at the
      // edge of).
      const setCookie = findSetCookie(response, "refreshToken");
      expect(setCookie).toBeDefined();
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).not.toMatch(/Secure/i);
      const maxAgeMatch = setCookie!.match(/Max-Age=(\d+)/i);
      expect(maxAgeMatch).not.toBeNull();
      expect(Number(maxAgeMatch![1])).toBe(7 * 24 * 60 * 60); // 7 days, in seconds

      // v0.8.5 bugfix (docs/DECISIONS.md, 2026-11-11) — Path=/auth was
      // never a prefix of the REAL mounted route (/api/v1/auth/refresh,
      // once the global prefix is applied), so the browser never sent the
      // cookie back on refresh at all; e2e/curl missed this because both
      // forward the cookie by hand instead of letting a real cookie jar
      // decide. This asserts the RFC 6265 §5.1.4 path-match invariant
      // itself — the cookie's Path must be a prefix of the refresh route,
      // AND the next character after that prefix must be "/" (or nothing)
      // — not just a hardcoded literal that could silently drift from the
      // real route again if the global prefix ever changes without this
      // cookie's Path changing to match.
      const pathMatch = setCookie!.match(/Path=([^;]+)/i);
      expect(pathMatch).not.toBeNull();
      const cookiePath = pathMatch![1];
      const refreshRoute = "/api/v1/auth/refresh";
      expect(refreshRoute.startsWith(cookiePath)).toBe(true);
      expect(refreshRoute[cookiePath.length]).toBe("/");
    });

    // v0.6 step 2 (SPEC_V0.6.md §2.2): STUDENT/PARENT log in with the SAME
    // field, a provisioned username instead of email.
    it("logs in a STUDENT portal account by username", async () => {
      const response = await login({ identifier: scratchStudentUsername, password: SCRATCH_STUDENT_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: expect.any(String),
        user: expect.objectContaining({
          email: null,
          role: "STUDENT",
          school: expect.objectContaining({ slug: SUNRISE_SLUG }),
        }),
      });
      expect(response.body).not.toHaveProperty("refreshToken");
    });

    // The core anti-enumeration guarantee, extended to usernames: no
    // response (status, body shape, or message) may reveal WHICH part of
    // the attempt was wrong, or even whether the identifier exists at all
    // — for staff email or portal username alike.
    it("returns an IDENTICAL generic error for: unknown username, wrong password on a real username, unknown email, and valid-creds-wrong-school", async () => {
      const [unknownUsername, wrongPasswordRealUsername, unknownEmail, validCredsWrongSchool] = await Promise.all([
        login({ identifier: "NOSUCHUSER1" }),
        login({ identifier: scratchStudentUsername, password: "wrong-password" }),
        login({ identifier: "nobody@sunrise.test" }),
        // A REAL username + REAL password for Sunrise, submitted against
        // Hillcrest's slug — schoolId-scoped lookup never resolves it
        // there, so this must fail identically to every other case, not
        // with a distinguishable "wrong school" signal (that would leak
        // cross-tenant information login is specifically designed not to).
        login({ identifier: scratchStudentUsername, password: SCRATCH_STUDENT_PASSWORD, schoolSlug: HILLCREST_SLUG }),
      ]);

      const all = [unknownUsername, wrongPasswordRealUsername, unknownEmail, validCredsWrongSchool];
      for (const response of all) {
        expect(response.status).toBe(401);
      }

      const shapes = all.map((r) => ({ statusCode: r.body.statusCode, message: r.body.message, error: r.body.error }));
      for (const shape of shapes.slice(1)) {
        expect(shape).toEqual(shapes[0]);
      }
    });
  });

  describe("GET /auth/me", () => {
    it("returns the profile for a valid access token", async () => {
      const { body } = await login();

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${body.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          email: SUNRISE_ADMIN_EMAIL,
          role: "SCHOOL_ADMIN",
          school: expect.objectContaining({ slug: SUNRISE_SLUG }),
        }),
      );
    });

    it("rejects an expired access token", async () => {
      const jwtService = app.get(JwtService);
      const configService = app.get(ConfigService);
      const expiredToken = await jwtService.signAsync(
        { sub: adminUserId, schoolId: "irrelevant", role: "SCHOOL_ADMIN" },
        { secret: configService.getOrThrow<string>("JWT_ACCESS_SECRET"), expiresIn: "-10s" },
      );

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });

    it("rejects a garbage token", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer not-a-real-token");

      expect(response.status).toBe(401);
    });
  });

  it("401s on a protected endpoint with no token at all (guard is truly global)", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/auth/me");
    expect(response.status).toBe(401);
  });

  // v0.6 step 2 — the forced-password-change hard block, proven server-side
  // against a REAL protected route, not a UI assertion. Reuses the existing
  // global PasswordChangeRequiredGuard wholesale (SPEC_V0.3.md §2) — no fork
  // for portal accounts.
  describe("forced-password-change hard block (a mustChangePassword STUDENT account)", () => {
    it("blocks a real protected route, allows only change-password/me/logout, then the block's REASON is gone after changing", async () => {
      const loginResponse = await login({ identifier: mustChangeStudentUsername, password: MUST_CHANGE_TEMP_PASSWORD });
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.user.mustChangePassword).toBe(true);
      const staleToken = loginResponse.body.accessToken as string;

      // A real protected route — GET /students — 403s with the
      // password-change guard's message, not a role/RBAC message.
      const blockedStudents = await request(app.getHttpServer())
        .get("/api/v1/students")
        .set("Authorization", `Bearer ${staleToken}`);
      expect(blockedStudents.status).toBe(403);
      expect(blockedStudents.body.message).toBe("You must change your password before continuing.");

      // The three explicitly-exempted routes still work with the stale token.
      const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Authorization", `Bearer ${staleToken}`);
      expect(me.status).toBe(200);

      const changePassword = await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${staleToken}`)
        .send({ currentPassword: MUST_CHANGE_TEMP_PASSWORD, newPassword: "a-new-password-8+chars" });
      expect(changePassword.status).toBe(200);
      // v0.8.5 step 1 — change-password reissues a token pair too (to clear
      // the stale claim); its refresh token moves to the cookie exactly
      // like login/refresh, never the body.
      expect(changePassword.body).not.toHaveProperty("refreshToken");
      expect(findSetCookie(changePassword, "refreshToken")).toBeDefined();
      const freshToken = changePassword.body.accessToken as string;

      // Retry the same route with the FRESH token (change-password reissues
      // one, exactly like staff — mustChangePassword:false is now baked
      // into its own claims). STUDENT still isn't @Roles()-authorized on
      // /students, so this still 403s — but via RolesGuard's "Forbidden",
      // never the password-change message again. That message-level
      // distinction IS the proof the block's REASON changed, not just that
      // "something still 403s."
      const afterChange = await request(app.getHttpServer())
        .get("/api/v1/students")
        .set("Authorization", `Bearer ${freshToken}`);
      expect(afterChange.status).toBe(403);
      expect(afterChange.body.message).not.toBe("You must change your password before continuing.");
      expect(afterChange.body.message).toBe("Forbidden");
    });
  });

  describe("refresh rotation and reuse detection", () => {
    // v0.8.5 step 1 — still proven here with a real login: rotation
    // itself (not the reuse-detection split below, which uses planted
    // families to respect the login throttle) works end to end via the
    // actual login-issued cookie.
    it("rotates on use — the old cookie dies, a new one works", async () => {
      const loginResponse = await login();
      const cookie1 = findSetCookie(loginResponse, "refreshToken")!;

      const firstRefresh = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", asCookieHeader(cookie1))
        .set(CSRF_HEADER);
      expect(firstRefresh.status).toBe(200);
      expect(firstRefresh.body).not.toHaveProperty("refreshToken");
      const cookie2 = findSetCookie(firstRefresh, "refreshToken")!;
      expect(asCookieHeader(cookie2)).not.toBe(asCookieHeader(cookie1));

      // The old cookie is dead after use...
      const reuseAttempt = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", asCookieHeader(cookie1))
        .set(CSRF_HEADER);
      expect(reuseAttempt.status).toBe(401);

      // ...but (v0.8.5 step 2 — this is the diagnosed bug, now fixed) the
      // NEWEST cookie is untouched: cookie1's reuse was a lone, isolated
      // presentation with no concurrent race and no further chain
      // advancement, so it's classified as benign (sequence+1 === max)
      // and the family is never revoked. See the dedicated benign-race
      // and genuine-reuse tests below for the real two-branch proof.
      const secondTokenAttempt = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", asCookieHeader(cookie2))
        .set(CSRF_HEADER);
      expect(secondTokenAttempt.status).toBe(200);
    });

    // v0.8.5 step 2 (SPEC_V0.8.5.md §5) — invariant half (a): a BENIGN
    // race. Two genuinely concurrent real HTTP calls (Promise.all, not a
    // mock and not sequential) present the SAME still-live token. Exactly
    // one must win; the loser's 401 must NOT revoke the family — the
    // actual, real-concurrency proof of the diagnosed bug being fixed.
    it("two genuinely concurrent refresh calls on the same token: exactly one wins, the loser 401s WITHOUT revoking the family", async () => {
      const { rawValue } = await plantRefreshToken(adminUserId);

      const [callA, callB] = await Promise.all([refresh(rawValue), refresh(rawValue)]);

      const statuses = [callA.status, callB.status].sort();
      expect(statuses).toEqual([200, 401]);
      const winner = callA.status === 200 ? callA : callB;

      // The winner's brand-new cookie must still work — proving the
      // loser's 401 did not revoke the family it belongs to.
      const winnerCookie = findSetCookie(winner, "refreshToken")!;
      const followUp = await refresh(rawCookieValue(winnerCookie));
      expect(followUp.status).toBe(200);
    });

    // v0.8.5 step 2 — invariant half (b): GENUINE reuse. A token that has
    // been superseded by two or more generations (the chain has moved
    // past its immediate successor) gets replayed — this is the hallmark
    // of a stolen/leaked token, and must revoke the WHOLE family,
    // including the currently-live, legitimate tip.
    it("replaying a token superseded by two or more generations revokes the WHOLE family — even the current legitimate tip dies", async () => {
      const { rawValue: gen0 } = await plantRefreshToken(adminUserId);
      const firstRefresh = await refresh(gen0);
      expect(firstRefresh.status).toBe(200);
      const gen1 = rawCookieValue(findSetCookie(firstRefresh, "refreshToken")!);

      const secondRefresh = await refresh(gen1);
      expect(secondRefresh.status).toBe(200);
      const gen2 = rawCookieValue(findSetCookie(secondRefresh, "refreshToken")!);

      // Replay the ORIGINAL token — the chain has moved two generations
      // past it (gen0 -> gen1 -> gen2), not just one.
      const replay = await refresh(gen0);
      expect(replay.status).toBe(401);

      // The whole family is dead now — even gen2, the legitimate current
      // tip that was never itself compromised, no longer refreshes.
      const tipAfterReplay = await refresh(gen2);
      expect(tipAfterReplay.status).toBe(401);
    });

    // v0.8.5 step 2 — multi-device: a second, independent family for the
    // SAME user is a completely separate chain. Folded into the logout
    // test below (not a separate test here) so proving it doesn't cost
    // an extra login() call — see that test's own doc comment.

    // v0.8.5 step 2 (SPEC_V0.8.5.md §5/§8) — rotation + the 7d expiry
    // still hold: a plainly-expired (never rotated, never touched)
    // planted token 401s, and — the refinement confirmed at plan time —
    // does NOT revoke its family, since a token that simply timed out
    // from disuse isn't suspicious.
    it("a naturally expired token 401s without revoking its family", async () => {
      const { rawValue, familyId } = await plantRefreshToken(adminUserId);
      await prisma.refreshToken.updateMany({ where: { familyId }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const response = await refresh(rawValue);
      expect(response.status).toBe(401);

      const row = await prisma.refreshToken.findFirstOrThrow({ where: { familyId } });
      expect(row.revokedAt).toBeNull();
    });

    it("401s with no cookie at all", async () => {
      const response = await request(app.getHttpServer()).post("/api/v1/auth/refresh").set(CSRF_HEADER);
      expect(response.status).toBe(401);
    });

    it("401s with a garbage cookie value, not a 500", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", "refreshToken=not-a-real-token")
        .set(CSRF_HEADER);
      expect(response.status).toBe(401);
    });

    // v0.8.5 step 1 (SPEC_V0.8.5.md §8 flag 1) — the exact defensive case
    // Flag 1 called out: a token value containing BOTH "=" and "." (never
    // split("="), decodeURIComponent the percent-encoded "=" correctly).
    // The real opaque token generator never produces these characters
    // today, so this test manually plants a refreshToken row whose VALUE
    // does, then sends it exactly as the browser would have received it
    // from a real Set-Cookie (confirmed empirically: Express's own
    // `cookie` package serializes "abc=def.ghi" as "abc%3Ddef.ghi" on the
    // wire — "." needs no encoding at all). A 200 here proves the full
    // real pipeline (cookie extraction -> decodeURIComponent -> hashToken
    // -> DB lookup) recovers the byte-for-byte original value, not a
    // truncated one — a parser that `split("=")`'d instead would hash
    // "abc" alone and never find this row.
    it("round-trips a refresh token value containing '=' and '.' correctly", async () => {
      await plantRefreshToken(adminUserId, "abc=def.ghi");

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", "refreshToken=abc%3Ddef.ghi")
        .set(CSRF_HEADER);
      expect(response.status).toBe(200);
    });

    // v0.8.5 step 1 — avoids a real login() on purpose: POST /auth/login
    // is throttled at 10/min/IP (unchanged this step, SPEC_V0.8.5.md §1),
    // and this file's own login-based tests already sit right at that
    // boundary. A directly-planted refreshToken row exercises the exact
    // same guard/service path without spending login quota.
    it("401s a refresh call missing the CSRF header, before touching the database", async () => {
      const { rawValue } = await plantRefreshToken(adminUserId);

      const response = await request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", `refreshToken=${rawValue}`);
      expect(response.status).toBe(403);

      // The cookie is still live — a missing-header rejection must not
      // have consumed/rotated it.
      const realRefresh = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", `refreshToken=${rawValue}`)
        .set(CSRF_HEADER);
      expect(realRefresh.status).toBe(200);
    });
  });

  describe("POST /auth/logout", () => {
    // The one logout test that goes through a real login() — worth
    // exercising the primary proof (clears + revokes) against a cookie
    // the LOGIN endpoint itself issued, not just a planted row. Also
    // doubles as the multi-device proof (SPEC_V0.8.5.md §5): a SECOND,
    // independent family for the same user (a planted "device B", not a
    // second real login — stays within the login throttle budget) must
    // be completely unaffected by device A's logout, since family-scoped
    // revocation (not userId-wide) is the whole point of this step.
    it("clears the cookie and revokes the refresh token's family; a DIFFERENT device's family is unaffected", async () => {
      const loginResponse = await login();
      const { accessToken } = loginResponse.body;
      const cookie = findSetCookie(loginResponse, "refreshToken")!;

      // Device B — an independent family for the SAME user, planted
      // rather than a second real login.
      const { rawValue: deviceBToken } = await plantRefreshToken(adminUserId);

      const logoutResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", asCookieHeader(cookie))
        .set(CSRF_HEADER);
      expect(logoutResponse.status).toBe(200);

      // res.clearCookie() sends an empty value with an already-past
      // Expires (confirmed: Express's own implementation, not Max-Age=0)
      // — the browser's own instruction to delete it immediately.
      const clearedCookie = findSetCookie(logoutResponse, "refreshToken");
      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toMatch(/^refreshToken=;/);
      expect(clearedCookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
      // v0.8.5 bugfix (docs/DECISIONS.md, 2026-11-11) — set and clear MUST
      // use the identical Path, or the browser treats them as two
      // different cookies: a clear on the wrong Path leaves the original
      // uncleared. Both sides already read the one REFRESH_COOKIE_PATH
      // constant in source; this proves it from the outside, against the
      // real cookie strings, not just by reading the source.
      const setPath = cookie.match(/Path=([^;]+)/i)?.[1];
      const clearPath = clearedCookie!.match(/Path=([^;]+)/i)?.[1];
      expect(setPath).toBeDefined();
      expect(clearPath).toBe(setPath);

      // Device A's own family is dead...
      const refreshAfterLogout = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", asCookieHeader(cookie))
        .set(CSRF_HEADER);
      expect(refreshAfterLogout.status).toBe(401);

      // ...but device B's completely separate family still works —
      // logout is family-scoped, never userId-wide.
      const deviceBRefresh = await refresh(deviceBToken);
      expect(deviceBRefresh.status).toBe(200);
    });

    // v0.8.5 step 1 (SPEC_V0.8.5.md §2) — logout is idempotent: no cookie
    // present (already logged out, or never had one) is a harmless no-op,
    // never a 401 — the caller's INTENT ("make sure I'm logged out") is
    // satisfiable even with nothing left to revoke. A directly-signed
    // access token (no login(), no DB row — there's nothing to revoke
    // either way) avoids spending login throttle quota for this case.
    it("logging out with no refresh cookie still succeeds (idempotent, not a 401)", async () => {
      const accessToken = await signAccessToken(adminUserId, sunriseSchoolId);

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .set(CSRF_HEADER);
      expect(response.status).toBe(200);
    });

    it("403s a logout call missing the CSRF header", async () => {
      const accessToken = await signAccessToken(adminUserId, sunriseSchoolId);
      const { rawValue } = await plantRefreshToken(adminUserId);

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", `refreshToken=${rawValue}`);
      expect(response.status).toBe(403);
    });
  });
});
