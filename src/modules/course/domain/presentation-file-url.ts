import type { PresentationViewMode } from "@/lib/constants";

// Чистая деривация кандидатов файла презентации из preview-URL (без обращения к ФС).
// Правило PPTX↔PDF: для режима PPTX_HTML5 сначала пробуем одноимённый .pptx рядом с .pdf-превью,
// затем сам preview-URL. Проверку существования файла делает транспорт, идя по кандидатам по порядку.
export function presentationFileUrlCandidates(
  previewUrl: string,
  viewMode: PresentationViewMode,
): string[] {
  const candidates: string[] = [];
  if (viewMode === "PPTX_HTML5" && /\.pdf(\?|#|$)/i.test(previewUrl)) {
    candidates.push(previewUrl.replace(/\.pdf(\?|#|$)/i, ".pptx$1"));
  }
  candidates.push(previewUrl);
  return candidates;
}
