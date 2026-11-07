import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ParsedJob } from "@/lib/ai/types";
import { formatLocation, valuesFromParsed } from "@/lib/parsed-job";
import type { QuickApplicationInput } from "@/lib/validations/application";

import { extractJobPage, looksLikeUrl, platformFromUrl } from "./extract";
import { isPrivateAddress } from "./fetch";
import { buildParseInput, hasUsefulContent, mergeParsedJob } from "./merge";

const JOB_HTML = `<!doctype html><html><head>
<title>Customer Success Associate - Bluebird | LinkedIn</title>
<meta property="og:title" content="Bluebird hiring Customer Success Associate">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"LinkedIn"},
{"@type":"JobPosting","title":"Customer Success Associate",
 "hiringOrganization":{"@type":"Organization","name":"Bluebird Logistics"},
 "employmentType":["FULL_TIME"],
 "jobLocationType":"TELECOMMUTE",
 "applicantLocationRequirements":{"@type":"Country","name":"Philippines"},
 "baseSalary":{"@type":"MonetaryAmount","currency":"php","value":{"@type":"QuantitativeValue","minValue":"30000","maxValue":35000,"unitText":"MONTH"}},
 "description":"&lt;p&gt;Help customers succeed.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Answer tickets in Zendesk&lt;/li&gt;&lt;li&gt;Night shift&lt;/li&gt;&lt;/ul&gt;",
 "skills":"Zendesk; Written English",
 "experienceRequirements":"2+ years of customer support",
 "url":"https://bluebird.example/jobs/42"}]}
</script></head>
<body><nav>Home Jobs Sign in</nav><main><h1>Customer Success Associate</h1>
<p>Bluebird Logistics &middot; Remote</p></main><footer>&copy; 2026</footer></body></html>`;

describe("extractJobPage", () => {
  it("reads schema.org JobPosting markup, including @graph and HTML descriptions", () => {
    const page = extractJobPage(JOB_HTML);
    expect(page.pageTitle).toBe("Bluebird hiring Customer Success Associate");
    expect(page.structured).toMatchObject({
      title: "Customer Success Associate",
      company: "Bluebird Logistics",
      location: "Philippines",
      work_arrangement: "remote",
      employment_type: "full_time",
      salary_min: 30000,
      salary_max: 35000,
      currency: "PHP",
      rate_type: "monthly",
      skills: ["Zendesk", "Written English"],
      qualifications: ["2+ years of customer support"],
      application_url: "https://bluebird.example/jobs/42",
    });
    expect(page.structured?.description).toContain("Answer tickets in Zendesk");
    expect(page.structured?.description).not.toContain("<");
  });

  it("keeps page text but drops navigation and footer", () => {
    const page = extractJobPage(JOB_HTML);
    expect(page.text).toContain("Bluebird Logistics · Remote");
    expect(page.text).not.toContain("Sign in");
    expect(page.text).not.toContain("2026");
  });

  it("returns no structured data when the page has none", () => {
    const page = extractJobPage("<html><body><p>Just a page</p></body></html>");
    expect(page.structured).toBeNull();
    expect(hasUsefulContent(page)).toBe(false);
  });

  it("reads a physical job location and a single salary value", () => {
    const page =
      extractJobPage(`<script type="application/ld+json">{"@type":"JobPosting","title":"Dev",
      "jobLocation":[{"@type":"Place","address":{"addressLocality":"Makati","addressRegion":"Metro Manila","addressCountry":{"name":"PH"}}}],
      "baseSalary":{"currency":"USD","value":{"value":12.5,"unitText":"HOUR"}}}</script>`);
    expect(page.structured).toMatchObject({
      location: "Makati, Metro Manila, PH",
      work_arrangement: null,
      salary_min: 12.5,
      salary_max: null,
      rate_type: "hourly",
    });
  });
});

const aiResult: ParsedJob = {
  company: "LinkedIn",
  job_title: "CS Associate",
  location: null,
  responsibilities: ["Answer tickets"],
  required_skills: ["zendesk", "Excel"],
  preferred_skills: [],
  salary_min: 600,
  salary_max: null,
  currency: "USD",
  rate_type: "monthly",
  hours_per_week: 40,
  working_hours: "Night shift",
  timezone: null,
  employment_type: null,
  work_arrangement: null,
  qualifications: [],
  application_url: null,
  application_instructions: null,
  required_subject_line: null,
  screening_questions: [],
  required_links_or_assessments: [],
  summary: "Support role.",
};

describe("mergeParsedJob", () => {
  const page = extractJobPage(JOB_HTML);
  const url = "https://www.linkedin.com/jobs/view/42";

  it("prefers employer markup and never uses the job board as the company", () => {
    const merged = mergeParsedJob(aiResult, page, url);
    expect(merged.company).toBe("Bluebird Logistics");
    expect(merged.job_title).toBe("Customer Success Associate");
    expect(merged.work_arrangement).toBe("remote");
    expect(merged.platform).toBe("LinkedIn");
    expect(merged.source_url).toBe(url);
    // Pay comes from one source only: the markup range, not the AI's USD figure.
    expect(merged).toMatchObject({
      salary_min: 30000,
      salary_max: 35000,
      currency: "PHP",
      rate_type: "monthly",
    });
    // AI fills what the markup lacks; duplicates (case-insensitive) are removed.
    expect(merged.hours_per_week).toBe(40);
    expect(merged.required_skills).toEqual(["Zendesk", "Written English", "Excel"]);
    expect(merged.job_description).toContain("Answer tickets in Zendesk");
  });

  it("drops a job-board company even without markup", () => {
    const bare = extractJobPage(`<body><main>${"Job text. ".repeat(60)}</main></body>`);
    expect(mergeParsedJob(aiResult, bare, url).company).toBeNull();
  });

  it("puts markup facts and page text in the AI input", () => {
    const input = buildParseInput(page, url);
    expect(input).toContain("SOURCE URL: https://www.linkedin.com/jobs/view/42");
    expect(input).toContain('"company": "Bluebird Logistics"');
    expect(input).toContain("PAGE TEXT:");
  });
});

describe("URL helpers", () => {
  it("detects a pasted link", () => {
    expect(looksLikeUrl("  https://jobs.lever.co/acme/123  ")).toBe(true);
    expect(looksLikeUrl("Apply at https://x.com today")).toBe(false);
    expect(looksLikeUrl("ftp://x.com/job")).toBe(false);
  });
  it("names the job site", () => {
    expect(platformFromUrl("https://ph.indeed.com/viewjob?jk=1")).toBe("Indeed");
    expect(platformFromUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe(
      "Greenhouse",
    );
    expect(platformFromUrl("https://careers.acme.com/job/1")).toBe("careers.acme.com");
  });
  it("blocks private and internal addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "104.18.0.1", "2606:4700::1111"])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("valuesFromParsed", () => {
  const base: QuickApplicationInput = {
    company_name: "",
    job_title: "",
    job_url: "",
    platform: "",
    location: "",
    employment_type: null,
    status: "saved",
    applied_at: "",
    offered_rate: "",
    proposed_rate: "",
    currency: "USD",
    rate_type: "hourly",
    hours_per_week: 40,
    job_description: "",
    timezone: "Asia/Manila",
    notes: "",
  };

  it("fills link, site, location, description and skills from a parsed link", () => {
    const merged = mergeParsedJob(
      aiResult,
      extractJobPage(JOB_HTML),
      "https://www.linkedin.com/jobs/view/42",
    );
    const v = valuesFromParsed(base, merged, "https://www.linkedin.com/jobs/view/42");
    expect(v).toMatchObject({
      company_name: "Bluebird Logistics",
      job_url: "https://www.linkedin.com/jobs/view/42",
      platform: "LinkedIn",
      location: "Remote · Philippines",
      employment_type: "full_time",
      currency: "PHP",
      rate_type: "monthly",
      offered_rate: 30000,
    });
    expect(v.job_description).toContain("Answer tickets in Zendesk");
    expect(v.notes).toContain("Required skills:\n- Zendesk");
    expect(v.notes).toContain("Qualifications:\n- 2+ years of customer support");
  });

  it("leaves unknown fields as they were instead of guessing", () => {
    const v = valuesFromParsed(
      base,
      { ...aiResult, company: null, salary_min: null },
      "x".repeat(60),
    );
    expect(v.company_name).toBe("");
    expect(v.offered_rate).toBe("");
    expect(v.location).toBe("");
    expect(v.job_url).toBe("");
    expect(v.timezone).toBe("Asia/Manila");
  });

  it("formats work arrangement into the location", () => {
    expect(formatLocation("hybrid", "Makati")).toBe("Hybrid · Makati");
    expect(formatLocation("remote", "Remote, US")).toBe("Remote, US");
    expect(formatLocation("onsite", null)).toBe("On-site");
    expect(formatLocation(null, null)).toBeNull();
  });
});
