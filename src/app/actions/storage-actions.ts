"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import { requirePlatformAdmin } from "@/lib/auth-guards";
import { storage } from "@/lib/storage";
import { deleteStorageFileRecord, deleteStorageFileRecordsByIds } from "@/lib/storage/dedup";
import { getStorageFileByUrl, getStorageOverview, resolveStorageTarget } from "@/lib/storage-overview";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

type StorageReturnState = {
  q?: string;
  category?: string;
  area?: string;
  file?: string | null;
  notice?: string;
  error?: string;
};

function readReturnState(formData: FormData): StorageReturnState {
  return {
    q: asString(formData, "returnQ"),
    category: asString(formData, "returnCategory"),
    area: asString(formData, "returnArea"),
    file: asString(formData, "returnFile"),
  };
}

function buildStorageUrl(params?: StorageReturnState) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.category && params.category !== "all") search.set("category", params.category);
  if (params?.area && params.area !== "all") search.set("area", params.area);
  if (params?.file) search.set("file", params.file);
  if (params?.notice) search.set("notice", params.notice);
  if (params?.error) search.set("error", params.error);
  const query = search.toString();
  return query ? `/admin/storage?${query}` : "/admin/storage";
}

function redirectWithError(message: string, state?: StorageReturnState): never {
  redirect(buildStorageUrl({ ...state, error: message }));
}

function redirectWithNotice(message: string, state?: StorageReturnState): never {
  redirect(buildStorageUrl({ ...state, notice: message }));
}

async function deleteFileFromDisk(urlValue: string) {
  const target = resolveStorageTarget(urlValue);
  if (!target) {
    throw new Error("Недопустимый путь к файлу.");
  }

  try {
    await storage.delete(target.storageArea, target.relativePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  await deleteStorageFileRecord(target.storageArea, target.relativePath);
  return target;
}

export async function deleteStorageFile(formData: FormData) {
  const session = await requirePlatformAdmin();
  const url = asString(formData, "url");
  const returnState = readReturnState(formData);
  if (!url) {
    redirectWithError("Не удалось определить файл для удаления.", returnState);
  }

  const file = await getStorageFileByUrl(url);
  if (!file) {
    redirectWithError("Файл не найден в инвентаре хранилища.", returnState);
  }
  if (file.isReferenced) {
    redirectWithError(`Файл «${file.fileName}» сейчас используется и не может быть удален.`, returnState);
  }

  try {
    await deleteFileFromDisk(file.url);
  } catch (error) {
    console.error("Failed to delete storage file", error);
    redirectWithError(`Не удалось удалить файл «${file.fileName}». Попробуйте еще раз.`, returnState);
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "storage:delete_file",
    objectType: "storage_file",
    objectId: file.url,
    objectLabel: file.fileName,
    metadata: {
      url: file.url,
      relativePath: file.relativePath,
      storageArea: file.storageArea,
      category: file.category,
      sizeBytes: file.sizeBytes,
    },
  });

  revalidatePath("/admin/storage");
  redirectWithNotice(`Файл «${file.fileName}» удален.`, {
    ...returnState,
    file: returnState.file === file.url ? null : returnState.file,
  });
}

export async function deleteOrphanStorageFiles(formData?: FormData) {
  const session = await requirePlatformAdmin();
  const returnState = formData ? readReturnState(formData) : undefined;
  const overview = await getStorageOverview();
  const orphanFiles = overview.orphanFiles;

  if (orphanFiles.length === 0) {
    redirectWithNotice("Сиротских файлов для очистки не найдено.", returnState);
  }

  const deletedFiles: Array<{
    fileName: string;
    url: string;
    sizeBytes: number;
    storageArea: string;
  }> = [];
  const failedFiles: string[] = [];

  for (const file of orphanFiles) {
    try {
      await deleteFileFromDisk(file.url);
      deletedFiles.push({
        fileName: file.fileName,
        url: file.url,
        sizeBytes: file.sizeBytes,
        storageArea: file.storageArea,
      });
    } catch (error) {
      console.error("Failed to delete orphan storage file", file.url, error);
      failedFiles.push(file.fileName);
    }
  }

  if (deletedFiles.length > 0) {
    await recordAuditEvent({
      actor: auditActorFromSessionUser(session.user),
      action: "storage:cleanup_orphans",
      objectType: "storage_file_batch",
      objectLabel: "orphan_cleanup",
      metadata: {
        deletedCount: deletedFiles.length,
        failedCount: failedFiles.length,
        deletedSizeBytes: deletedFiles.reduce((sum, file) => sum + file.sizeBytes, 0),
        deletedFiles: deletedFiles.slice(0, 50),
        failedFiles: failedFiles.slice(0, 50),
      },
    });
  }

  revalidatePath("/admin/storage");

  if (deletedFiles.length === 0) {
    redirectWithError("Не удалось удалить сиротские файлы. Проверьте логи сервера.", returnState);
  }

  const notice =
    failedFiles.length > 0
      ? `Удалено сиротских файлов: ${deletedFiles.length}. Не удалось удалить: ${failedFiles.length}.`
      : `Удалено сиротских файлов: ${deletedFiles.length}.`;
  redirectWithNotice(notice, { ...returnState, file: null });
}

export async function deleteMissingStorageFileRecords(formData?: FormData) {
  const session = await requirePlatformAdmin();
  const returnState = formData ? readReturnState(formData) : undefined;
  const overview = await getStorageOverview();
  const metadataOrphans = overview.metadataOrphans;

  if (metadataOrphans.length === 0) {
    redirectWithNotice("Битых записей индекса StorageFile не найдено.", returnState);
  }

  const deletedCount = await deleteStorageFileRecordsByIds(metadataOrphans.map((item) => item.id));

  if (deletedCount > 0) {
    await recordAuditEvent({
      actor: auditActorFromSessionUser(session.user),
      action: "storage:cleanup_missing_metadata",
      objectType: "storage_file_metadata_batch",
      objectLabel: "missing_file_metadata_cleanup",
      metadata: {
        deletedCount,
        records: metadataOrphans.slice(0, 50).map((item) => ({
          area: item.storageArea,
          key: item.relativePath,
          url: item.url,
          sizeBytes: item.sizeBytes,
        })),
      },
    });
  }

  revalidatePath("/admin/storage");

  if (deletedCount === 0) {
    redirectWithError("Не удалось удалить битые записи индекса. Проверьте логи сервера.", returnState);
  }

  redirectWithNotice(`Удалено битых записей индекса StorageFile: ${deletedCount}.`, {
    ...returnState,
    file: null,
  });
}
