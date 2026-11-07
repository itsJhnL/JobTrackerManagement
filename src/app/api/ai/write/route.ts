import {
  buildApplicationContext,
  buildProfileContext,
  profileIsUsable,
} from "@/lib/ai/context";
import { aiRoute } from "@/lib/ai/handler";
import { writeRequest } from "@/lib/ai/schemas";
import { AiError } from "@/lib/ai/types";
import { getProfile } from "@/lib/data/profiles";

export const POST = aiRoute(writeRequest, async (input, { ai, supabase, user }) => {
  const profile = buildProfileContext(await getProfile(supabase, user.id));
  if (!profileIsUsable(profile)) {
    throw new AiError(
      "bad_request",
      "Add your skills, experience or projects in Settings first. The writer only uses verified profile facts.",
      false,
    );
  }
  const app = await buildApplicationContext(supabase, user.id, input.application_id);
  if (!app) throw new AiError("bad_request", "Application not found.", false);
  if (input.kind === "screening_answer" && !input.question) {
    throw new AiError("bad_request", "Enter the screening question to answer.", false);
  }
  return ai.write(input.kind, app, profile, {
    question: input.question,
    tone: input.tone,
    instructions: input.instructions,
  });
});
