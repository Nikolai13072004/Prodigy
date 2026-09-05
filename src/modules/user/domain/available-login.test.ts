import assert from "node:assert/strict";
import { test } from "node:test";
import { createAvailableLogin } from "./available-login";

test("свободный базовый логин возвращается и резервируется", () => {
  const occupied = new Set<string>();
  assert.equal(createAvailableLogin("ivan", occupied), "ivan");
  assert.ok(occupied.has("ivan"));
});

test("занятый логин → добавляется суффикс -2, -3", () => {
  const occupied = new Set<string>(["ivan"]);
  assert.equal(createAvailableLogin("ivan", occupied), "ivan-2");
  assert.equal(createAvailableLogin("ivan", occupied), "ivan-3");
});

test("длинная база усекается до 48 с учётом суффикса", () => {
  const base = "a".repeat(60);
  const occupied = new Set<string>([base]);
  const result = createAvailableLogin(base, occupied);
  // 48 - len("-2") = 46 символов базы + "-2"
  assert.equal(result, `${"a".repeat(46)}-2`);
});
