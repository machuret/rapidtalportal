/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error-tracking";

test("records structured provider and database errors without collapsing to object Object", async () => {
  const insert = jest.fn().mockResolvedValue({ error: null });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn(() => ({ insert })),
  });
  jest.spyOn(console, "error").mockImplementation(() => undefined);

  captureError("api", {
    code: "42703",
    message: "column company_dna.brand_voice does not exist",
    details: null,
  }, { url: "/api/content/competitors/intelligence" });
  await Promise.resolve();

  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    message: "column company_dna.brand_voice does not exist",
    url: "/api/content/competitors/intelligence",
  }));
  expect(console.error).toHaveBeenCalledWith(
    "[api]",
    "/api/content/competitors/intelligence",
    "column company_dna.brand_voice does not exist",
  );
});
