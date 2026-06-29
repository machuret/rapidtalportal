/**
 * The cookie holding the user id a super_admin is currently impersonating.
 *
 * Kept in its own dependency-free module so both the page-level auth (lib/auth,
 * which pulls in react cache + next/navigation) and the API auth (lib/api-auth,
 * deliberately light) can share the one canonical name without coupling.
 */
export const IMPERSONATE_COOKIE = "rt_impersonate";
