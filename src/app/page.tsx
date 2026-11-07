import { redirect } from "next/navigation";

export default function RootPage() {
  // The proxy already redirects "/" based on session; this is the fallback.
  redirect("/dashboard");
}
