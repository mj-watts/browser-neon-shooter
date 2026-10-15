import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readBestBattle,
  recordBestBattle,
} from "../assets/js/BattleHistory.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("best battle survives reload and ten later lower-scoring battles", () => {
  const saved = storage();
  assert.equal(
    readBestBattle([], () => saved),
    null,
  );
  const best = { score: 1000, wave: 3, kills: 40 };
  let result = recordBestBattle(null, best, () => saved);
  for (let i = 0; i < 12; i++)
    result = recordBestBattle(
      result,
      { score: 10, wave: 4, kills: 50 },
      () => saved,
    );
  assert.deepEqual(
    readBestBattle([], () => saved),
    best,
  );
});

test("ranks score first, then wave, then kills for tied battles", () => {
  const saved = storage();
  let best = { score: 100, wave: 2, kills: 10 };
  for (const next of [
    { score: 101, wave: 1, kills: 1 },
    { score: 101, wave: 2, kills: 1 },
    { score: 101, wave: 2, kills: 2 },
  ]) {
    best = recordBestBattle(best, next, () => saved);
    assert.deepEqual(best, next);
  }
});

test("uses existing history when no valid best battle is saved", () => {
  const saved = storage();
  const best = { score: -10, wave: 2, kills: 5 };
  assert.deepEqual(
    readBestBattle([{ score: -20, wave: 1, kills: 3 }, best], () => saved),
    best,
  );
  const corrupt = { getItem: () => "broken" };
  assert.deepEqual(
    readBestBattle([best], () => corrupt),
    best,
  );
  assert.equal(
    readBestBattle([], () => ({
      getItem: () => '{"score":3,"wave":1,"kills":-1}',
    })),
    null,
  );
});

test("blocked storage keeps best battle in memory", () => {
  const blocked = () => {
    throw new Error("blocked");
  };
  const best = { score: 0, wave: 1, kills: 0 };
  assert.equal(readBestBattle([], blocked), null);
  assert.deepEqual(
    recordBestBattle(null, { ...best, phase: "gameover" }, blocked),
    best,
  );
});
