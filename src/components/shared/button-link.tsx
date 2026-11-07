import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";

type ButtonLinkProps = Omit<React.ComponentProps<"a">, "href"> &
  VariantProps<typeof buttonVariants> & {
    href: string;
    /**
     * Render a plain <a> (full page load) instead of next/link. Use it for API
     * routes, downloads and OAuth redirects, which client navigation can't handle.
     */
    native?: boolean;
  };

/**
 * A link that looks like a button. Navigation keeps real link semantics, so
 * screen readers announce "link" and middle-click/open-in-new-tab work, which
 * a Base UI Button rendered as an anchor (role="button") does not give.
 */
export function ButtonLink({
  href,
  native,
  variant,
  size,
  className,
  ...props
}: ButtonLinkProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (native) return <a data-slot="button" href={href} className={classes} {...props} />;
  return <Link data-slot="button" href={href} className={classes} {...props} />;
}
