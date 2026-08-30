import assert from "node:assert/strict";
import { test } from "node:test";
import { presentationFileUrlCandidates } from "./presentation-file-url";

test("PPTX_HTML5 + .pdf превью → сначала .pptx, потом сам preview", () => {
  assert.deepEqual(
    presentationFileUrlCandidates("/uploads/x/deck.pdf", "PPTX_HTML5"),
    ["/uploads/x/deck.pptx", "/uploads/x/deck.pdf"],
  );
});

test("сохраняет суффикс запроса/якоря при замене .pdf → .pptx", () => {
  assert.deepEqual(
    presentationFileUrlCandidates("/uploads/x/deck.pdf?v=2", "PPTX_HTML5"),
    ["/uploads/x/deck.pptx?v=2", "/uploads/x/deck.pdf?v=2"],
  );
  assert.deepEqual(
    presentationFileUrlCandidates("/uploads/x/deck.PDF#p3", "PPTX_HTML5"),
    ["/uploads/x/deck.pptx#p3", "/uploads/x/deck.PDF#p3"],
  );
});

test("не-PPTX режим → только сам preview", () => {
  assert.deepEqual(
    presentationFileUrlCandidates("/uploads/x/deck.pdf", "PDF_NATIVE" as never),
    ["/uploads/x/deck.pdf"],
  );
});

test("PPTX_HTML5, но превью не .pdf → только сам preview", () => {
  assert.deepEqual(
    presentationFileUrlCandidates("/uploads/x/deck.png", "PPTX_HTML5"),
    ["/uploads/x/deck.png"],
  );
});
