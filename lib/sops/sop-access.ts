/**
 * Shared SOP access-list sync, used by the single-SOP route and the bulk route.
 * Public SOPs get an empty allow-list; restricted SOPs keep only real VAs (and,
 * for a client SOP, only that client's VAs — so an admin can't grant another
 * tenant's VA access).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncSopAccess(admin: any, sopId: string, clientId: string | null, visibility: string, accessUserIds: string[] | undefined): Promise<void> {
  await admin.from("sop_access").delete().eq("sop_id", sopId);
  if (visibility !== "restricted" || !accessUserIds?.length) return;
  const { data: users } = await admin.from("users").select("id, role, client_id").in("id", accessUserIds.slice(0, 1000));
  const valid = ((users ?? []) as { id: string; role: string; client_id: string | null }[])
    .filter((u) => u.role === "va" && (clientId === null || u.client_id === clientId))
    .map((u) => u.id);
  if (valid.length) {
    await admin.from("sop_access").insert(valid.map((uid) => ({ sop_id: sopId, user_id: uid })));
  }
}
