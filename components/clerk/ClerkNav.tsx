"use client";

import { useRouter } from "next/navigation";
import { signOutFirebase } from "@/lib/auth/firebase-client";
import { portalLogout } from "@/lib/auth/portal-client";
import { isUidAllowed } from "@/lib/auth/roles";
import { useFirebaseAuth } from "@/lib/auth/use-firebase-auth";
import { ResponsiveNav } from "@/components/layout/ResponsiveNav";

const staffLinks = [
  { href: "/clerk/closing-stock", label: "Closing Stock" },
  { href: "/clerk/recent-closes", label: "Recent close" },
  { href: "/clerk/stock-in", label: "Stock In" },
  { href: "/clerk/daily", label: "Today" },
];

export function ClerkNav() {
  const router = useRouter();
  const { user } = useFirebaseAuth();
  const isAdmin = isUidAllowed(user?.uid, "admin");
  const links = isAdmin
    ? [...staffLinks, { href: "/admin/dashboard", label: "Back to admin" }]
    : staffLinks;

  async function handleSignOut() {
    await portalLogout();
    await signOutFirebase();
    router.push("/");
  }

  return (
    <ResponsiveNav
      title="Merry Mary stock app"
      subtitle="Staff workspace"
      links={links}
      maxWidth="max-w-3xl"
      onSignOut={handleSignOut}
      trailing={
        user?.email ? (
          <span className="text-xs text-slate-500">{user.email}</span>
        ) : undefined
      }
    />
  );
}
