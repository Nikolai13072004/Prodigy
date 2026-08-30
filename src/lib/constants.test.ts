import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePresentationViewMode } from "./constants";

// Режим просмотра презентации: неизвестное значение откатывается к PDF-превью.

test("normalizePresentationViewMode: известные режимы сохраняются", () => {
  assert.equal(normalizePresentationViewMode("PDF_PREVIEW"), "PDF_PREVIEW");
  assert.equal(normalizePresentationViewMode("PPTX_HTML5"), "PPTX_HTML5");
});

test("normalizePresentationViewMode: неизвестное/пустое → PDF_PREVIEW", () => {
  assert.equal(normalizePresentationViewMode("HOLOGRAM"), "PDF_PREVIEW");
  assert.equal(normalizePresentationViewMode(""), "PDF_PREVIEW");
  assert.equal(normalizePresentationViewMode(null), "PDF_PREVIEW");
  assert.equal(normalizePresentationViewMode(undefined), "PDF_PREVIEW");
});
