import { extractRefreshCookie } from "./refresh-cookie.util";

describe("extractRefreshCookie", () => {
  it("returns null for an absent Cookie header", () => {
    expect(extractRefreshCookie(undefined)).toBeNull();
  });

  it("returns null for an empty Cookie header", () => {
    expect(extractRefreshCookie("")).toBeNull();
  });

  it("extracts the value from a single cookie", () => {
    expect(extractRefreshCookie("refreshToken=abc123")).toBe("abc123");
  });

  it("finds refreshToken among multiple cookies, in any position", () => {
    expect(extractRefreshCookie("other=1; refreshToken=abc123; third=2")).toBe("abc123");
    expect(extractRefreshCookie("refreshToken=abc123; other=1")).toBe("abc123");
    expect(extractRefreshCookie("other=1; refreshToken=abc123")).toBe("abc123");
  });

  it("returns null when refreshToken isn't present at all", () => {
    expect(extractRefreshCookie("other=1; third=2")).toBeNull();
  });

  // SPEC_V0.8.5.md §8 flag 1 — the exact defensive case: a value
  // containing BOTH "=" and "." must round-trip byte-for-byte. A naive
  // split("=") would truncate this at the FIRST "=", returning "abc"
  // instead of "abc=def.ghi" — never split("="); indexOf+substring only.
  it("never split('='): a value containing '=' and '.' round-trips byte-for-byte", () => {
    // The wire representation Express's own `cookie` package produces
    // when serializing this exact value (confirmed directly: "=" is
    // percent-encoded to "%3D", "." is left unencoded — a legal,
    // unreserved cookie-octet per RFC 6265).
    expect(extractRefreshCookie("refreshToken=abc%3Ddef.ghi")).toBe("abc=def.ghi");
  });

  it("handles a value with '=' and '.' alongside other cookies", () => {
    expect(extractRefreshCookie("session=xyz; refreshToken=abc%3Ddef.ghi; theme=dark")).toBe("abc=def.ghi");
  });

  it("returns null for malformed percent-encoding rather than throwing", () => {
    expect(extractRefreshCookie("refreshToken=%")).toBeNull();
  });

  it("trims whitespace around cookie pairs", () => {
    expect(extractRefreshCookie("other=1;   refreshToken=abc123  ; third=2")).toBe("abc123");
  });
});
