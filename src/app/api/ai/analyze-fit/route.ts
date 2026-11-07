import {
  buildApplicationContext,
  buildProfileContext,
  profileIsUsable,
} from "@/lib/ai/context";
import { aiRoute } from "@/lib/ai/handler";
import { analyzeFitRequest } from "@/lib/ai/schemas";
import { AiError } from "@/lib/ai/types";
import { getProfile } from "@/lib/data/profiles";

export const POST = aiRoute(analyzeFitRequest, async (input, { ai, supabase, user }) => {
  const profile = buildProfileContext(await getProfile(supabase, user.id));
  if (!profileIsUsable(profile)) {
    throw new AiError(
      "bad_request",
      "Add your skills, experience or projects in Settings first so the analysis has something verified to compare against.",
      false,
    );
  }

  let jobText = input.job_text ?? "";
  if (input.application_id) {
    const app = await buildApplicationContext(supabase, user.id, input.application_id);
    if (!app) throw new AiError("bad_request", "Application not found.", false);
    jobText = app.job_description ?? jobText;
    if (!jobText)
      throw new AiError(
        "bad_request",
        "This application has no job description to analyse. Add one on the edit page.",
        false,
      );
  }

  return ai.analyzeFit(jobText, profile);
});
