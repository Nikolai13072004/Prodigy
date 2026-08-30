import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStringArrayJson,
  selectCourseBasicsValues,
} from "@/app/courses/[id]/manage/_queries/select-course-basics";

test("selects tags and splits a valid course duration", () => {
  assert.deepEqual(
    selectCourseBasicsValues({ tagsJson: '["onboarding","sales"]', durationMinutes: 135 }),
    {
      courseTags: ["onboarding", "sales"],
      durationHoursValue: "2",
      durationMinutesValue: "15",
    }
  );
});

test("keeps empty duration fields when duration is absent", () => {
  assert.deepEqual(selectCourseBasicsValues({ tagsJson: null, durationMinutes: null }), {
    courseTags: [],
    durationHoursValue: "",
    durationMinutesValue: "",
  });
});

test("ignores malformed and non-string tag values", () => {
  assert.deepEqual(parseStringArrayJson("not-json"), []);
  assert.deepEqual(parseStringArrayJson('["valid", 1, "", null]'), ["valid"]);
});
