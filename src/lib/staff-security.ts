import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Credentials belong to the Auth identity, not to just one restaurant membership. */
export async function assertStaffCredentialScope(
  admin: SupabaseClient<Database>, userId: string, restaurantId: string, isOwner: boolean, restaurantBound = false,
) {
  const forbidden = isOwner && !restaurantBound
    ? "role.eq.super_admin"
    : `${isOwner ? "role.eq.super_admin" : "role.in.(super_admin,restaurant_admin)"},restaurant_id.is.null,restaurant_id.neq.${restaurantId}`;
  const result = await admin.from("staff").select("id", { count: "exact", head: true })
    .eq("auth_user_id", userId).or(forbidden);
  if (result.error) throw result.error;
  if (result.count === null) throw new Error("Account permissions could not be verified");
  if (result.count > 0) throw new Error("This account has protected or shared access. Its credentials cannot be managed from this restaurant.");
}

type AuthDirectory = { listUsers(input: { page: number; perPage: number }): Promise<{ data: { users: { id: string; email?: string }[] }; error: unknown }> };
/** Existing accounts beyond the first directory page must be linked, not recreated. */
export async function findStaffAuthUser(directory: AuthDirectory, email: string): Promise<string | undefined> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const result = await directory.listUsers({ page, perPage });
    if (result.error) throw result.error;
    const match = result.data.users.find(user => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (result.data.users.length < perPage) return undefined;
  }
}
