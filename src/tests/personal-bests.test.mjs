import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readPersonalBests,
  completeRun,
  PERSONAL_BEST_KEY,
} from "../assets/js/PersonalBests.js";

function storage(value = null) {
  return {
    value,
    getItem(key) {
      assert.equal(key, PERSONAL_BEST_KEY);
      return this.value;
    },
    setItem(key, next) {
      assert.equal(key, PERSONAL_BEST_KEY);
      this.value = next;
    },
  };
}

test("first game establishes score and wave PBs and survives a reload", () => {
  const saved = storage();
  assert.equal(
    readPersonalBests(() => saved),
    null,
  );
  const result = completeRun(null, { score: 1250, wave: 3 }, () => saved);
  assert.deepEqual(result.best, { score: 1250, wave: 3 });
  assert.equal(result.scoreReport, "New best score!");
  assert.equal(result.waveReport, "New best wave!");
  assert.deepEqual(
    readPersonalBests(() => saved),
    result.best,
  );
});

test("score and waves are compared independently against the previous records", () => {
  const saved = storage();
  const result = completeRun(
    { score: 1000, wave: 5 },
    { score: 1200, wave: 4 },
    () => saved,
  );
  assert.deepEqual(result.best, { score: 1200, wave: 5 });
  assert.equal(result.scoreReport, "New best score!");
  assert.equal(result.waveReport, "Wave below best");
  const next = completeRun(result.best, { score: 900, wave: 6 }, () => saved);
  assert.deepEqual(next.best, { score: 1200, wave: 6 });
  assert.equal(next.scoreReport, "Score below best");
  assert.equal(next.waveReport, "New best wave!");
});

test("ties are reported without claiming a new record", () => {
  const result = completeRun(
    { score: 100, wave: 2 },
    { score: 100, wave: 2 },
    () => storage(),
  );
  assert.equal(result.scoreReport, "Best score matched");
  assert.equal(result.waveReport, "Best wave matched");
});

test("negative scores remain valid for first runs and later improvements", () => {
  const saved = storage();
  const first = completeRun(null, { score: -100, wave: 1 }, () => saved);
  assert.deepEqual(
    readPersonalBests(() => saved),
    first.best,
  );
  assert.equal(
    completeRun(first.best, { score: -50, wave: 1 }, () => saved).best.score,
    -50,
  );
});

test("missing, corrupt, and invalid saved records are ignored", () => {
  for (const value of [
    null,
    "broken",
    "null",
    "[]",
    "{}",
    '{"score":"100","wave":1}',
    '{"score":1,"wave":-1}',
    '{"score":1.5,"wave":2}',
    '{"score":1,"wave":2.5}',
  ]) {
    assert.equal(
      readPersonalBests(() => storage(value)),
      null,
    );
  }
});

test("blocked storage and quota errors do not interrupt the game or in-memory PBs", () => {
  const blocked = () => {
    throw new Error("blocked");
  };
  assert.equal(readPersonalBests(blocked), null);
  const result = completeRun(null, { score: 10, wave: 1 }, blocked);
  assert.deepEqual(result.best, { score: 10, wave: 1 });
  const quota = {
    setItem() {
      throw new Error("quota");
    },
  };
  assert.deepEqual(
    completeRun(result.best, { score: 20, wave: 2 }, () => quota).best,
    { score: 20, wave: 2 },
  );
});

test("default browser storage loads and saves records", () => {
  const previousWindow = globalThis.window;
  const saved = storage();
  globalThis.window = { localStorage: saved };
  try {
    assert.equal(readPersonalBests(), null);
    completeRun(null, { score: 40, wave: 2 });
    assert.deepEqual(readPersonalBests(), { score: 40, wave: 2 });
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
