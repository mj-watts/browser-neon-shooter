import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShooterGame } from '../assets/js/ShooterGame.js';
import { POWERUPS, supplyPower } from '../assets/js/Powerups.js';
import { POWER_ICONS } from '../assets/js/BlockIcons.js';

function arena() {
  const events = [];
  const game = new ShooterGame(event => events.push(event), () => 0.5);
  game.phase = 'intermission';
  game.elapsed = -100;
  game.supplyCooldown = game.civilianCooldown = game.groundCooldown = game.gateCooldown = game.capitalCooldown = 100;
  game.player.y = -8;
  return { game, events };
}

test('electric pickups have icons, durations and weighted supply slots', () => {
  assert.notDeepEqual(POWER_ICONS.emp, POWER_ICONS.orbit);
  for (const power of ['emp', 'chain']) {
    assert.ok(POWERUPS[power]?.duration > 0);
    assert.ok(POWER_ICONS[power]?.length);
    assert.ok(Array.from({length:1000}, (_,i) => supplyPower(i/1000)).includes(power));
  }
});

test('EMP immediately clears hostile fire, interrupts lasers and preserves friendly shots and civilians', () => {
  const {game, events} = arena();
  const friendly = {friendly:true, life:2};
  game.bullets = [{friendly:false, life:2}, friendly];
  game.groundEnemies = [{laserAttack:{warning:false, remaining:0.2}}];
  game.turretLasers = [{}];
  game.gateLasers = [{}];
  game.civilians = [{hp:5}];
  game.collectPowerup('emp');
  assert.deepEqual(game.bullets, [friendly]);
  assert.equal(game.empTime, 5);
  assert.equal(game.groundEnemies[0].laserAttack, null);
  assert.deepEqual(game.turretLasers, []);
  assert.deepEqual(game.gateLasers, []);
  assert.equal(game.civilians[0].hp, 5);
  assert.ok(events.some(event=>event.type==='empPulse'));
});

test('EMP suppresses ground and dreadnought turrets then lets them resume', () => {
  const {game} = arena();
  game.wave = 3;
  game.groundEnemies = [{id:100,kind:'turret',side:1,y:2,age:1,fireCooldown:0}];
  game.spawnCapitalShip();
  const ship=game.capitalShips[0];
  ship.y=0;
  ship.turrets.forEach(t=>{t.fireCooldown=0;});
  game.collectPowerup('emp');
  game.update(0.05);
  assert.equal(game.bullets.filter(b=>!b.friendly).length,0);
  assert.equal(game.turretLasers.length,0);
  game.empTime=0.01;
  game.update(0.05);
  assert.ok(game.bullets.some(b=>!b.friendly));
  assert.ok(game.groundEnemies[0].laserAttack?.warning);
});

test('EMP temporarily opens laser gates without destroying their turrets', () => {
  const {game} = arena();
  game.spawnLaserGate();
  assert.ok(game.gateLasers.length);
  game.collectPowerup('emp');
  game.refreshGateLasers();
  assert.equal(game.gateLasers.length,0);
  game.empTime=0;
  game.refreshGateLasers();
  assert.ok(game.gateLasers.length);
});

test('chain lightning hits four distinct nearby enemies, damages armour and ignores offscreen targets and civilians', () => {
  const {game, events} = arena();
  game.enemies = Array.from({length:5},(_,i)=>({id:i,x:0,y:-4+i*2,age:1,hp:10}));
  game.enemies.push({id:10,x:0,y:-5,age:-1,hp:10}, {id:11,x:0,y:40,age:1,hp:10});
  game.civilians=[{x:0,y:-5,hp:5}];
  game.collectPowerup('chain');
  game.updateElectrical(0.01,true);
  assert.deepEqual(game.enemies.map(e=>e.hp),[8,8,8,8,10,10,10]);
  assert.equal(game.civilians[0].hp,5);
  assert.equal(events.find(e=>e.type==='chainLightning').points.length,5);
  const hp=game.enemies[0].hp;
  game.updateElectrical(0.01,true);
  assert.equal(game.enemies[0].hp,hp);
  game.chainCooldown=0;
  game.enemies=[];
  game.groundEnemies=[{id:20,x:0,y:-4,age:0,hp:2,kind:'tank'}];
  game.updateElectrical(0.01,true);
  assert.equal(game.groundEnemies.length,0);
});

test('lightning needs firing and a target in range, and timers pause, expire and reset', () => {
  const {game,events}=arena();
  game.collectPowerup('chain');
  game.enemies=[{id:1,x:20,y:0,age:1,hp:10}];
  game.updateElectrical(0.05,true);
  assert.ok(!events.some(e=>e.type==='chainLightning'));
  game.enemies[0].x=0;
  game.updateElectrical(0.05,false);
  assert.equal(game.enemies[0].hp,10);
  game.collectPowerup('emp');
  const before=[game.chainTime,game.empTime];
  game.paused=true;
  game.update(0.05,{fire:true});
  assert.deepEqual([game.chainTime,game.empTime],before);
  game.paused=false;
  game.chainTime=0.01;
  game.updateElectrical(0.05,true);
  assert.equal(game.enemies[0].hp,10);
  game.reset();
  assert.equal(game.chainTime,0);
  assert.equal(game.empTime,0);
});


test('lightning reaches dreadnought turrets but cannot jump across a large gap', () => {
  const {game,events}=arena();
  game.spawnCapitalShip();
  const ship=game.capitalShips[0];
  ship.y=0;
  ship.turrets.forEach(t=>{t.destroyed=true;});
  const turret=ship.turrets[0];
  Object.assign(turret,{destroyed:false,x:0,y:-4,hp:4});
  game.enemies=[{id:200,x:0,y:10,age:1,hp:10}];
  game.collectPowerup('chain');
  game.updateElectrical(0.01,true);
  assert.equal(turret.hp,2);
  assert.equal(game.enemies[0].hp,10);
  assert.equal(events.find(e=>e.type==='chainLightning').points.length,2);
});
