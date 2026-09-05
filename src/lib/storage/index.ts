import { createReadStream, createWriteStream } from "fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises";
import path from "path";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";

export type StorageArea = "uploads" | "branding";

export type StorageObject = {
  area: StorageArea;
  key: string;
  url: string;
  absolutePath: string;
};

export type StorageListEntry = StorageObject & {
  sizeBytes: number;
  modifiedAt: Date;
};

const STORAGE_ROOTS: Record<StorageArea, { rootDir: string; publicBaseUrl: string }> = {
  // uploads физически ВНЕ `public/`: файлы в `public/` Next отдаёт статикой
  // раньше, чем срабатывает route handler `app/uploads/[...path]/route.ts`,
  // поэтому авторизация и CSP из роута обходятся, пока корень в public.
  // URL остаётся `/uploads/...` (publicBaseUrl), но единственный путь к байтам —
  // через роут, где стоит проверка доступа. `data/` уже используется хранилищем
  // (`data/storage-tmp`); в docker сюда монтируется том `lms_uploads`.
  uploads: {
    rootDir: path.join(/* turbopackIgnore: true */ process.cwd(), "data", "uploads"),
    publicBaseUrl: "/uploads",
  },
  // branding остаётся в public/: логотипы публичны (страница входа), а защита
  // от исполнения SVG сделана заголовками в next.config.ts (headers() работает
  // и для статики public/ — "checked before the filesystem").
  branding: {
    rootDir: path.join(/* turbopackIgnore: true */ process.cwd(), "public", "branding"),
    publicBaseUrl: "/branding",
  },
};

function normalizeKey(key: string) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === ".." || segment.includes("\0"))
  ) {
    throw new Error("Invalid storage key");
  }

  return segments.join("/");
}

function resolvePath(area: StorageArea, key: string) {
  const normalizedKey = normalizeKey(key);
  const rootDir = path.resolve(STORAGE_ROOTS[area].rootDir);
  const absolutePath = path.resolve(rootDir, ...normalizedKey.split("/"));
  const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  if (!absolutePath.startsWith(rootPrefix)) {
    throw new Error("Storage path escapes root");
  }

  return { key: normalizedKey, absolutePath };
}

function publicUrl(area: StorageArea, key: string) {
  const normalizedKey = normalizeKey(key);
  const encodedKey = normalizedKey.split("/").map(encodeURIComponent).join("/");
  return `${STORAGE_ROOTS[area].publicBaseUrl}/${encodedKey}`;
}

function objectFor(area: StorageArea, key: string): StorageObject {
  const resolved = resolvePath(area, key);
  return {
    area,
    key: resolved.key,
    url: publicUrl(area, resolved.key),
    absolutePath: resolved.absolutePath,
  };
}

function cleanLocalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  return trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
}

async function walk(area: StorageArea, currentDir: string, rootDir: string): Promise<StorageListEntry[]> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith(".")) return [] as StorageListEntry[];

      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        return walk(area, absolutePath, rootDir);
      }
      if (!entry.isFile()) return [] as StorageListEntry[];

      const info = await stat(absolutePath);
      const key = path.relative(rootDir, absolutePath).split(path.sep).join("/");
      return [
        {
          ...objectFor(area, key),
          sizeBytes: info.size,
          modifiedAt: info.mtime,
        },
      ];
    })
  );

  return nested.flat();
}

export const storage = {
  rootPath(area: StorageArea) {
    return path.resolve(STORAGE_ROOTS[area].rootDir);
  },

  path(area: StorageArea, key: string) {
    return objectFor(area, key).absolutePath;
  },

  url(area: StorageArea, key: string) {
    return publicUrl(area, key);
  },

  async put(area: StorageArea, key: string, data: Buffer | string) {
    const object = objectFor(area, key);
    await mkdir(path.dirname(object.absolutePath), { recursive: true });
    await writeFile(object.absolutePath, data);
    return object;
  },

  async putStream(area: StorageArea, key: string, stream: Readable) {
    const object = objectFor(area, key);
    await mkdir(path.dirname(object.absolutePath), { recursive: true });
    await pipeline(stream, createWriteStream(object.absolutePath));
    return object;
  },

  async get(area: StorageArea, key: string) {
    return readFile(objectFor(area, key).absolutePath);
  },

  stream(area: StorageArea, key: string, options?: { start?: number; end?: number }) {
    return createReadStream(objectFor(area, key).absolutePath, options);
  },

  async stat(area: StorageArea, key: string) {
    return stat(objectFor(area, key).absolutePath);
  },

  async delete(area: StorageArea, key: string) {
    await rm(objectFor(area, key).absolutePath, { force: true });
  },

  async list(area: StorageArea) {
    const rootDir = path.resolve(STORAGE_ROOTS[area].rootDir);
    return walk(area, rootDir, rootDir);
  },

  resolveUrl(value: string, allowedArea?: StorageArea) {
    const cleanUrl = cleanLocalUrl(value);
    if (!cleanUrl) return null;

    const areas = allowedArea ? [allowedArea] : (Object.keys(STORAGE_ROOTS) as StorageArea[]);
    for (const area of areas) {
      const baseUrl = STORAGE_ROOTS[area].publicBaseUrl;
      const prefix = `${baseUrl}/`;
      if (!cleanUrl.startsWith(prefix)) continue;

      let key: string;
      try {
        key = decodeURIComponent(cleanUrl.slice(prefix.length));
      } catch {
        return null;
      }

      try {
        return objectFor(area, key);
      } catch {
        return null;
      }
    }

    return null;
  },
};
