import { ROLES, ROLE_OPTIONS, type UserRole } from "@/lib/taxonomy/roles";

describe("role taxonomy", () => {
  it("defines metadata for exactly the three roles", () => {
    expect(Object.keys(ROLES).sort()).toEqual(["client_admin", "super_admin", "va"]);
  });

  it("gives every role a label and a badge class", () => {
    for (const meta of Object.values(ROLES)) {
      expect(meta.label.trim().length).toBeGreaterThan(0);
      expect(meta.badgeClass.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps ROLE_OPTIONS in sync with ROLES (every role selectable, labels match)", () => {
    expect(ROLE_OPTIONS).toHaveLength(Object.keys(ROLES).length);
    for (const opt of ROLE_OPTIONS) {
      expect(ROLES[opt.value as UserRole]).toBeDefined();
      expect(opt.label).toBe(ROLES[opt.value as UserRole].label);
    }
  });

  it("orders options least → most privileged", () => {
    expect(ROLE_OPTIONS.map((o) => o.value)).toEqual(["va", "client_admin", "super_admin"]);
  });
});
