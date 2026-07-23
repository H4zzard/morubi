import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pacotes do monorepo transpilados pelo Next (código TS não pré-compilado).
  transpilePackages: ["@morubi/ai", "@morubi/api-client", "@morubi/db", "@morubi/ui-tokens"],
  // @prisma/client roda no server (binário nativo); mantê-lo externo ao bundle.
  serverExternalPackages: ["@prisma/client"],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
};

// withSentryConfig é seguro sem DSN/authToken: sem authToken ele só pula o
// upload de source maps (um aviso), não quebra o build.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  disableLogger: true,
  // Não injetar o plugin do Sentry no bundle quando não há DSN configurada.
  autoInstrumentServerFunctions: !!process.env.SENTRY_DSN,
});
