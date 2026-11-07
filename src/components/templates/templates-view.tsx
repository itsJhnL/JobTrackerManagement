"use client";

import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";

import { deleteTemplate } from "@/actions/templates";
import { CopyButton } from "@/components/shared/copy-button";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityMenu } from "@/components/shared/entity-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from "@/lib/constants";
import type { TemplateRow } from "@/lib/supabase/database.types";
import { formatTimeAgo } from "@/lib/format";

import { TemplateFormDialog } from "./template-form";

export function TemplatesView({ templates }: { templates: TemplateRow[] }) {
  const [dialog, setDialog] = useState<{ open: boolean; template?: TemplateRow }>({
    open: false,
  });
  const [category, setCategory] = useState<"all" | TemplateCategory>("all");

  const filtered = useMemo(
    () =>
      category === "all" ? templates : templates.filter((t) => t.category === category),
    [templates, category],
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={category}
          onValueChange={(v) => setCategory(v as "all" | TemplateCategory)}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {TEMPLATE_CATEGORIES.map((c) => (
              <TabsTrigger key={c} value={c}>
                {TEMPLATE_CATEGORY_LABELS[c]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button size="sm" onClick={() => setDialog({ open: true })}>
          <Plus data-icon="inline-start" /> New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Save messages you reuse: application emails, follow-ups, recruiter replies. The AI writer can save drafts here too."
          action={
            <Button onClick={() => setDialog({ open: true })}>Create template</Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="Nothing in this category" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((t) => (
            <Card key={t.id} size="sm" className="gap-2">
              <div className="flex items-start gap-2 px-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      {TEMPLATE_CATEGORY_LABELS[t.category as TemplateCategory] ??
                        t.category}
                    </Badge>
                    updated {formatTimeAgo(t.updated_at)}
                  </p>
                </div>
                <CopyButton
                  text={t.subject ? `Subject: ${t.subject}\n\n${t.body}` : t.body}
                  size="icon-sm"
                  variant="ghost"
                />
                <EntityMenu
                  onEdit={() => setDialog({ open: true, template: t })}
                  onDelete={() => deleteTemplate(t.id)}
                  deleteTitle={`Delete "${t.name}"?`}
                />
              </div>
              {t.subject ? <p className="px-3 text-xs font-medium">{t.subject}</p> : null}
              <p className="line-clamp-5 px-3 text-xs whitespace-pre-wrap text-muted-foreground">
                {t.body}
              </p>
            </Card>
          ))}
        </div>
      )}

      <TemplateFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        template={dialog.template}
      />
    </>
  );
}
