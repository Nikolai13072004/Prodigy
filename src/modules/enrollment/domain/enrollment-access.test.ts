import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeEnrollmentExpiry,
  resolveEnrollmentAccess,
} from "./enrollment-access";

const now = new Date("2026-08-13T12:00:00Z");

test("a user without direct or group assignments is unassigned", () => {
  const access = resolveEnrollmentAccess({
    directExpiries: [],
    groupExpiries: [],
    now,
  });
  assert.deepEqual(access, {
    status: "UNASSIGNED",
    source: null,
    hasAssignment: false,
    isActive: false,
    isUnlimited: false,
    expiresAt: null,
  });
});

test("an unlimited group assignment grants active access", () => {
  const access = resolveEnrollmentAccess({
    directExpiries: [],
    groupExpiries: [null],
    now,
  });
  assert.equal(access.status, "ACTIVE");
  assert.equal(access.source, "GROUP");
  assert.equal(access.isUnlimited, true);
});

test("an expired direct assignment overrides an active group assignment", () => {
  const expired = new Date("2026-08-12T12:00:00Z");
  const access = resolveEnrollmentAccess({
    directExpiries: [expired],
    groupExpiries: [null, new Date("2026-09-01T00:00:00Z")],
    now,
  });
  assert.equal(access.status, "EXPIRED");
  assert.equal(access.source, "DIRECT");
  assert.equal(access.hasAssignment, true);
  assert.equal(access.isActive, false);
  assert.equal(access.expiresAt, expired);
});

test("an unlimited direct assignment overrides group restrictions", () => {
  const access = resolveEnrollmentAccess({
    directExpiries: [null],
    groupExpiries: [new Date("2026-08-12T12:00:00Z")],
    now,
  });
  assert.equal(access.status, "ACTIVE");
  assert.equal(access.source, "DIRECT");
  assert.equal(access.isUnlimited, true);
});

test("the latest expiry wins among assignments from the same source", () => {
  const latest = new Date("2026-09-01T00:00:00Z");
  const access = resolveEnrollmentAccess({
    directExpiries: [],
    groupExpiries: [new Date("2026-08-01T00:00:00Z"), latest],
    now,
  });
  assert.equal(access.status, "ACTIVE");
  assert.equal(access.expiresAt, latest);
});

test("access expires at the exact boundary", () => {
  const access = resolveEnrollmentAccess({
    directExpiries: [now],
    groupExpiries: [],
    now,
  });
  assert.equal(access.status, "EXPIRED");
  assert.equal(access.isActive, false);
});

test("expiry merging preserves unlimited and otherwise keeps the latest date", () => {
  const earlier = new Date("2026-08-20T00:00:00Z");
  const later = new Date("2026-09-01T00:00:00Z");
  assert.equal(mergeEnrollmentExpiry(earlier, later), later);
  assert.equal(mergeEnrollmentExpiry(null, later), null);
});
