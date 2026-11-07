import {
  BarChart3,
  Briefcase,
  CalendarClock,
  ClipboardList,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Sparkles,
  Users,
  BellRing,
  Inbox,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Short hint shown in the command palette. */
  hint?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        hint: "Overview and what's due",
      },
      {
        title: "Applications",
        href: "/applications",
        icon: Briefcase,
        hint: "All job applications",
      },
      {
        title: "Follow-ups",
        href: "/follow-ups",
        icon: BellRing,
        hint: "Due, overdue and upcoming",
      },
      {
        title: "Inbox",
        href: "/inbox",
        icon: Inbox,
        hint: "Recruiting emails to review",
      },
      {
        title: "Interviews",
        href: "/interviews",
        icon: CalendarClock,
        hint: "Scheduled interviews",
      },
      {
        title: "Assessments",
        href: "/assessments",
        icon: ClipboardList,
        hint: "Tests and take-home tasks",
      },
      {
        title: "Contacts",
        href: "/contacts",
        icon: Users,
        hint: "Recruiters and hiring managers",
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3,
        hint: "Conversion and compensation",
      },
    ],
  },
  {
    label: "Tools",
    items: [
      {
        title: "AI Assistant",
        href: "/ai",
        icon: Sparkles,
        hint: "Parse, analyse and draft",
      },
      {
        title: "Templates",
        href: "/templates",
        icon: FileText,
        hint: "Reusable messages",
      },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
        hint: "Profile and preferences",
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Human titles for path segments, used by breadcrumbs. */
export const SEGMENT_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  applications: "Applications",
  "follow-ups": "Follow-ups",
  inbox: "Inbox",
  integrations: "Integrations",
  interviews: "Interviews",
  assessments: "Assessments",
  contacts: "Contacts",
  analytics: "Analytics",
  ai: "AI Assistant",
  templates: "Templates",
  settings: "Settings",
  new: "New",
  edit: "Edit",
  compare: "Compare",
  account: "Account",
  profile: "Profile",
};

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
