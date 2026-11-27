/**
 * Returned by a server action when a status change to "hired" was actually
 * saved. The client celebrates once per event id, so re-renders, refreshes
 * and retries never celebrate twice.
 */
export interface HireEvent {
  id: string;
  applicationId: string;
  company: string;
  jobTitle: string;
}

export function hireEvent(
  applicationId: string,
  company: string,
  jobTitle: string,
): HireEvent {
  return { id: `${applicationId}:${Date.now()}`, applicationId, company, jobTitle };
}
