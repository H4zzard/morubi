"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@morubi/api-client";
import { LogoMark } from "@morubi/ui-tokens/logo";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const LINKS: { href: string; label: string; gestorOnly?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/coaching", label: "Coaching", gestorOnly: true },
  { href: "/knowledge", label: "Base de conhecimento", gestorOnly: true },
  { href: "/sellers", label: "Vendedores", gestorOnly: true },
  { href: "/corrections", label: "Curadoria", gestorOnly: true },
];

export function NavBar({
  role,
  userName,
  tenantName,
}: {
  role: Role;
  userName: string;
  tenantName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createSupabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const links = LINKS.filter((l) => !l.gestorOnly || role === "GESTOR");

  return (
    <header className="border-b border-graphite-800 bg-graphite-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <LogoMark className="h-7 w-7 text-brand-500" />
            <span className="text-sm font-semibold text-ink-100">{tenantName}</span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  pathname.startsWith(l.href)
                    ? "bg-graphite-700 text-ink-100"
                    : "text-ink-400 hover:text-ink-100",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm text-ink-200">{userName}</div>
            <Badge tone={role === "GESTOR" ? "success" : "default"}>{role}</Badge>
          </div>
          <Link
            href="/update-password"
            className="text-sm text-ink-400 hover:text-ink-100"
            title="Trocar senha"
          >
            Senha
          </Link>
          <button onClick={signOut} className="text-sm text-ink-400 hover:text-ink-100">
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
