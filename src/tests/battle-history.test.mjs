import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readBattles,
  recordBattle,
  BATTLE_HISTORY_KEY,
} from "../assets/js/BattleHistory.js";

function storage(value = null) {
  return {
    value,
    getItem(key) {
      assert.equal(key, BATTLE_HISTORY_KEY);
      return this.value;
    },
    setItem(key, next) {
      assert.equal(key, BATTLE_HISTORY_KEY);
      this.value = next;
    },
  };
}

test("records only score, wave and kills and restores them after a reload", () => {
  const saved = storage();
  const battles = recordBattle(
    [],
    { score: -10, wave: 2, kills: 12, phase: "gameover" },
    () => saved,
  );
  assert.deepEqual(battles, [{ score: -10, wave: 2, kills: 12 }]);
  assert.deepEqual(
    readBattles(() => saved),
    battles,
  );
});

test("keeps the last ten games newest first", () => {
  const saved = storage();
  let battles = [];
  for (let i = 0; i < 12; i++)
    battles = recordBattle(
      battles,
      { score: i, wave: 1, kills: i },
      () => saved,
    );
  assert.equal(battles.length, 10);
  assert.deepEqual(
    battles.map((b) => b.score),
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  assert.deepEqual(
    readBattles(() => saved),
    battles,
  );
});

test("ignores malformed records and bounds restored history", () => {
  for (const value of [null, "broken", "{}", "null"])
    assert.deepEqual(
      readBattles(() => storage(value)),
      [],
    );
  const good = { score: 10, wave: 2, kills: 3 };
  const invalid = [
    { ...good, score: "10" },
    { ...good, wave: -1 },
    { ...good, kills: -1 },
    { ...good, kills: 1.5 },
    null,
  ];
  assert.deepEqual(
    readBattles(() =>
      storage(JSON.stringify([...invalid, ...Array(12).fill(good)])),
    ),
    Array(10).fill(good),
  );
});

test("blocked storage does not prevent in-memory battle history", () => {
  const blocked = () => {
    throw new Error("blocked");
  };
  assert.deepEqual(readBattles(blocked), []);
  const battle = { score: 0, wave: 1, kills: 0 };
  assert.deepEqual(recordBattle([], battle, blocked), [battle]);
});

test("uses browser localStorage by default", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage() };
  try {
    const battle = { score: 10, wave: 1, kills: 2 };
    recordBattle([], battle);
    assert.deepEqual(readBattles(), [battle]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
