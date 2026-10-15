import { test } from 'node:test';
import assert from 'node:assert/strict';
import ElectricEffects from '../assets/js/ElectricEffects.js';

test('electrical effects draw bounded lightning and an expanding EMP ring then clear', () => {
 const resources=[];
 const effect=new ElectricEffects(r=>{resources.push(r);return r;});
 effect.lightning([{x:0,y:-8},{x:2,y:0},{x:-1,y:3}]);
 assert.ok(effect.arcs.geometry.drawRange.count > 4);
 assert.ok(effect.arcs.geometry.drawRange.count <= 64);
 effect.pulse(1,2,40);
 assert.equal(effect.ring.visible,true);
 const scale=effect.ring.scale.x;
 effect.update(0.1);
 assert.ok(effect.ring.scale.x>scale);
 effect.update(1);
 assert.equal(effect.arcs.visible,false);
 assert.equal(effect.ring.visible,false);
 effect.pulse(0,0,40);
 effect.clear();
 assert.equal(effect.ring.visible,false);
 resources.forEach(r=>r.dispose());
});
