import { ArgumentsHost, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AllExceptionsFilter } from "./all-exceptions.filter";

// v0.9 Step 2c review follow-up (docs/DECISIONS.md) — mapped lock-contention
// responses returned before any logging, so an operator watching logs had
// no signal these were happening at all. Asserts BOTH halves of the fix:
// a warning is logged with the kind, and the response body sent to the
// client is byte-for-byte unchanged by adding that logging.
function makeHost(request: { method: string; url: string }) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe("AllExceptionsFilter — lock-contention logging", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("logs a warning with the kind and request path, and the response body is unchanged", () => {
    const filter = new AllExceptionsFilter();
    const exception = new Prisma.PrismaClientKnownRequestError("Unable to start a transaction in the given time", {
      code: "P2028",
      clientVersion: "test",
    });
    const { host, status, json } = makeHost({ method: "PATCH", url: "/api/v1/students/abc" });

    filter.catch(exception, host);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0][0] as string;
    expect(logged).toContain("maxWait");
    expect(logged).toContain("/api/v1/students/abc");
    expect(logged).not.toContain(exception.stack);

    expect(status).toHaveBeenCalledWith(503);
    const body = json.mock.calls[0][0];
    expect(body).toEqual({
      statusCode: 503,
      message: "The server is busy right now. Please try again in a moment.",
      error: "Service Unavailable",
      retryable: true,
      path: "/api/v1/students/abc",
      timestamp: expect.any(String),
    });
    expect(body.kind).toBeUndefined();
  });

  it("does not log a warning for a non-lock-contention error", () => {
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const filter = new AllExceptionsFilter();
    const { host } = makeHost({ method: "GET", url: "/api/v1/students" });

    filter.catch(new Error("boom"), host);

    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
