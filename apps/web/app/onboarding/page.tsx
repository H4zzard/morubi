import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createCompany } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default async function OnboardingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-graphite-950 px-4">
      <div className="w-full max-w-md">
        <h1 className="mb-1 text-2xl font-semibold text-ink-100">Vamos configurar sua empresa</h1>
        <p className="mb-6 text-sm text-ink-400">
          Você será o gestor. Depois você convida seus vendedores e sobe a base de conhecimento.
        </p>
        <Card>
          <form action={createCompany} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="companyName">Nome da empresa</Label>
              <Input id="companyName" name="companyName" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="segment">Segmento (opcional)</Label>
              <Input id="segment" name="segment" placeholder="Ex.: SaaS B2B, imóveis, seguros" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="userName">Seu nome</Label>
              <Input id="userName" name="userName" defaultValue={ctx.identity.email.split("@")[0]} />
            </div>
            <Button type="submit" className="w-full">
              Criar empresa e continuar
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
