import { REFRESH_COOKIE_NAME } from "./auth.constants";

// v0.8.5 step 1 (SPEC_V0.8.5.md §8 flag 1) — hand-rolled instead of adding
// cookie-parser (CLAUDE.md: no new library without asking) since this app
// only ever needs to read exactly one cookie. Finds the "refreshToken="
// segment and takes everything AFTER THE FIRST "=" via indexOf/substring —
// never split("="), which would silently truncate a value that itself
// contains "=" (confirmed live: Express's own `cookie` package percent-
// encodes "=" to "%3D" when SETTING the cookie — res.cookie("refreshToken",
// "abc=def.ghi", ...) serializes to "refreshToken=abc%3Ddef.ghi" — so the
// value read back off the wire must be decodeURIComponent'd to recover the
// original byte-for-byte token, or a legitimate token containing "=" would
// never match its stored hash). "." needs no such handling (a legal,
// unencoded cookie-octet per RFC 6265) but is exercised by the same test
// for the same reason: prove the parser doesn't split on it either.
export function extractRefreshCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const pair of cookieHeader.split(";")) {
    const trimmed = pair.trim();
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    if (trimmed.substring(0, equalsIndex) !== REFRESH_COOKIE_NAME) {
      continue;
    }
    const rawValue = trimmed.substring(equalsIndex + 1);
    try {
      return decodeURIComponent(rawValue);
    } catch {
      // Malformed percent-encoding — treat as "no cookie" (a clean 401
      // upstream), never a 500 on a client sending garbage.
      return null;
    }
  }
  return null;
}
