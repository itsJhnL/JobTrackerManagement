"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { updateProfile } from "@/actions/profile";
import { TextField, TextareaField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Profile } from "@/lib/data/profiles";
import { profileSchema, type ProfileInput } from "@/lib/validations/profile";

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [skillDraft, setSkillDraft] = useState("");

  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile.full_name ?? "",
      professional_summary: profile.professional_summary ?? "",
      skills: profile.skills,
      experience: profile.experience,
      projects: profile.projects,
      portfolio_url: profile.portfolio_url ?? "",
      resume_url: profile.resume_url ?? "",
      linkedin_url: profile.linkedin_url ?? "",
      github_url: profile.github_url ?? "",
    },
  });
  const experience = useFieldArray({ control: form.control, name: "experience" });
  const projects = useFieldArray({ control: form.control, name: "projects" });
  const skills = useWatch({ control: form.control, name: "skills" }) ?? [];

  const addSkill = () => {
    const parts = skillDraft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    form.setValue("skills", Array.from(new Set([...skills, ...parts])), {
      shouldDirty: true,
    });
    setSkillDraft("");
  };

  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const r = await updateProfile(values);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Profile saved");
        router.refresh();
      }
    });
  });

  const c = form.control;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>About you</CardTitle>
          <CardDescription>
            This is the verified profile the AI assistant is allowed to use. Keep it
            accurate.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              control={c}
              name="full_name"
              label="Full name"
              autoComplete="name"
            />
            <TextField
              control={c}
              name="portfolio_url"
              label="Portfolio URL"
              placeholder="https://…"
            />
            <TextField
              control={c}
              name="resume_url"
              label="Resume URL"
              placeholder="https://…"
            />
            <TextField
              control={c}
              name="linkedin_url"
              label="LinkedIn"
              placeholder="https://linkedin.com/in/…"
            />
            <TextField
              control={c}
              name="github_url"
              label="GitHub"
              placeholder="https://github.com/…"
            />
          </div>
          <TextareaField
            control={c}
            name="professional_summary"
            label="Professional summary"
            rows={4}
            placeholder="Two or three sentences about what you do and what you are looking for."
          />
          <Field>
            <FieldLabel htmlFor="skill-input">Skills</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="skill-input"
                value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)}
                placeholder="React, TypeScript, Figma…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addSkill}>
                <Plus /> Add
              </Button>
            </div>
            <FieldDescription>Press Enter or separate with commas.</FieldDescription>
            {skills.length ? (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1 pr-1">
                    {s}
                    <button
                      type="button"
                      aria-label={`Remove ${s}`}
                      className="rounded-full hover:bg-foreground/10"
                      onClick={() =>
                        form.setValue(
                          "skills",
                          skills.filter((x) => x !== s),
                          { shouldDirty: true },
                        )
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Experience</CardTitle>
          <CardDescription>
            Roles with highlights the AI can cite. Only what you write here will be used.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {experience.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No experience added yet.</p>
          ) : null}
          {experience.fields.map((f, i) => (
            <div key={f.id} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <TextField
                  control={c}
                  name={`experience.${i}.title`}
                  label="Title"
                  required
                />
                <TextField control={c} name={`experience.${i}.company`} label="Company" />
                <TextField
                  control={c}
                  name={`experience.${i}.start`}
                  label="Start"
                  placeholder="2023-01"
                />
                <TextField
                  control={c}
                  name={`experience.${i}.end`}
                  label="End"
                  placeholder="present"
                />
              </div>
              <Field>
                <FieldLabel htmlFor={`exp-${i}-highlights`}>
                  Highlights (one per line)
                </FieldLabel>
                <Textarea
                  id={`exp-${i}-highlights`}
                  rows={3}
                  defaultValue={(form.getValues(`experience.${i}.highlights`) ?? []).join(
                    "\n",
                  )}
                  onBlur={(e) =>
                    form.setValue(
                      `experience.${i}.highlights`,
                      e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      { shouldDirty: true },
                    )
                  }
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => experience.remove(i)}
                >
                  <Trash2 /> Remove
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              experience.append({
                title: "",
                company: "",
                start: "",
                end: "",
                highlights: [],
              })
            }
          >
            <Plus /> Add role
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>
            Verified work the AI can reference in letters and interview answers.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {projects.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects added yet.</p>
          ) : null}
          {projects.fields.map((f, i) => (
            <div key={f.id} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <TextField
                  control={c}
                  name={`projects.${i}.name`}
                  label="Name"
                  required
                />
                <TextField
                  control={c}
                  name={`projects.${i}.url`}
                  label="URL"
                  placeholder="https://…"
                />
              </div>
              <TextareaField
                control={c}
                name={`projects.${i}.description`}
                label="Description"
                rows={2}
              />
              <Field>
                <FieldLabel htmlFor={`proj-${i}-tech`}>
                  Technologies (comma separated)
                </FieldLabel>
                <Input
                  id={`proj-${i}-tech`}
                  defaultValue={(form.getValues(`projects.${i}.technologies`) ?? []).join(
                    ", ",
                  )}
                  onBlur={(e) =>
                    form.setValue(
                      `projects.${i}.technologies`,
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      { shouldDirty: true },
                    )
                  }
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => projects.remove(i)}
                >
                  <Trash2 /> Remove
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              projects.append({ name: "", description: "", url: "", technologies: [] })
            }
          >
            <Plus /> Add project
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
