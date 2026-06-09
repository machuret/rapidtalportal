/**
 * Single source of truth for user roles — labels, badge styles, select options.
 * Previously duplicated in UsersTable and ClientDetail.
 */
import type { UserRole } from "@/types/database";

export type { UserRole };

export interface RoleMeta {
  label: string;
  badgeClass: string;
}

export const ROLES: Record<UserRole, RoleMeta> = {
  super_admin:  { label: "Super Admin",  badgeClass: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  client_admin: { label: "Client Admin", badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  va:           { label: "VA",           badgeClass: "bg-zinc-700 text-zinc-300 border-zinc-600" },
};

/** Order shown in role <select>s (least → most privileged). */
export const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "va",           label: "VA" },
  { value: "client_admin", label: "Client Admin" },
  { value: "super_admin",  label: "Super Admin" },
];
