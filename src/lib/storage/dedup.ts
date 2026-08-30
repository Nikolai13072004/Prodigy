import { createHash, randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { copyFile, mkdir, rename, rm } from "fs/promises";
import path from "path";
import { Transform, type Readable } from "stream";
import { pipeline } from "stream/promises";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { storage, type StorageArea, type StorageObject } from "@/lib/storage";

type StorageMetadataInput = {
  mimeType?: string | null;
  originalName?: string | null;
  purpose?: string | null;
  extension?: string | null;
};

export type DedupStorageResult = {
  object: StorageObject;
  sha256: string;
  sizeBytes: number;
  deduplicated: boolean;
};

export function normalizeExtension(value: string | null | undefined, key: string) {
  const extension = (value || path.extname(key) || "").trim().toLowerCase();
  return extension.startsWith(".") ? extension : extension ? `.${extension}` : "";
}

function toObject(area: StorageArea, key: string): StorageObject {
  return {
    area,
    key,
    url: storage.url(area, key),
    absolutePath: storage.path(area, key),
  };
}

function isKnownRequestError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isNodeError(error: unknown, code: string) {
  return error && typeof error === "object" && "code" in error && error.code === code;
}

async function deleteStorageFileRecordById(id: string) {
  await prisma.storageFile.delete({ where: { id } }).catch((error) => {
    if (!isKnownRequestError(error, "P2025")) throw error;
  });
}

export async function deleteStorageFileRecord(area: StorageArea, key: string) {
  await prisma.storageFile.deleteMany({
    where: {
      area,
      key,
    },
  });
}

export async function deleteStorageFileRecordsByIds(ids: string[]) {
  if (ids.length === 0) return 0;
  const result = await prisma.storageFile.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });
  return result.count;
}

function storageTempPath(area: StorageArea, extension: string) {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "storage-tmp",
    area,
    `${randomUUID()}${extension}`,
  );
}

async function moveTempFile(tempPath: string, targetPath: string) {
  try {
    await rename(tempPath, targetPath);
  } catch (error) {
    if (!isNodeError(error, "EXDEV")) throw error;
    await copyFile(tempPath, targetPath);
    await rm(tempPath, { force: true });
  }
}

async function hashStorageObject(object: StorageObject) {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const hasher = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      sizeBytes += chunk.byteLength;
      callback();
    },
  });

  await pipeline(storage.stream(object.area, object.key), hasher);
  return {
    sha256: hash.digest("hex"),
    sizeBytes,
  };
}

async function existingFileForHash(area: StorageArea, sha256: string, sizeBytes: number, extension: string) {
  const existing = await prisma.storageFile.findFirst({
    where: {
      area,
      sha256,
      sizeBytes: BigInt(sizeBytes),
      extension,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
  if (!existing) return null;

  try {
    const info = await storage.stat(area, existing.key);
    if (!info.isFile()) {
      await deleteStorageFileRecordById(existing.id);
      return null;
    }
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      await deleteStorageFileRecordById(existing.id);
      return null;
    }
    throw error;
  }

  await prisma.storageFile.update({
    where: { id: existing.id },
    data: { lastSeenAt: new Date() },
  });

  return toObject(area, existing.key);
}

async function recordStorageFile(
  object: StorageObject,
  sha256: string,
  sizeBytes: number,
  metadata: StorageMetadataInput,
) {
  const extension = normalizeExtension(metadata.extension, object.key);
  const data = {
    area: object.area,
    key: object.key,
    url: object.url,
    sha256,
    sizeBytes: BigInt(sizeBytes),
    extension,
    mimeType: metadata.mimeType || null,
    originalName: metadata.originalName || null,
    purpose: metadata.purpose || null,
    lastSeenAt: new Date(),
  };

  try {
    await prisma.storageFile.upsert({
      where: { key: object.key },
      create: data,
      update: data,
    });
  } catch (error) {
    if (!isKnownRequestError(error, "P2002")) throw error;
    const existing = await existingFileForHash(object.area, sha256, sizeBytes, extension);
    if (existing) return existing;

    await prisma.storageFile.upsert({
      where: { key: object.key },
      create: data,
      update: data,
    });
  }

  return object;
}

export async function indexStorageFile(
  area: StorageArea,
  key: string,
  metadata: StorageMetadataInput = {},
) {
  const object = toObject(area, key);
  const { sha256, sizeBytes } = await hashStorageObject(object);
  const extension = normalizeExtension(metadata.extension, key);

  // Запись этого ключа могла устареть: после восстановления тома файл под тем
  // же именем содержит другие байты. Такую запись надо убрать до того, как
  // индексация признает файл дубликатом чужого содержимого — иначе она
  // переживёт проход, и последующая загрузка её прежнего содержимого
  // дедуплицируется на этот файл, вернув пользователю не те байты.
  const recordedForKey = await prisma.storageFile.findUnique({ where: { key: object.key } });
  if (recordedForKey && recordedForKey.sha256 !== sha256) {
    await prisma.storageFile.delete({ where: { id: recordedForKey.id } });
  }

  const existing = await existingFileForHash(area, sha256, sizeBytes, extension);
  if (existing && existing.key !== object.key) {
    return {
      object: existing,
      sha256,
      sizeBytes,
      deduplicated: true,
    } satisfies DedupStorageResult;
  }

  await recordStorageFile(object, sha256, sizeBytes, metadata);
  return {
    object,
    sha256,
    sizeBytes,
    deduplicated: false,
  } satisfies DedupStorageResult;
}

export async function putBufferDedup(
  area: StorageArea,
  key: string,
  data: Buffer | string,
  metadata: StorageMetadataInput = {},
): Promise<DedupStorageResult> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const extension = normalizeExtension(metadata.extension, key);
  const existing = await existingFileForHash(area, sha256, buffer.byteLength, extension);
  if (existing) {
    return {
      object: existing,
      sha256,
      sizeBytes: buffer.byteLength,
      deduplicated: true,
    };
  }

  const object = await storage.put(area, key, buffer);
  const recordedObject = await recordStorageFile(object, sha256, buffer.byteLength, metadata);
  return {
    object: recordedObject,
    sha256,
    sizeBytes: buffer.byteLength,
    deduplicated: recordedObject.key !== object.key,
  };
}

export async function putStreamDedup(
  area: StorageArea,
  key: string,
  stream: Readable,
  metadata: StorageMetadataInput = {},
): Promise<DedupStorageResult> {
  const tempPath = storageTempPath(area, normalizeExtension(metadata.extension, key));
  await mkdir(path.dirname(tempPath), { recursive: true });

  const hash = createHash("sha256");
  let sizeBytes = 0;
  const hasher = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      sizeBytes += chunk.byteLength;
      callback(null, chunk);
    },
  });

  try {
    await pipeline(stream, hasher, createWriteStream(tempPath));
    const sha256 = hash.digest("hex");
    const extension = normalizeExtension(metadata.extension, key);
    const existing = await existingFileForHash(area, sha256, sizeBytes, extension);
    if (existing) {
      await rm(tempPath, { force: true });
      return {
        object: existing,
        sha256,
        sizeBytes,
        deduplicated: true,
      };
    }

    const object = toObject(area, key);
    await mkdir(path.dirname(object.absolutePath), { recursive: true });
    await moveTempFile(tempPath, object.absolutePath);
    const recordedObject = await recordStorageFile(object, sha256, sizeBytes, metadata);
    if (recordedObject.key !== object.key) {
      await rm(object.absolutePath, { force: true });
    }

    return {
      object: recordedObject,
      sha256,
      sizeBytes,
      deduplicated: recordedObject.key !== object.key,
    };
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
