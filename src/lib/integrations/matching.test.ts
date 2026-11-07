import { describe, expect, it } from "vitest";

import { emailDomain, matchEmailToApplication, normalize } from "./matching";

const apps = [
  {
    id: "acme",
    company_name: "Acme Analytics Inc.",
    job_title: "Senior Frontend Engineer",
    contact_emails: ["jane@acmeanalytics.com"],
  },
  { id: "globex", company_name: "Globex", job_title: "React Developer" },
  { id: "initech", company_name: "Initech Ltd", job_title: "Frontend Engineer" },
];

describe("normalize / emailDomain", () => {
  it("strips legal suffixes and punctuation", () => {
    expect(normalize("Acme Analytics, Inc.")).toBe("acme analytics");
    expect(normalize("Initech Ltd")).toBe("initech");
  });
  it("extracts the sender domain", () => {
    expect(emailDomain("Jane <jane@AcmeAnalytics.com>")).toBe("acmeanalytics.com");
    expect(emailDomain(null)).toBeNull();
  });
});

describe("matchEmailToApplication", () => {
  it("matches a saved contact email with high confidence", () => {
    const r = matchEmailToApplication(
      { from_email: "jane@acmeanalytics.com", subject: "Next steps", text: "Hi!" },
      apps,
    );
    expect(r.applicationId).toBe("acme");
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("matches on sender domain + company name in the body", () => {
    const r = matchEmailToApplication(
      {
        from_email: "hr@globex.com",
        subject: "Interview invitation",
        text: "Thanks for applying to Globex.",
      },
      apps,
    );
    expect(r.applicationId).toBe("globex");
    expect(r.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("does not auto-link a generic sender with no company mention", () => {
    const r = matchEmailToApplication(
      { from_email: "someone@gmail.com", subject: "Hello", text: "Just checking in." },
      apps,
    );
    expect(r.applicationId).toBeNull();
  });

  it("uses the AI-extracted company when the body is vague", () => {
    const r = matchEmailToApplication(
      {
        from_email: "noreply@greenhouse.io",
        subject: "Your application",
        text: "Thank you for your interest.",
        extracted: { company: "Initech", job_title: "Frontend Engineer" },
      },
      apps,
    );
    expect(r.applicationId).toBe("initech");
  });

  it("asks the user when two applications are equally plausible", () => {
    const twins = [
      { id: "a", company_name: "Acme", job_title: "Engineer" },
      { id: "b", company_name: "Acme", job_title: "Designer" },
    ];
    const r = matchEmailToApplication(
      {
        from_email: "hr@acme.com",
        subject: "Acme interview",
        text: "Acme would like to meet.",
      },
      twins,
    );
    expect(r.applicationId).toBeNull();
    expect(r.alternatives.map((a) => a.id).sort()).toEqual(["a", "b"]);
    expect(r.reason).toMatch(/similar/);
  });

  it("handles an empty candidate list", () => {
    expect(
      matchEmailToApplication({ from_email: "x@y.com", subject: "", text: "" }, [])
        .applicationId,
    ).toBeNull();
  });
});
