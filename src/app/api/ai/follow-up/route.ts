import { buildApplicationContext } from "@/lib/ai/context";
import { aiRoute } from "@/lib/ai/handler";
import { followUpRequest } from "@/lib/ai/schemas";
import { AiError } from "@/lib/ai/types";

export const POST = aiRoute(followUpRequest, async (input, { ai, supabase, user }) => {
  const app = await buildApplicationContext(supabase, user.id, input.application_id);
  if (!app) throw new AiError("bad_request", "Application not found.", false);
  return ai.draftFollowUp(app, { tone: input.tone, instructions: input.instructions });
});
