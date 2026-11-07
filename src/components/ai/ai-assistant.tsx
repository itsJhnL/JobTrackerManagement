"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BellRing, ClipboardPaste, GraduationCap, PenLine, Target } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { PickerApplication } from "./application-picker";
import { FitAnalyzerTool } from "./fit-analyzer-tool";
import { FollowUpTool } from "./follow-up-tool";
import { InterviewPrepTool } from "./interview-prep-tool";
import { JobParserTool } from "./job-parser-tool";
import { WriterTool } from "./writer-tool";

const TOOLS = [
  { key: "parse", label: "Parse job post", icon: ClipboardPaste },
  { key: "fit", label: "Job fit", icon: Target },
  { key: "write", label: "Writer", icon: PenLine },
  { key: "follow-up", label: "Follow-up", icon: BellRing },
  { key: "interview", label: "Interview prep", icon: GraduationCap },
] as const;
type ToolKey = (typeof TOOLS)[number]["key"];

interface AiAssistantProps {
  applications: PickerApplication[];
  status: { provider: string; configured: boolean; model: string | null };
  profileReady: boolean;
}

export function AiAssistant({ applications, status, profileReady }: AiAssistantProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toolParam = searchParams.get("tool");
  const tool: ToolKey = TOOLS.some((t) => t.key === toolParam)
    ? (toolParam as ToolKey)
    : "parse";
  const applicationId = searchParams.get("application") ?? undefined;

  return (
    <div className="flex flex-col gap-4">
      {!status.configured ? (
        <Alert>
          <AlertTitle>AI is not configured yet</AlertTitle>
          <AlertDescription>
            Set <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> in your
            environment to enable these tools. Google AI Studio offers a free tier. Keys
            stay on the server.
          </AlertDescription>
        </Alert>
      ) : !profileReady ? (
        <Alert>
          <AlertTitle>Add your profile first</AlertTitle>
          <AlertDescription>
            Fit analysis, writing and interview prep only use verified facts from your
            profile. Add skills, experience and projects in Settings so the assistant has
            something to work with.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={tool}
        onValueChange={(v) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("tool", String(v));
          router.replace(`${pathname}?${params}`, { scroll: false });
        }}
        className="gap-4"
      >
        <div className="-mx-4 scrollbar-thin overflow-x-auto px-4 md:-mx-6 md:px-6">
          <TabsList variant="line" className="h-9 w-max gap-2 border-b pb-0">
            {TOOLS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="h-8 px-2 pb-2.5">
                <t.icon data-icon="inline-start" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="parse">
          <JobParserTool />
        </TabsContent>
        <TabsContent value="fit">
          <FitAnalyzerTool
            applications={applications}
            initialApplicationId={applicationId}
          />
        </TabsContent>
        <TabsContent value="write">
          <WriterTool applications={applications} initialApplicationId={applicationId} />
        </TabsContent>
        <TabsContent value="follow-up">
          <FollowUpTool
            applications={applications}
            initialApplicationId={applicationId}
          />
        </TabsContent>
        <TabsContent value="interview">
          <InterviewPrepTool
            applications={applications}
            initialApplicationId={applicationId}
          />
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        Provider: {status.provider}
        {status.model ? ` · ${status.model}` : ""}. Only the text needed for each task is
        sent. Outputs are drafts: review and edit before you use them.
      </p>
    </div>
  );
}
