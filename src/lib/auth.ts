import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Returns the authenticated user or null. Memoised per request so layouts,
 * pages and actions in the same render share one auth round-trip.
 * Always uses getUser() (verified against the auth server), never getSession().
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Redirects to /login when there is no session. Use in protected layouts and pages. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For server actions and route handlers: returns the user and a client, or throws.
 * Throwing (instead of redirecting) keeps action results serialisable.
 */
export async function requireUserForAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();
  return { user, supabase };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("You need to be signed in to do that.");
    this.name = "UnauthorizedError";
  }
}
