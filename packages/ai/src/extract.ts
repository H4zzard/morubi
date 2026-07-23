// Extração de texto de arquivos enviados pelo gestor (base de conhecimento).
// Único ponto que sabe converter PDF/DOCX/TXT em texto puro.
import { extractRawText } from "mammoth";

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

/** Extrai texto puro de um arquivo (PDF, DOCX, TXT ou MD). */
export async function extractText(file: File): Promise<string> {
  const ext = extOf(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  switch (ext) {
    case ".pdf": {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text.trim();
      } finally {
        await parser.destroy();
      }
    }
    case ".docx": {
      const result = await extractRawText({ buffer });
      return result.value.trim();
    }
    case ".txt":
    case ".md":
      return buffer.toString("utf-8").trim();
    default:
      throw new Error(
        `Formato não suportado: ${ext || "desconhecido"}. Use PDF, DOCX, TXT ou MD.`,
      );
  }
}
