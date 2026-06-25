import { originRejected, type OriginCheckable } from "@/lib/api/csrf";

/** Minimal request stand-in: only method + the two headers the guard reads. */
function req(method: string, headers: Record<string, string>): OriginCheckable {
  return {
    method,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  };
}

describe("originRejected (CSRF defence)", () => {
  it("allows GET regardless of origin", () => {
    expect(originRejected(req("GET", { origin: "https://evil.com", host: "app.com" }))).toBe(false);
  });

  it("allows a mutation with no Origin header (server-to-server / cron)", () => {
    expect(originRejected(req("POST", { host: "app.com" }))).toBe(false);
  });

  it("allows a same-origin mutation", () => {
    expect(originRejected(req("POST", { origin: "https://app.com", host: "app.com" }))).toBe(false);
  });

  it("allows a same-origin mutation including port", () => {
    expect(originRejected(req("PATCH", { origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(false);
  });

  it("blocks a cross-origin mutation", () => {
    expect(originRejected(req("POST", { origin: "https://evil.com", host: "app.com" }))).toBe(true);
  });

  it("blocks a mutation with a malformed Origin", () => {
    expect(originRejected(req("DELETE", { origin: "not a url", host: "app.com" }))).toBe(true);
  });
});
