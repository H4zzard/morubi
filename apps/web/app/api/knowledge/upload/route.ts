import { extractText, SUPPORTED_EXTENSIONS } from "@morubi/ai";
import { requireRole } from "@/lib/auth";
import { createKnowledgeItem } from "@/lib/knowledge";
import { ok, fail, handle } from "@/lib/api-response";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 60;

export const OPTIONS = () => corsPreflight();

function titleFromFilename(filename: string): string {
  const i = filename.lastIndexOf(".");
  return (i === -1 ? filename : filename.slice(0, i)).trim() || filename;
}

/** Sobe um arquivo (PDF/DOCX/TXT/MD), extrai o texto e cria um item da base. */
export function POST(req: Request) {
  return handle(async () => {
    const { user } = await requireRole("GESTOR", req);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Arquivo ausente", 400);

    let content: string;
    try {
      content = await extractText(file);
    } catch (err) {
      return fail(
        err instanceof Error ? err.message : `Formato não suportado. Use: ${SUPPORTED_EXTENSIONS.join(", ")}`,
        422,
      );
    }

    if (!content.trim()) {
      return fail("Não foi possível extrair texto desse arquivo (pode estar vazio ou ser uma imagem escaneada)", 422);
    }
    if (content.length > 20000) {
      content = content.slice(0, 20000);
    }

    const dto = await createKnowledgeItem(user.tenantId, titleFromFilename(file.name), content);
    return ok(dto, 201);
  });
}
