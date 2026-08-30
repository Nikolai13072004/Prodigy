import assert from "node:assert/strict";
import test from "node:test";
import {
  CourseLifecycleError,
  planCourseStatusChange,
  validateCoursePublication,
  type CoursePublicationCandidate,
} from "./course-lifecycle";

const validCourse: CoursePublicationCandidate = {
  title: "Course",
  description: "Description",
  moduleCount: 1,
  affectedAudienceCount: 0,
  items: [{
    type: "TEXT",
    title: "Lesson",
    moduleId: "module",
    contentIsMeaningful: true,
    fileUrl: null,
    totalSlides: null,
    quizQuestionCount: 0,
    surveyQuestionCount: 0,
  }],
};

test("valid publication candidate can be published", () => {
  assert.equal(validateCoursePublication(validCourse), null);
  assert.equal(planCourseStatusChange({
    currentStatus: "DRAFT",
    nextStatus: "PUBLISHED",
    confirmedAssignedImpact: false,
    candidate: validCourse,
  }), "PUBLISHED");
});

test("publication validates material-specific requirements", () => {
  assert.match(validateCoursePublication({ ...validCourse, items: [] }) ?? "", /Пустой курс/);
  assert.match(validateCoursePublication({
    ...validCourse,
    items: [{ ...validCourse.items[0]!, type: "QUIZ", quizQuestionCount: 0 }],
  }) ?? "", /тест/);
});

test("assigned published course requires confirmation before returning to draft", () => {
  assert.throws(() => planCourseStatusChange({
    currentStatus: "PUBLISHED",
    nextStatus: "DRAFT",
    confirmedAssignedImpact: false,
    candidate: { ...validCourse, affectedAudienceCount: 1 },
  }), CourseLifecycleError);
});
