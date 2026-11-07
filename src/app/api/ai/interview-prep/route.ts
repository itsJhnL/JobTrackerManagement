import { buildApplicationContext, buildProfileContext } from "@/lib/ai/context";
import { aiRoute } from "@/lib/ai/handler";
import { interviewPrepRequest } from "@/lib/ai/schemas";
import { AiError } from "@/lib/ai/types";
import { getProfile } from "@/lib/data/profiles";

export const POST = aiRoute(
  interviewPrepRequest,
  async (input, { ai, supabase, user }) => {
    const [app, profileRow] = await Promise.all([
      buildApplicationContext(supabase, user.id, input.application_id),
      getProfile(supabase, user.id),
    ]);
    if (!app) throw new AiError("bad_request", "Application not found.", false);
    if (!app.job_description)
      throw new AiError(
        "bad_request",
        "This application has no job description. Add one so the questions can be tailored.",
        false,
      );
    return ai.prepareInterview(app, buildProfileContext(profileRow));
  },
);
