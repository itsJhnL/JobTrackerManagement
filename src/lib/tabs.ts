/**
 * Tab ids for the Settings and application detail pages.
 *
 * These live outside the "use client" tab components on purpose: a value
 * exported from a client module reaches a server component as a client
 * reference, not as the array, so `.includes()` on it throws at render time.
 */
export const SETTINGS_TABS = [
  "profile",
  "preferences",
  "integrations",
  "account",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DETAIL_TABS = [
  "overview",
  "application",
  "compensation",
  "communication",
  "interviews",
  "tasks",
  "activity",
] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

function parseTab<T extends string>(tabs: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (tabs as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export const parseSettingsTab = (value: unknown) =>
  parseTab(SETTINGS_TABS, value, "profile");
export const parseDetailTab = (value: unknown) =>
  parseTab(DETAIL_TABS, value, "overview");
