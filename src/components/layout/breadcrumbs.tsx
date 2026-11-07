"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SEGMENT_TITLES } from "@/lib/navigation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Breadcrumbs derived from the pathname. Detail pages can override the last
 * crumb (for example the application name) via the `leaf` prop set by the page.
 */
export function Breadcrumbs({ leaf }: { leaf?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;
    const title = UUID_RE.test(seg)
      ? (isLast && leaf) || "Detail"
      : (SEGMENT_TITLES[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1));
    return { href, title: isLast && leaf ? leaf : title, isLast };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList className="sm:gap-1.5">
        {crumbs.map((c, i) => (
          <Fragment key={c.href}>
            {i > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem
              className={i < crumbs.length - 1 ? "hidden sm:inline-flex" : undefined}
            >
              {c.isLast ? (
                <BreadcrumbPage className="max-w-[40vw] truncate font-medium">
                  {c.title}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={c.href} />}>{c.title}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
