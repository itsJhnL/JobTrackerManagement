import { describe, expect, it } from "vitest";

import { detectInterview, guessCompany, platformFromMeetingUrl } from "./calendar-detect";

const apps = [
  {
    id: "acme",
    company_name: "Acme Analytics Inc.",
    job_title: "Frontend Engineer",
    contact_emails: ["jane@acmeanalytics.com"],
  },
  { id: "bluebird", company_name: "Bluebird Logistics", job_title: "CS Associate" },
  { id: "globex", company_name: "Globex", job_title: "React Developer" },
];

const base = { description: null, location: null, meetingUrl: null, allDay: false };

describe("detectInterview", () => {
  it("tracks an interview invite that names an applied company", () => {
    const d = detectInterview(
      {
        ...base,
        summary: "Interview: Bluebird Logistics - Customer Success",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        organizer: { email: "talent@bluebird-logistics.com", displayName: "Maria Cruz" },
        attendees: [
          { email: "me@gmail.com", self: true },
          { email: "talent@bluebird-logistics.com", displayName: "Maria Cruz" },
        ],
      },
      apps,
    );
    expect(d).toMatchObject({
      isInterview: true,
      autoTrack: true,
      applicationId: "bluebird",
      platform: "Google Meet",
      interviewer: "Maria Cruz",
      interviewType: "video",
    });
  });

  it("tracks an invite from a saved recruiter even without the word interview", () => {
    const d = detectInterview(
      {
        ...base,
        summary: "Chat with Jane",
        meetingUrl: "https://acme.zoom.us/j/123",
        organizer: { email: "jane@acmeanalytics.com" },
      },
      apps,
    );
    expect(d).toMatchObject({
      isInterview: true,
      autoTrack: true,
      applicationId: "acme",
    });
    expect(d.platform).toBe("Zoom");
  });

  it("classifies the interview stage from the title", () => {
    const t = (summary: string) =>
      detectInterview({ ...base, summary: `${summary} - Globex` }, apps).interviewType;
    expect(t("Technical interview")).toBe("technical");
    expect(t("Final round interview")).toBe("final");
    expect(t("Panel interview")).toBe("panel");
    expect(t("Phone screen")).toBe("phone_screen");
    expect(t("Behavioral interview")).toBe("behavioral");
  });

  it("suggests, but does not auto-track, an interview with no matching application", () => {
    const d = detectInterview(
      {
        ...base,
        summary: "Interview with Initech",
        meetingUrl: "https://teams.microsoft.com/l/meetup-join/1",
        organizer: { email: "hr@initech.io" },
      },
      apps,
    );
    expect(d).toMatchObject({
      isInterview: true,
      autoTrack: false,
      applicationId: null,
      platform: "Microsoft Teams",
      companyGuess: "Initech",
    });
  });

  it("ignores personal and routine events", () => {
    for (const summary of ["Dentist", "Team standup", "Lunch with Globex friends", "Gym"])
      expect(detectInterview({ ...base, summary }, apps).isInterview, summary).toBe(
        false,
      );
    expect(
      detectInterview({ ...base, summary: "Globex interview", allDay: true }, apps)
        .isInterview,
    ).toBe(false);
  });

  it("does not auto-track when the company match is ambiguous", () => {
    const d = detectInterview({ ...base, summary: "Interview" }, [
      { id: "a", company_name: "Nova", job_title: "Dev" },
      { id: "b", company_name: "Nova", job_title: "QA" },
    ]);
    expect(d.autoTrack).toBe(false);
  });
});

describe("helpers", () => {
  it("guesses the company from the organizer domain or title", () => {
    expect(
      guessCompany({
        ...base,
        summary: "Call",
        organizer: { email: "a@careers.initech.co.uk" },
      }),
    ).toBe("Initech");
    expect(guessCompany({ ...base, summary: "Hooli - Phone interview" })).toBe("Hooli");
    expect(guessCompany({ ...base, summary: "Interview at Pied Piper" })).toBe(
      "Pied Piper",
    );
    expect(
      guessCompany({
        ...base,
        summary: "Interview",
        organizer: { email: "x@gmail.com" },
      }),
    ).toBeNull();
  });

  it("names meeting platforms", () => {
    expect(platformFromMeetingUrl("https://us02web.zoom.us/j/1")).toBe("Zoom");
    expect(platformFromMeetingUrl(null, "We'll call you at 9")).toBe("Phone");
    expect(platformFromMeetingUrl(null)).toBeNull();
  });
});
