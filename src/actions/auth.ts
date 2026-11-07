"use server";

import { redirect } from "next/navigation";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSiteUrl } from "@/lib/site-url";

export type AuthState = { error?: string; message?: string } | null;

const credentialsSchema = z.object({
  email: z.email({ message: "Enter a valid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
});

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  redirect(safeNextPath(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema
    .extend({
      full_name: z.string().trim().min(1, { message: "Enter your name" }).max(120),
    })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      full_name: formData.get("full_name"),
    });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${await getSiteUrl()}/auth/callback`,
    },
  });
  if (error) return { error: error.message };

  // Email confirmation disabled → session exists → go straight in.
  if (data.session) redirect("/dashboard");

  return { message: "Check your inbox to confirm your email, then sign in." };
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = z
    .email({ message: "Enter a valid email address" })
    .safeParse(formData.get("email"));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await getSiteUrl()}/auth/callback?next=/settings/account`,
  });
  if (error) return { error: error.message };
  return { message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = z
    .object({
      password: z.string().min(8, { message: "Password must be at least 8 characters" }),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      message: "Passwords do not match",
      path: ["confirm"],
    })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  return { message: "Password updated." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
