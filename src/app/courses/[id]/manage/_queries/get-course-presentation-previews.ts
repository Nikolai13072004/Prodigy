import "server-only";

import { stat } from "fs/promises";
import path from "path";

const UPLOADS_ROOT = path.resolve(process.cwd(), "public", "uploads");

export async function getCoursePresentationPreviewUrls(
  items: Array<{ id: string; fileUrl: string | null }>
) {
  return new Map(
    await Promise.all(
      items.map(async (item) => [item.id, await getExistingPresentationSourcePdfUrl(item.fileUrl)] as const)
    )
  );
}

async function getExistingPresentationSourcePdfUrl(fileUrl: string | null) {
  if (!fileUrl?.startsWith("/uploads/")) return null;
  if (/\.pdf(\?|#|$)/i.test(fileUrl)) {
    return (await localUploadExists(fileUrl)) ? fileUrl : null;
  }
  if (/\.pptx(\?|#|$)/i.test(fileUrl)) {
    const previewUrl = fileUrl.replace(/\.pptx(\?|#|$)/i, ".pdf$1");
    return (await localUploadExists(previewUrl)) ? previewUrl : null;
  }
  return null;
}

async function localUploadExists(fileUrl: string) {
  const filePath = resolveLocalUploadPath(fileUrl);
  if (!filePath) return false;
  const info = await stat(filePath).catch(() => null);
  return Boolean(info?.isFile());
}

function resolveLocalUploadPath(fileUrl: string) {
  if (!fileUrl.startsWith("/uploads/")) return null;
  const cleanUrl = fileUrl.split(/[?#]/, 1)[0] ?? "";
  const relative = cleanUrl.replace(/^\/uploads\/?/, "");
  let decodedRelative = relative;
  try {
    decodedRelative = decodeURIComponent(relative);
  } catch {
    return null;
  }

  const filePath = path.resolve(UPLOADS_ROOT, decodedRelative);
  if (!filePath.startsWith(`${UPLOADS_ROOT}${path.sep}`)) return null;
  return filePath;
}
