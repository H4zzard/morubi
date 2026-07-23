import { LogoMark } from "@morubi/ui-tokens/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-graphite-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <LogoMark className="mx-auto mb-3 h-12 w-12 text-brand-500" />
          <h1 className="text-xl font-semibold text-ink-100">Morubi</h1>
          <p className="mt-1 text-sm text-ink-400">Seu gerente comercial de IA</p>
        </div>
        {children}
      </div>
    </div>
  );
}
