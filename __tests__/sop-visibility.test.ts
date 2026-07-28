import { visibleSopsForUser } from "../supabase/functions/_shared/sop-visibility";

const rows = [
  { id: "client-public", client_id: "client-a", visibility: "public", deleted_at: null },
  { id: "client-restricted", client_id: "client-a", visibility: "restricted", deleted_at: null },
  { id: "global-public", client_id: null, visibility: "public", deleted_at: null },
  { id: "global-restricted", client_id: null, visibility: "restricted", deleted_at: null },
  { id: "other-client", client_id: "client-b", visibility: "public", deleted_at: null },
  { id: "deleted", client_id: "client-a", visibility: "public", deleted_at: "2026-07-01T00:00:00Z" },
];

describe("visibleSopsForUser", () => {
  it("returns public client and global SOPs for an ordinary member", () => {
    expect(visibleSopsForUser(rows, {
      clientId: "client-a",
      role: "va",
      grantedSopIds: [],
    }).map((row) => row.id)).toEqual(["client-public", "global-public"]);
  });

  it("returns restricted SOPs only when the member has an explicit grant", () => {
    expect(visibleSopsForUser(rows, {
      clientId: "client-a",
      role: "va",
      grantedSopIds: ["client-restricted", "global-restricted"],
    }).map((row) => row.id)).toEqual([
      "client-public",
      "client-restricted",
      "global-public",
      "global-restricted",
    ]);
  });

  it("lets super-admins read restricted SOPs but never deleted or other-client SOPs", () => {
    expect(visibleSopsForUser(rows, {
      clientId: "client-a",
      role: "super_admin",
      grantedSopIds: [],
    }).map((row) => row.id)).toEqual([
      "client-public",
      "client-restricted",
      "global-public",
      "global-restricted",
    ]);
  });

  it("applies the result limit only after access filtering", () => {
    expect(visibleSopsForUser(rows, {
      clientId: "client-a",
      role: "va",
      grantedSopIds: [],
      limit: 1,
    }).map((row) => row.id)).toEqual(["client-public"]);
  });
});
