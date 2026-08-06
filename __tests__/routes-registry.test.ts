/**
 * @jest-environment node
 *
 * ROUTES-registry drift guard.
 *
 * Every path builder in lib/api/routes.ts must resolve to a real
 * app/api/**\/route.ts handler, so a renamed or removed route can't silently
 * 404 through the typed registry. This mirrors the migrations-manifest guard,
 * but for the API surface. Dynamic segments ([id], [date], …) are matched
 * structurally against the filesystem, and query strings are ignored.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROUTES } from "@/lib/api/routes";

type RouteFn = (...args: unknown[]) => string;

function collect(node: unknown, path: string[], out: { name: string; fn: RouteFn }[]) {
  if (typeof node === "function") {
    out.push({ name: path.join("."), fn: node as RouteFn });
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) collect(value, [...path, key], out);
  }
}

// A value that can never collide with a real static path segment, so any
// segment built from a builder argument is treated as a dynamic segment.
const DUMMY_ARGS = Array(8).fill("__param__");

// Resolve an API path against app/api/, letting a single [param] directory stand
// in for any segment that has no literal match. Returns the resolved route.ts
// path, or null if nothing matches.
function resolveRouteFile(apiPath: string): string | null {
  const pathname = apiPath.split("?")[0].replace(/^\/+/, "");
  const segments = pathname.split("/"); // ["api", ...]
  let dir = join(process.cwd(), "app");
  for (const segment of segments) {
    const literal = join(dir, segment);
    if (existsSync(literal) && statSync(literal).isDirectory()) {
      dir = literal;
      continue;
    }
    const dynamic = readdirSync(dir).filter(
      (entry) => /^\[.+\]$/.test(entry) && statSync(join(dir, entry)).isDirectory(),
    );
    if (dynamic.length >= 1) {
      dir = join(dir, dynamic[0]);
      continue;
    }
    return null;
  }
  const routeFile = join(dir, "route.ts");
  return existsSync(routeFile) ? routeFile : null;
}

describe("ROUTES registry", () => {
  const routes: { name: string; fn: RouteFn }[] = [];
  collect(ROUTES, [], routes);

  it("collects the registry's path builders", () => {
    expect(routes.length).toBeGreaterThan(90);
  });

  it.each(routes.map((route) => [route.name, route.fn] as const))(
    "%s resolves to an app/api/**/route.ts handler",
    (_name, fn) => {
      const path = fn(...DUMMY_ARGS);
      expect(typeof path).toBe("string");
      expect(path.startsWith("/api/")).toBe(true);
      expect(resolveRouteFile(path)).not.toBeNull();
    },
  );
});
