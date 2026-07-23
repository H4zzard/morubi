import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { NavBar } from "@/components/nav-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.user) redirect("/onboarding");

  return (
    <div className="min-h-screen bg-graphite-950">
      <NavBar
        role={ctx.user.role}
        userName={ctx.user.name}
        tenantName={ctx.user.tenant.name}
      />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
