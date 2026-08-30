import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPptxRenderEnv } from "@/lib/pptx-render-env";
import { PERMISSIONS, hasPermission } from "@/lib/roles";
import { storage } from "@/lib/storage";
import { deleteStorageFileRecord, indexStorageFile, putStreamDedup } from "@/lib/storage/dedup";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".pptx", ".mp4", ".webm"]);
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};
const execFileAsync = promisify(execFile);
const MAX_HTML5_SLIDES = 250;

async function deleteUploadObject(key: string) {
  try {
    await storage.delete("uploads", key);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  await deleteStorageFileRecord("uploads", key);
}

type Html5RevealRegion = {
  order: number;
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
};

type Html5RevealRegionsBySlide = Record<number, Html5RevealRegion[]>;

type Html5SlideLink = {
  href: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type Html5SlideLinksBySlide = Record<number, Html5SlideLink[]>;

function parsePagesCount(stdout: string) {
  const match = stdout.match(/Pages:\s+(\d+)/i);
  if (!match) return null;
  const pages = Number.parseInt(match[1], 10);
  if (!Number.isFinite(pages) || pages < 1) return null;
  return pages;
}

async function getPdfPageCount(filePath: string) {
  const { stdout } = await execFileAsync("pdfinfo", [filePath], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return parsePagesCount(stdout);
}

async function convertPptxToPdf(filePath: string, outputDir: string, outputBaseName: string) {
  const outputPath = path.join(outputDir, `${outputBaseName}.pdf`);
  const profileDir = path.join("/tmp", `lo-${outputBaseName}`);

  try {
    await execFileAsync(
      "soffice",
      [
        "--headless",
        "--nologo",
        "--nodefault",
        "--norestore",
        `-env:UserInstallation=file://${profileDir}`,
        "--convert-to",
        "pdf:impress_pdf_Export",
        "--outdir",
        outputDir,
        filePath,
      ],
      {
        timeout: 180_000,
        maxBuffer: 10 * 1024 * 1024,
        env: getPptxRenderEnv(),
      }
    );
  } finally {
    await rm(profileDir, { recursive: true, force: true });
  }

  try {
    await access(outputPath);
  } catch (error) {
    const actualOutputPath = path.join(outputDir, `${path.parse(filePath).name}.pdf`);
    if (actualOutputPath === outputPath) throw error;
    await access(actualOutputPath);
    await rename(actualOutputPath, outputPath);
  }
  return outputPath;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonForHtml(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function decodeXmlText(value: string) {
  return value
    .replace(/&#(\d+);/g, (_match: string, code: string) => {
      const parsed = Number.parseInt(code, 10);
      if (!Number.isFinite(parsed)) return "";
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return "";
      }
    })
    .replace(/&#x([\da-f]+);/gi, (_match: string, code: string) => {
      const parsed = Number.parseInt(code, 16);
      if (!Number.isFinite(parsed)) return "";
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return "";
      }
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseXmlNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseXmlFloat(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getXmlAttr(xml: string, attrName: string) {
  const match = xml.match(new RegExp(`\\b${attrName}="([^"]*)"`));
  return match ? decodeXmlText(match[1]) : null;
}

function uniqueInOrder(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

async function readZipEntryText(zipPath: string, entryName: string) {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath, entryName], {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function extractSlideSize(presentationXml: string) {
  const match = presentationXml.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"[^>]*>/);
  const width = parseXmlNumber(match?.[1]);
  const height = parseXmlNumber(match?.[2]);
  if (!width || !height) return { width: 12192000, height: 6858000 };
  return { width, height };
}

function zipDirectoryScript() {
  return `
import os
import sys
import zipfile

source_dir = sys.argv[1]
target_path = sys.argv[2]

with zipfile.ZipFile(target_path, "w", zipfile.ZIP_DEFLATED) as archive:
    for root, dirs, files in os.walk(source_dir):
        dirs.sort()
        files.sort()
        for file_name in files:
            full_path = os.path.join(root, file_name)
            archive_name = os.path.relpath(full_path, source_dir).replace(os.sep, "/")
            archive.write(full_path, archive_name)
`;
}

async function zipDirectory(sourceDir: string, targetPath: string) {
  await execFileAsync("python3", ["-c", zipDirectoryScript(), sourceDir, targetPath], {
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  await access(targetPath);
}

function getSlideText(shapeBlock: string) {
  return [...shapeBlock.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .map((match) => decodeXmlText(match[1]))
    .join("");
}

function widenShortCenteredTitleBlocks(slideXml: string, slideSize: { width: number; height: number }) {
  return slideXml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeBlock) => {
    if (!/<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/.test(shapeBlock)) return shapeBlock;

    const title = getSlideText(shapeBlock).replace(/\s+/g, " ").trim();
    if (!title || title.length > 45 || !title.includes(" ")) return shapeBlock;

    const transformMatch = shapeBlock.match(
      /<a:xfrm\b[^>]*>\s*<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>\s*<\/a:xfrm>/
    );
    if (!transformMatch) return shapeBlock;

    const x = Number.parseInt(transformMatch[1], 10);
    const y = Number.parseInt(transformMatch[2], 10);
    const width = Number.parseInt(transformMatch[3], 10);
    const height = Number.parseInt(transformMatch[4], 10);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0) return shapeBlock;

    const isCenteredBlock = x > slideSize.width * 0.2 && x + width < slideSize.width * 0.8;
    if (!isCenteredBlock) return shapeBlock;

    const targetWidth = Math.min(Math.round(slideSize.width * 0.55), Math.max(width, Math.round(slideSize.width * 0.43)));
    if (targetWidth <= width) return shapeBlock;

    const center = x + width / 2;
    const nextX = Math.round(clamp(center - targetWidth / 2, 0, slideSize.width - targetWidth));
    const nextTransform = `<a:xfrm><a:off x="${nextX}" y="${y}"/><a:ext cx="${targetWidth}" cy="${height}"/></a:xfrm>`;
    return shapeBlock.replace(transformMatch[0], nextTransform);
  });
}

async function createRenderablePptxWithTitleFixes(args: { pptxPath: string; outputPath: string }) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pptx-render-fixes-"));
  const extractDir = path.join(tempDir, "pptx");

  try {
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("unzip", ["-q", args.pptxPath, "-d", extractDir], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    let slideSize = { width: 12192000, height: 6858000 };
    try {
      const presentationXml = await readFile(path.join(extractDir, "ppt", "presentation.xml"), "utf8");
      slideSize = extractSlideSize(presentationXml);
    } catch {
      // Keep widescreen defaults when metadata is unavailable.
    }

    const slidesDir = path.join(extractDir, "ppt", "slides");
    const slideFiles = (await readdir(slidesDir).catch(() => [])).filter((fileName) =>
      /^slide\d+\.xml$/i.test(fileName)
    );
    let changed = false;

    for (const slideFile of slideFiles) {
      const slidePath = path.join(slidesDir, slideFile);
      const slideXml = await readFile(slidePath, "utf8");
      const nextSlideXml = widenShortCenteredTitleBlocks(slideXml, slideSize);
      if (nextSlideXml !== slideXml) {
        await writeFile(slidePath, nextSlideXml, "utf8");
        changed = true;
      }
    }

    if (!changed) return null;

    await zipDirectory(extractDir, args.outputPath);
    return args.outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function extractAnimatedShapeIds(slideXml: string) {
  const matches = [...slideXml.matchAll(/<p:spTgt\b[^>]*\bspid="(\d+)"[^>]*>/g)].map((match) => match[1]);
  return uniqueInOrder(matches);
}

function extractShapeBlocks(slideXml: string) {
  return [
    ...slideXml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g),
    ...slideXml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g),
    ...slideXml.matchAll(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g),
  ].map((match) => match[0]);
}

function extractShapeId(block: string) {
  const match = block.match(/<p:cNvPr\b[^>]*\bid="(\d+)"[^>]*>/);
  return match?.[1] ?? null;
}

function extractShapeText(block: string) {
  const pieces = [...block.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
    .map((match) => decodeXmlText(match[1]).trim())
    .filter(Boolean);
  return pieces.join(" ");
}

function extractShapeBounds(block: string, slideSize: { width: number; height: number }) {
  const xfrmMatch = block.match(/<a:xfrm\b[\s\S]*?<\/a:xfrm>/);
  if (!xfrmMatch) return null;

  const offMatch = xfrmMatch[0].match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"[^>]*\/>/);
  const extMatch = xfrmMatch[0].match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"[^>]*\/>/);
  const x = parseXmlNumber(offMatch?.[1]);
  const y = parseXmlNumber(offMatch?.[2]);
  const cx = parseXmlNumber(extMatch?.[1]);
  const cy = parseXmlNumber(extMatch?.[2]);
  if (x === null || y === null || !cx || !cy) return null;

  const padX = 0.45;
  const padY = 0.45;
  const left = Math.max(0, (x / slideSize.width) * 100 - padX);
  const top = Math.max(0, (y / slideSize.height) * 100 - padY);
  const width = Math.min(100 - left, (cx / slideSize.width) * 100 + padX * 2);
  const height = Math.min(100 - top, (cy / slideSize.height) * 100 + padY * 2);

  if (width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

function getRegionCenterY(region: Html5RevealRegion) {
  return region.top + region.height / 2;
}

function groupRevealRegionsByRows(regions: Html5RevealRegion[]) {
  if (regions.length === 1) {
    return [{ ...regions[0], order: 0, left: 0, top: 0, width: 100, height: 100 }];
  }

  const groups: { centerY: number; regions: Html5RevealRegion[] }[] = [];
  const sorted = [...regions].sort((a, b) => getRegionCenterY(a) - getRegionCenterY(b) || a.left - b.left);

  for (const region of sorted) {
    const centerY = getRegionCenterY(region);
    const threshold = Math.max(2.2, Math.min(5.8, region.height * 0.85));
    const group = groups.find((candidate) => Math.abs(candidate.centerY - centerY) <= threshold);

    if (!group) {
      groups.push({ centerY, regions: [region] });
      continue;
    }

    group.regions.push(region);
    group.centerY =
      group.regions.reduce((sum, item) => sum + getRegionCenterY(item), 0) / group.regions.length;
  }

  return groups
    .sort((a, b) => a.centerY - b.centerY)
    .flatMap((group, groupIndex) =>
      group.regions
        .sort((a, b) => a.left - b.left)
        .map((region) => ({
          ...region,
          order: groupIndex,
        }))
    );
}

async function extractPptxRevealRegions(pptxPath: string, slideCount: number): Promise<Html5RevealRegionsBySlide> {
  const regionsBySlide: Html5RevealRegionsBySlide = {};
  let slideSize = { width: 12192000, height: 6858000 };

  try {
    slideSize = extractSlideSize(await readZipEntryText(pptxPath, "ppt/presentation.xml"));
  } catch {
    // Keep widescreen defaults when metadata is unavailable.
  }

  for (let slideNumber = 1; slideNumber <= slideCount; slideNumber += 1) {
    let slideXml = "";
    try {
      slideXml = await readZipEntryText(pptxPath, `ppt/slides/slide${slideNumber}.xml`);
    } catch {
      continue;
    }

    const animatedIds = extractAnimatedShapeIds(slideXml);
    if (animatedIds.length === 0) continue;

    const blocksById = new Map<string, string>();
    for (const block of extractShapeBlocks(slideXml)) {
      const id = extractShapeId(block);
      if (id) blocksById.set(id, block);
    }

    const regions: Html5RevealRegion[] = [];
    animatedIds.forEach((shapeId, index) => {
      const block = blocksById.get(shapeId);
      if (!block) return;
      const bounds = extractShapeBounds(block, slideSize);
      if (!bounds) return;
      regions.push({
        order: index,
        ...bounds,
        label: extractShapeText(block),
      });
    });

    if (regions.length > 0) {
      regionsBySlide[slideNumber] = groupRevealRegionsByRows(regions);
    }
  }

  return regionsBySlide;
}

function removeAnimatedShapeBlocks(slideXml: string, animatedIds: Set<string>) {
  let cleaned = slideXml;

  for (const block of extractShapeBlocks(slideXml)) {
    const id = extractShapeId(block);
    if (id && animatedIds.has(id)) {
      cleaned = cleaned.replace(block, "");
    }
  }

  return cleaned.replace(/<p:timing\b[\s\S]*?<\/p:timing>/g, "");
}

async function createBasePptxWithoutAnimatedObjects(args: {
  pptxPath: string;
  outputPath: string;
  slideCount: number;
}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pptx-html5-base-"));
  const extractDir = path.join(tempDir, "pptx");

  try {
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("unzip", ["-q", args.pptxPath, "-d", extractDir], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    let changed = false;
    for (let slideNumber = 1; slideNumber <= args.slideCount; slideNumber += 1) {
      const slidePath = path.join(extractDir, "ppt", "slides", `slide${slideNumber}.xml`);
      let slideXml = "";
      try {
        slideXml = await readFile(slidePath, "utf8");
      } catch {
        continue;
      }

      const animatedIds = extractAnimatedShapeIds(slideXml);
      if (animatedIds.length === 0) continue;

      const cleaned = removeAnimatedShapeBlocks(slideXml, new Set(animatedIds));
      if (cleaned !== slideXml) {
        await writeFile(slidePath, cleaned, "utf8");
        changed = true;
      }
    }

    if (!changed) return null;

    await zipDirectory(extractDir, args.outputPath);
    return args.outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function slideImageName(page: number) {
  return `slide-${String(page).padStart(3, "0")}.jpg`;
}

async function renderPdfSlidesToImages(args: {
  pdfPath: string;
  outputDir: string;
  hrefDir: string;
  pages: number;
}) {
  const slideHrefs: string[] = [];

  for (let page = 1; page <= args.pages; page += 1) {
    const imageName = slideImageName(page);
    const outputPrefix = path.join(args.outputDir, imageName.replace(/\.jpg$/i, ""));
    await execFileAsync(
      "pdftoppm",
      [
        "-jpeg",
        "-jpegopt",
        "quality=88,optimize=y",
        "-f",
        String(page),
        "-l",
        String(page),
        "-singlefile",
        "-scale-to",
        "1800",
        args.pdfPath,
        outputPrefix,
      ],
      {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      }
    );
    slideHrefs.push(`${args.hrefDir}/${imageName}`);
  }

  return slideHrefs;
}

function parsePdfPageLinks(pageXml: string, pageWidth: number, pageHeight: number) {
  const links: Html5SlideLink[] = [];
  const textPattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;

  for (const match of pageXml.matchAll(textPattern)) {
    const attrs = match[1];
    const body = match[2];
    const linkMatch = body.match(/<a\b([^>]*)>/i);
    if (!linkMatch) continue;

    const href = getXmlAttr(linkMatch[1], "href")?.trim();
    const left = parseXmlFloat(getXmlAttr(attrs, "left"));
    const top = parseXmlFloat(getXmlAttr(attrs, "top"));
    const width = parseXmlFloat(getXmlAttr(attrs, "width"));
    const height = parseXmlFloat(getXmlAttr(attrs, "height"));
    if (!href || left === null || top === null || width === null || height === null) continue;

    const relativeLeft = clamp((left / pageWidth) * 100, 0, 100);
    const relativeTop = clamp((top / pageHeight) * 100, 0, 100);
    const relativeWidth = clamp((width / pageWidth) * 100, 0, 100 - relativeLeft);
    const relativeHeight = clamp((height / pageHeight) * 100, 0, 100 - relativeTop);
    if (relativeWidth <= 0 || relativeHeight <= 0) continue;

    links.push({
      href,
      text: decodeXmlText(body.replace(/<[^>]*>/g, "")).trim(),
      left: relativeLeft,
      top: relativeTop,
      width: relativeWidth,
      height: relativeHeight,
    });
  }

  return links;
}

function parsePdfLinksBySlideXml(xml: string, maxPages: number): Html5SlideLinksBySlide {
  const linksBySlide: Html5SlideLinksBySlide = {};
  const pagePattern = /<page\b([^>]*)>([\s\S]*?)<\/page>/gi;
  let fallbackPage = 0;

  for (const match of xml.matchAll(pagePattern)) {
    fallbackPage += 1;
    const attrs = match[1];
    const pageNumber = parseXmlNumber(getXmlAttr(attrs, "number") ?? undefined) ?? fallbackPage;
    if (pageNumber < 1 || pageNumber > maxPages) continue;

    const pageWidth = parseXmlFloat(getXmlAttr(attrs, "width")) ?? 1;
    const pageHeight = parseXmlFloat(getXmlAttr(attrs, "height")) ?? 1;
    if (pageWidth <= 0 || pageHeight <= 0) continue;

    const links = parsePdfPageLinks(match[2], pageWidth, pageHeight);
    if (links.length > 0) {
      linksBySlide[pageNumber] = links;
    }
  }

  return linksBySlide;
}

async function extractPdfLinksForHtml5(pdfPath: string, pages: number): Promise<Html5SlideLinksBySlide> {
  try {
    const { stdout } = await execFileAsync(
      "pdftohtml",
      ["-f", "1", "-l", String(pages), "-xml", "-stdout", pdfPath],
      {
        timeout: 90_000,
        maxBuffer: 64 * 1024 * 1024,
      }
    );
    return parsePdfLinksBySlideXml(stdout, pages);
  } catch (error) {
    console.error("PPTX HTML5 link extraction failed:", error);
    return {};
  }
}

function buildHtml5Index(
  title: string,
  slides: string[],
  baseSlides: string[] | null,
  revealRegions: Html5RevealRegionsBySlide,
  slideLinks: Html5SlideLinksBySlide
) {
  const safeTitle = escapeHtml(title);
  const slidesJson = jsonForHtml(slides);
  const baseSlidesJson = jsonForHtml(baseSlides);
  const revealRegionsJson = jsonForHtml(revealRegions);
  const slideLinksJson = jsonForHtml(slideLinks);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #08090b;
      color: #f4f4f5;
      font-family: Arial, Helvetica, sans-serif;
      overflow: hidden;
    }
    .player {
      display: grid;
      grid-template-rows: 1fr auto;
      height: 100vh;
      width: 100vw;
    }
    .stage {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 0;
      padding: 16px;
      background: #030407;
    }
    .slide-wrap {
      position: relative;
      width: min(100%, calc((100vh - 88px) * 1.7777778));
      max-height: 100%;
      aspect-ratio: 16 / 9;
      border: 1px solid rgba(255,255,255,.12);
      background: #fff;
      box-shadow: 0 18px 60px rgba(0,0,0,.35);
      overflow: hidden;
    }
    .slide {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      user-select: none;
      z-index: 0;
    }
    .piece-layer,
    .mask-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .piece-layer { z-index: 1; }
    .mask-layer { z-index: 2; }
    .link-layer {
      position: absolute;
      inset: 0;
      z-index: 3;
      pointer-events: none;
    }
    .slide-link {
      position: absolute;
      display: block;
      border-radius: 4px;
      color: transparent;
      font-size: 0;
      outline: none;
      pointer-events: auto;
      text-decoration: none;
      transition: background .16s ease, box-shadow .16s ease;
    }
    .slide-link:hover { background: rgba(14,165,233,.10); }
    .slide-link:focus-visible {
      background: rgba(14,165,233,.14);
      box-shadow: 0 0 0 3px rgba(56,189,248,.65);
    }
    .reveal-piece {
      position: absolute;
      overflow: hidden;
      pointer-events: none;
      opacity: 0;
      animation: revealFade .26s ease forwards;
    }
    .reveal-piece img {
      position: absolute;
      max-width: none;
      user-select: none;
      pointer-events: none;
    }
    @keyframes revealFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .reveal-mask {
      position: absolute;
      background: #fbfbfa;
      box-shadow: 0 0 0 2px #fbfbfa;
      opacity: 1;
      transition: opacity .18s ease;
    }
    .toolbar {
      display: grid;
      grid-template-columns: auto auto;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-top: 1px solid rgba(255,255,255,.14);
      background: rgba(20, 21, 26, .98);
    }
    .counter {
      font-size: 13px;
      color: #a1a1aa;
      white-space: nowrap;
    }
    .controls {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
    }
    button {
      min-width: 42px;
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 8px;
      background: rgba(255,255,255,.08);
      color: #fafafa;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      padding: 8px 12px;
    }
    button:hover:not(:disabled) { background: rgba(255,255,255,.14); }
    button:disabled { cursor: default; opacity: .38; }
    .progress {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: rgba(255,255,255,.12);
    }
    .progress span {
      display: block;
      height: 100%;
      width: 0;
      background: #14b8a6;
      transition: width .2s ease;
    }
    @media (max-width: 640px) {
      .toolbar { grid-template-columns: 1fr; }
      .controls { justify-content: stretch; }
      .controls button { flex: 1; }
    }
  </style>
</head>
<body>
  <main class="player" aria-label="HTML5 презентация">
    <section class="stage">
      <div class="slide-wrap">
        <img id="baseSlide" class="slide" alt="Слайд" draggable="false" decoding="async" fetchpriority="high" />
        <div id="pieceLayer" class="piece-layer" aria-hidden="true"></div>
        <div id="maskLayer" class="mask-layer" aria-hidden="true"></div>
        <div id="linkLayer" class="link-layer"></div>
      </div>
    </section>
    <footer class="toolbar">
      <div class="counter" id="counter"></div>
      <div class="controls">
        <button id="prev" type="button" aria-label="Предыдущий слайд">‹</button>
        <button id="next" type="button" aria-label="Следующий слайд">›</button>
      </div>
    </footer>
    <div class="progress" aria-hidden="true"><span id="progress"></span></div>
  </main>
  <script>
    const slides = ${slidesJson};
    const baseSlides = ${baseSlidesJson};
    const revealRegions = ${revealRegionsJson};
    const slideLinks = ${slideLinksJson};
    function initialSlideIndex() {
      const params = new URLSearchParams(window.location.search);
      const raw = Number.parseInt(params.get('slide') || '', 10);
      if (!Number.isFinite(raw)) return 0;
      return Math.max(0, Math.min(slides.length - 1, raw - 1));
    }

    let index = initialSlideIndex();
    const revealedCounts = Array.from({ length: slides.length }, () => 0);
    const baseSlide = document.getElementById('baseSlide');
    const pieceLayer = document.getElementById('pieceLayer');
    const maskLayer = document.getElementById('maskLayer');
    const linkLayer = document.getElementById('linkLayer');
    const counter = document.getElementById('counter');
    const progress = document.getElementById('progress');
    const prev = document.getElementById('prev');
    const next = document.getElementById('next');
    const preloadedImages = new Set();

    function preloadImage(src) {
      if (!src || preloadedImages.has(src)) return;
      preloadedImages.add(src);
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
    }

    function sendProgress() {
      const currentSlide = index + 1;
      const completed = index >= slides.length - 1 && revealedCounts[index] >= currentStepCount();
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          source: 'lms-pptx-html5',
          type: 'progress',
          currentSlide,
          totalSlides: slides.length,
          completed,
        }, window.location.origin);
      }
    }

    function currentRegions() {
      return revealRegions[String(index + 1)] || [];
    }

    function currentStepCount() {
      return currentRegions().reduce((max, region) => Math.max(max, (Number(region.order) || 0) + 1), 0);
    }

    function canUseBaseSlides() {
      return Array.isArray(baseSlides) && baseSlides.length === slides.length;
    }

    function preloadSlideAssets(slideIndex) {
      if (slideIndex < 0 || slideIndex >= slides.length) return;
      const regions = revealRegions[String(slideIndex + 1)] || [];
      if (canUseBaseSlides() && regions.length > 0) {
        preloadImage(baseSlides[slideIndex]);
      }
      preloadImage(slides[slideIndex]);
    }

    function preloadAroundCurrentSlide() {
      preloadSlideAssets(index);
      preloadSlideAssets(index + 1);
      preloadSlideAssets(index + 2);
      preloadSlideAssets(index - 1);
    }

    function safeLinkTarget(href) {
      try {
        const url = new URL(href, window.location.href);
        if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
          return url.href;
        }
      } catch {
        return null;
      }
      return null;
    }

    function normalizeLinkText(value) {
      return String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
    }

    function rectangleOverlapRatio(a, b) {
      const left = Math.max(Number(a.left) || 0, Number(b.left) || 0);
      const top = Math.max(Number(a.top) || 0, Number(b.top) || 0);
      const right = Math.min((Number(a.left) || 0) + (Number(a.width) || 0), (Number(b.left) || 0) + (Number(b.width) || 0));
      const bottom = Math.min((Number(a.top) || 0) + (Number(a.height) || 0), (Number(b.top) || 0) + (Number(b.height) || 0));
      const overlapWidth = Math.max(0, right - left);
      const overlapHeight = Math.max(0, bottom - top);
      const linkArea = Math.max(1, (Number(a.width) || 0) * (Number(a.height) || 0));
      return (overlapWidth * overlapHeight) / linkArea;
    }

    function matchingRevealRegion(link) {
      const regions = currentRegions();
      if (regions.length === 0) return null;

      const linkText = normalizeLinkText(link.text);
      const textMatches = linkText
        ? regions.filter((region) => {
            const label = normalizeLinkText(region.label);
            return label && (label.includes(linkText) || linkText.includes(label));
          })
        : [];
      if (textMatches.length > 0) {
        return textMatches.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))[0];
      }

      const overlapMatches = regions
        .map((region) => ({ region, ratio: rectangleOverlapRatio(link, region) }))
        .filter((candidate) => candidate.ratio >= 0.08)
        .sort((a, b) => b.ratio - a.ratio || (Number(a.region.order) || 0) - (Number(b.region.order) || 0));
      return overlapMatches[0]?.region || null;
    }

    function isLinkVisible(link) {
      const region = matchingRevealRegion(link);
      if (!region) return true;
      return (revealedCounts[index] || 0) > (Number(region.order) || 0);
    }

    function renderLinks() {
      linkLayer.innerHTML = '';
      const links = slideLinks[String(index + 1)] || [];
      links.forEach((link) => {
        const target = safeLinkTarget(link.href);
        if (!target) return;
        if (!isLinkVisible(link)) return;

        const anchor = document.createElement('a');
        anchor.className = 'slide-link';
        anchor.href = target;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.title = link.text || link.href;
        anchor.setAttribute(
          'aria-label',
          link.text ? 'Открыть ссылку: ' + link.text : 'Открыть ссылку на слайде'
        );

        const linkLeft = Number(link.left) || 0;
        const linkTop = Number(link.top) || 0;
        const linkWidth = Number(link.width) || 0;
        const linkHeight = Number(link.height) || 0;
        const padX = Math.max(1.2, Math.min(5, linkWidth * 0.12));
        const padY = Math.max(1.2, Math.min(4, linkHeight * 0.7));
        const left = Math.max(0, linkLeft - padX);
        const top = Math.max(0, linkTop - padY);
        const width = Math.min(100 - left, linkWidth + padX * 2);
        const height = Math.min(100 - top, linkHeight + padY * 2);

        if (width <= 0 || height <= 0) return;
        anchor.style.left = left + '%';
        anchor.style.top = top + '%';
        anchor.style.width = width + '%';
        anchor.style.height = height + '%';
        linkLayer.appendChild(anchor);
      });
    }

    function renderLayers() {
      const regions = currentRegions();
      const revealedCount = revealedCounts[index] || 0;
      const useBaseReveal = canUseBaseSlides() && regions.length > 0;
      baseSlide.src = useBaseReveal ? baseSlides[index] : slides[index];
      baseSlide.alt = 'Слайд ' + (index + 1) + ' из ' + slides.length;
      pieceLayer.innerHTML = '';
      maskLayer.innerHTML = '';

      if (useBaseReveal) {
        regions.forEach((region) => {
          if ((Number(region.order) || 0) >= revealedCount) return;
          const piece = document.createElement('div');
          const image = document.createElement('img');
          piece.className = 'reveal-piece';
          piece.style.left = region.left + '%';
          piece.style.top = region.top + '%';
          piece.style.width = region.width + '%';
          piece.style.height = region.height + '%';
          piece.style.animationDelay = (Number(region.order) || 0) === revealedCount - 1 ? '0ms' : '-260ms';
          image.src = slides[index];
          image.alt = '';
          image.draggable = false;
          image.style.left = (-region.left * 100 / region.width) + '%';
          image.style.top = (-region.top * 100 / region.height) + '%';
          image.style.width = (10000 / region.width) + '%';
          image.style.height = (10000 / region.height) + '%';
          piece.appendChild(image);
          pieceLayer.appendChild(piece);
        });
        return;
      }

      regions.forEach((region) => {
        if ((Number(region.order) || 0) < revealedCount) return;
        const mask = document.createElement('div');
        mask.className = 'reveal-mask';
        mask.style.left = region.left + '%';
        mask.style.top = region.top + '%';
        mask.style.width = region.width + '%';
        mask.style.height = region.height + '%';
        maskLayer.appendChild(mask);
      });
    }

    function render() {
      counter.textContent = (index + 1) + ' / ' + slides.length;
      progress.style.width = (((index + 1) / slides.length) * 100) + '%';
      prev.disabled = index <= 0;
      next.disabled = index >= slides.length - 1 && revealedCounts[index] >= currentStepCount();
      renderLayers();
      renderLinks();
      preloadAroundCurrentSlide();
      sendProgress();
    }

    function go(delta) {
      const nextIndex = Math.max(0, Math.min(slides.length - 1, index + delta));
      if (nextIndex === index) return;
      index = nextIndex;
      revealedCounts[index] = 0;
      render();
    }

    function revealOrGoNext() {
      if (revealedCounts[index] < currentStepCount()) {
        revealedCounts[index] += 1;
        render();
        return;
      }
      go(1);
    }

    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', revealOrGoNext);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        revealOrGoNext();
      }
      if (event.key === 'Home') {
        index = 0;
        revealedCounts[index] = 0;
        render();
      }
    });

    render();
  </script>
</body>
</html>`;
}

function buildScormManifest(title: string, indexHref: string) {
  const safeTitle = escapeHtml(title);
  const safeHref = escapeHtml(indexHref);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="lms-pptx-html5" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="default-org">
    <organization identifier="default-org">
      <title>${safeTitle}</title>
      <item identifier="item-1" identifierref="resource-1">
        <title>${safeTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="resource-1" type="webcontent" adlcp:scormtype="sco" href="${safeHref}">
      <file href="${safeHref}" />
    </resource>
  </resources>
</manifest>`;
}

async function generatePptxHtml5PackageFromPdf(args: {
  pdfPath: string;
  pptxPath?: string;
  uploadsDir: string;
  baseName: string;
  pages: number;
  title: string;
}) {
  if (args.pages < 1 || args.pages > MAX_HTML5_SLIDES) return null;

  const packageDir = path.join(args.uploadsDir, "pptx-html5", args.baseName);
  const slidesDir = path.join(packageDir, "slides");
  await rm(packageDir, { recursive: true, force: true });
  await mkdir(slidesDir, { recursive: true });

  const revealRegions = args.pptxPath ? await extractPptxRevealRegions(args.pptxPath, args.pages) : {};
  const slideLinks = await extractPdfLinksForHtml5(args.pdfPath, args.pages);
  const slideHrefs = await renderPdfSlidesToImages({
    pdfPath: args.pdfPath,
    outputDir: slidesDir,
    hrefDir: "slides",
    pages: args.pages,
  });

  let baseSlideHrefs: string[] | null = null;
  const hasAnimations = Object.keys(revealRegions).length > 0;
  if (args.pptxPath && hasAnimations) {
    const baseWorkDir = await mkdtemp(path.join(os.tmpdir(), "pptx-html5-render-"));
    const baseSlidesDir = path.join(packageDir, "base-slides");
    try {
      const basePptxPath = path.join(baseWorkDir, `${args.baseName}-base.pptx`);
      const basePdfDir = path.join(baseWorkDir, "pdf");
      await mkdir(basePdfDir, { recursive: true });
      const createdBasePptxPath = await createBasePptxWithoutAnimatedObjects({
        pptxPath: args.pptxPath,
        outputPath: basePptxPath,
        slideCount: args.pages,
      });

      if (createdBasePptxPath) {
        const basePdfPath = await convertPptxToPdf(createdBasePptxPath, basePdfDir, `${args.baseName}-base`);
        await mkdir(baseSlidesDir, { recursive: true });
        baseSlideHrefs = await renderPdfSlidesToImages({
          pdfPath: basePdfPath,
          outputDir: baseSlidesDir,
          hrefDir: "base-slides",
          pages: args.pages,
        });
      }
    } catch (baseRenderError) {
      console.error("PPTX HTML5 base slide generation failed:", baseRenderError);
      await rm(baseSlidesDir, { recursive: true, force: true });
      baseSlideHrefs = null;
    } finally {
      await rm(baseWorkDir, { recursive: true, force: true });
    }
  }

  await storage.put(
    "uploads",
    `pptx-html5/${args.baseName}/index.html`,
    buildHtml5Index(args.title, slideHrefs, baseSlideHrefs, revealRegions, slideLinks)
  );
  await storage.put(
    "uploads",
    `pptx-html5/${args.baseName}/imsmanifest.xml`,
    buildScormManifest(args.title, "index.html")
  );
  return `/uploads/pptx-html5/${args.baseName}/index.html`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    }
    if (!hasPermission(session.user.roles, PERMISSIONS.COURSES_CREATE_EDIT, session.user.permissions)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Файл слишком большой (макс. 2 ГБ)" },
        { status: 413 }
      );
    }

    const original = typeof (file as File).name === "string" ? (file as File).name : "file";
    const extFromName = (path.extname(original) || "").toLowerCase();
    const ext = extFromName || EXT_BY_MIME[file.type] || "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: "Поддерживаются только файлы PDF, PPTX, MP4 и WebM" },
        { status: 415 }
      );
    }

    const baseName = randomUUID();
    const name = `${baseName}${ext}`;
    const dir = storage.rootPath("uploads");
    const fileStream = file.stream();
    const uploaded = await putStreamDedup(
      "uploads",
      name,
      Readable.fromWeb(fileStream as unknown as import("stream/web").ReadableStream),
      {
        extension: ext,
        mimeType: file.type,
        originalName: original,
        purpose: "course_material",
      }
    );
    const uploadedKey = uploaded.object.key;
    const uploadedBaseName = path.parse(uploadedKey).name;
    const targetPath = uploaded.object.absolutePath;

    let previewUrl: string | null = null;
    let html5Url: string | null = null;
    let pages: number | null = null;
    if (ext === ".pptx") {
      const renderSourceDir = await mkdtemp(path.join(os.tmpdir(), "pptx-render-source-"));
      try {
        const fixedPptxPath =
          (await createRenderablePptxWithTitleFixes({
            pptxPath: targetPath,
            outputPath: path.join(renderSourceDir, `${uploadedBaseName}.pptx`),
          })) ?? targetPath;
        const previewPath = await convertPptxToPdf(fixedPptxPath, dir, uploadedBaseName);
        previewUrl = `/uploads/${uploadedBaseName}.pdf`;
        await indexStorageFile("uploads", `${uploadedBaseName}.pdf`, {
          extension: ".pdf",
          mimeType: "application/pdf",
          originalName: original.replace(/\.pptx$/i, ".pdf"),
          purpose: "presentation_preview",
        });
        pages = await getPdfPageCount(previewPath);
        if (!pages) {
          throw new Error("Unable to detect generated PDF page count");
        }
        try {
          html5Url = await generatePptxHtml5PackageFromPdf({
            pdfPath: previewPath,
            pptxPath: fixedPptxPath,
            uploadsDir: dir,
            baseName: uploadedBaseName,
            pages,
            title: original.replace(/\.pptx$/i, ""),
          });
        } catch (html5Error) {
          console.error("PPTX to HTML5 package generation failed:", html5Error);
          if (!uploaded.deduplicated) {
            await rm(path.join(dir, "pptx-html5", uploadedBaseName), { recursive: true, force: true });
          }
        }
      } catch (conversionError) {
        console.error("PPTX to PDF conversion failed:", conversionError);
        if (!uploaded.deduplicated) {
          await deleteUploadObject(uploadedKey);
          await deleteUploadObject(`${uploadedBaseName}.pdf`);
        }
        return NextResponse.json(
          {
            error:
              "Не удалось подготовить PPTX для предпросмотра. Попробуйте загрузить файл еще раз или сохраните презентацию в PDF.",
          },
          { status: 500 }
        );
      } finally {
        await rm(renderSourceDir, { recursive: true, force: true });
      }
    } else if (ext === ".pdf") {
      try {
        pages = await getPdfPageCount(targetPath);
        previewUrl = uploaded.object.url;
      } catch (pageCountError) {
        console.error("PDF page count failed:", pageCountError);
        if (!uploaded.deduplicated) {
          await deleteUploadObject(uploadedKey);
        }
        return NextResponse.json(
          {
            error:
              "Не удалось определить количество страниц PDF. Проверьте файл или попробуйте загрузить его еще раз.",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ url: uploaded.object.url, previewUrl, html5Url, pages, deduplicated: uploaded.deduplicated });
  } catch (error) {
    console.error("Upload API error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить файл. Попробуйте снова." },
      { status: 500 }
    );
  }
}
