import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { getPptxRenderEnv } from "./pptx-render-env";

// Окружение для рендера PPTX: наследует process.env, но переопределяет
// FONTCONFIG_FILE (свой конфиг шрифтов) и HOME (=/tmp для headless-рендера).

test("наследует process.env и переопределяет FONTCONFIG_FILE и HOME", () => {
  process.env.__PPTX_TEST__ = "унаследовано";
  try {
    const env = getPptxRenderEnv();
    assert.equal(env.__PPTX_TEST__, "унаследовано", "переменные окружения наследуются");
    assert.equal(env.HOME, "/tmp");
    assert.ok(
      env.FONTCONFIG_FILE?.endsWith(path.join("src", "lib", "pptx-fontconfig.conf")),
      `путь к конфигу шрифтов: ${env.FONTCONFIG_FILE}`,
    );
  } finally {
    delete process.env.__PPTX_TEST__;
  }
});
