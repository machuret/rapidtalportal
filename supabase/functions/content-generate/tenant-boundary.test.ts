import { handleContentGenerateRequest } from "./index.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const USER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REQUESTED_CLIENT_ID = "33333333-3333-4333-8333-333333333333";

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("content-generate rejects a cross-tenant request before privileged content reads", async () => {
  const adminTables: string[] = [];
  const userClient = {
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
  };
  const adminClient = {
    from(table: string) {
      adminTables.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          data: { id: USER_ID, role: "client_admin", client_id: USER_CLIENT_ID },
          error: null,
        }),
      };
      return chain;
    },
  };
  let clientNumber = 0;
  // deno-lint-ignore no-explicit-any
  const createClient = (() => {
    clientNumber += 1;
    return clientNumber === 1 ? userClient : adminClient;
  }) as any;

  const response = await handleContentGenerateRequest(
    new Request("https://example.test/content-generate", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: REQUESTED_CLIENT_ID,
        contentType: "linkedin",
        title: "Cross-tenant attempt",
        brief: {
          version: 1,
          objective: "Create content for another tenant.",
          tone: "professional",
          length: "short",
        },
      }),
    }),
    {
      createClient,
      fetch: () => {
        throw new Error("The model must not be called for a rejected tenant.");
      },
      envGet: (key) => ({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        OPENROUTER_API_KEY: "openrouter",
      })[key],
    },
  );

  assertEquals(response.status, 403, "cross-tenant response");
  assertEquals(adminTables.join(","), "users", "tables read before rejection");
});
