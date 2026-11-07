import { aiRoute } from "@/lib/ai/handler";
import { parseJobRequest } from "@/lib/ai/schemas";
import { AiError } from "@/lib/ai/types";
import { extractJobPage } from "@/lib/job-url/extract";
import { fetchJobPage, JobPageError } from "@/lib/job-url/fetch";
import { buildParseInput, hasUsefulContent, mergeParsedJob } from "@/lib/job-url/merge";

/** Fetching a page and one AI call can take a while on slow job sites. */
export const maxDuration = 60;

/**
 * POST /api/ai/parse-job  { text } | { url }
 *
 * With `url`, the page is downloaded on the server (SSRF-guarded), its
 * schema.org JobPosting markup and readable text are extracted, and the AI
 * fills in whatever the markup does not state. Markup values always win.
 */
export const POST = aiRoute(parseJobRequest, async (input, { ai }) => {
  if ("text" in input) return ai.parseJob(input.text);

  let page;
  let finalUrl: string;
  try {
    const fetched = await fetchJobPage(input.url);
    finalUrl = fetched.url;
    page = extractJobPage(fetched.html);
  } catch (e) {
    if (e instanceof JobPageError)
      throw new AiError(
        "bad_request",
        `${e.message} Paste the job description text instead.`,
        false,
      );
    throw e;
  }

  if (!hasUsefulContent(page))
    throw new AiError(
      "bad_request",
      "Couldn't find the job details on that page. It may need you to sign in or only loads in a browser. Paste the job description text instead.",
      false,
    );

  const parsed = await ai.parseJob(buildParseInput(page, finalUrl));
  // Keep the link the user pasted, not a tracking redirect target.
  return mergeParsedJob(parsed, page, input.url);
});
