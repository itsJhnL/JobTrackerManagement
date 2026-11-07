import { aiRoute } from "@/lib/ai/handler";
import { parseJobRequest } from "@/lib/ai/schemas";

export const POST = aiRoute(parseJobRequest, ({ text }, { ai }) => ai.parseJob(text));
