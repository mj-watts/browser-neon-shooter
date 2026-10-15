import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";

test("civilian alarm starts on the fourth accepted hit, repeats and ends on destruction", () => {
  const events = [];
  const game = new ShooterGame(
    (event) => events.push(event),
    () => 0.5,
  );
  game.phase = "intermission";
  game.elapsed = -100;
  game.supplyCooldown = game.civilianCooldown = game.groundCooldown = 100;
  game.spawnCivilian();
  const civilian = game.civilians[0];
  civilian.y = 5;
  const alarms = () => events.filter((event) => event.type === "civilianAlarm");
  for (let hits = 1; hits <= 4; hits++) {
    civilian.hitCooldown = 0;
    game.hitCivilian(civilian);
    assert.equal(alarms().length, hits === 4 ? 1 : 0);
    game.hitCivilian(civilian);
    assert.equal(civilian.hp, 5 - hits, "volley cooldown still applies");
  }
  game.paused = true;
  for (let frame = 0; frame < 20; frame++) game.update(0.05);
  assert.equal(alarms().length, 1, "pause freezes the alarm cadence");
  game.paused = false;
  for (let frame = 0; frame < 20; frame++) game.update(0.05);
  assert.equal(alarms().length, 2);
  assert.equal(alarms()[0].id, civilian.id);
  civilian.hitCooldown = 0;
  game.hitCivilian(civilian);
  for (let frame = 0; frame < 20; frame++) game.update(0.05);
  assert.equal(alarms().length, 2);
  assert.equal(game.fallingCivilians.length, 1);
});

test("rescuing a critically damaged civilian stops its alarm", () => {
  const events = [];
  const game = new ShooterGame(
    (event) => events.push(event),
    () => 0.5,
  );
  game.phase = "intermission";
  game.elapsed = -100;
  game.supplyCooldown = game.civilianCooldown = game.groundCooldown = 100;
  game.spawnCivilian();
  const civilian = game.civilians[0];
  civilian.y = 0;
  for (let hit = 0; hit < 4; hit++) {
    civilian.hitCooldown = 0;
    game.hitCivilian(civilian);
  }
  civilian.y = -17.99;
  civilian.alarmCooldown = 0;
  for (let frame = 0; frame < 40; frame++) game.update(0.05);
  assert.equal(
    events.filter((event) => event.type === "civilianAlarm").length,
    1,
  );
  assert.equal(
    events.filter((event) => event.type === "civilianRescued").length,
    1,
  );
  assert.equal(game.civilians.length, 0);
});
