/**
 * withTool — one wrapper that owns the boilerplate every Tools route repeated:
 * JSON parse → Zod validation → tool authorization (role + client scope) →
 * per-tool rate limiting. The handler receives the parsed, typed body and the
 * user, and just builds its prompt + calls the model.
 *
 *   export const POST = withTool(
 *     { slug: "meta", schema, invalid: "Paste some page content." },
 *     async ({ data, user }) => { ... return NextResponse.json(...) },
 *   );
 *
 * Rate-limit keys are per-tool (`tools:<slug>:<userId>`) so heavy use of one
 * tool never locks a VA out of the others, and a read-only fetch doesn't eat a
 * generation budget.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool } from "@/lib/tools/ai";
import type { ApiUser } from "@/lib/api-auth";

interface ToolContext<T> {
  data: T;
  user: ApiUser;
  req: NextRequest;
}

export function withTool<S extends z.ZodTypeAny>(
  opts: { slug: string; schema: S; invalid: string },
  handler: (ctx: ToolContext<z.infer<S>>) => Promise<NextResponse> | NextResponse,
) {
  return withAuth(async (req, { user }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const parsed = opts.schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: opts.invalid }, { status: 422 });

    const data = parsed.data as z.infer<S>;
    const denied = authorizeTool(user, (data as { clientId: string }).clientId);
    if (denied) return denied;

    const rl = await toolsLimiter.check(`tools:${opts.slug}:${user.id}`);
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

    return handler({ data, user, req });
  });
}
