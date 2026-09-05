import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendCourseReturnSource,
  getCourseBackLink,
  getCourseReturnSource,
} from "./course-return-source";

// Откуда ученик пришёл на курс (каталог/мои курсы) — для ссылки «назад».

test("getCourseReturnSource принимает только известные источники", () => {
  assert.equal(getCourseReturnSource("catalog"), "catalog");
  assert.equal(getCourseReturnSource("assigned"), "assigned");
  assert.equal(getCourseReturnSource("другое"), null);
  assert.equal(getCourseReturnSource(null), null);
  assert.equal(getCourseReturnSource(undefined), null);
});

test("getCourseBackLink: ссылка соответствует источнику", () => {
  assert.deepEqual(getCourseBackLink("catalog"), {
    href: "/courses?tab=catalog",
    label: "Назад к каталогу",
  });
  assert.deepEqual(getCourseBackLink("assigned"), {
    href: "/courses?tab=assigned",
    label: "Назад к моим курсам",
  });
  assert.deepEqual(getCourseBackLink(null), {
    href: "/courses",
    label: "Назад к курсам",
  });
});

test("appendCourseReturnSource добавляет from, сохраняя путь", () => {
  assert.equal(appendCourseReturnSource("/courses/1", "catalog"), "/courses/1?from=catalog");
  assert.equal(appendCourseReturnSource("/courses/1", null), "/courses/1", "без источника href неизменен");
});

test("appendCourseReturnSource сохраняет существующие query и hash", () => {
  assert.equal(
    appendCourseReturnSource("/courses/1?tab=about", "assigned"),
    "/courses/1?tab=about&from=assigned"
  );
  assert.equal(
    appendCourseReturnSource("/courses/1#section", "catalog"),
    "/courses/1?from=catalog#section"
  );
  assert.equal(
    appendCourseReturnSource("/courses/1?tab=about#s", "assigned"),
    "/courses/1?tab=about&from=assigned#s"
  );
});

test("appendCourseReturnSource перезаписывает существующий from", () => {
  assert.equal(
    appendCourseReturnSource("/courses/1?from=catalog", "assigned"),
    "/courses/1?from=assigned"
  );
});
