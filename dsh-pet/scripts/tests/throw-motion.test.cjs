const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function harness(reduced = false) {
  let time = 0,
    n = 0;
  const queue = new Map();
  const context = {
    window: { matchMedia: () => ({ matches: reduced }) },
    performance: { now: () => time },
    requestAnimationFrame: (cb) => {
      queue.set(++n, cb);
      return n;
    },
    cancelAnimationFrame: (id) => queue.delete(id),
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../../runtime/electron-helper/throw-motion.js'), 'utf8'),
    context,
  );
  return {
    Motion: context.PetThrowMotion,
    queue,
    tick(t) {
      time = t;
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((cb) => cb(t));
    },
  };
}
test('flight tilt follows direction, scales are bounded for extreme/invalid inputs', () => {
  const { Motion } = harness();
  for (const vx of [-100000, -2400, 0, 2400, 100000, NaN])
    for (const vy of [-1e9, 0, 1e9, NaN]) {
      const p = Motion.poseAt({ mode: 'flight', vx, vy, started: 0 }, 300);
      assert.ok(Number.isFinite(p.angle) && Math.abs(p.angle) <= 27);
      assert.ok(p.sx > 0.7 && p.sx < 1.3 && p.sy > 0.7 && p.sy < 1.3);
    }
  assert.ok(Motion.poseAt({ mode: 'flight', vx: 1600, vy: -1000, started: 0 }, 0).angle > 0);
  assert.ok(Motion.poseAt({ mode: 'flight', vx: -1600, vy: -1000, started: 0 }, 0).angle < 0);
});
test('ground compresses vertically; wall/pet compress horizontally, then recover', () => {
  const { Motion } = harness();
  for (const kind of ['ground', 'ceiling', 'wall', 'pet']) {
    const s = { mode: 'idle', vx: 0, vy: 0, started: 0, impact: { kind, at: 0, strength: 0.3, direction: 1 } };
    const p = Motion.poseAt(s, 70);
    if (kind === 'ground' || kind === 'ceiling') assert.ok(p.sy < 1 && p.sx > 1);
    else assert.ok(p.sx < 1 && p.sy > 1);
    const end = Motion.poseAt(s, 500);
    assert.equal(end.sx, 1);
    assert.equal(end.sy, 1);
    assert.equal(end.active, false);
  }
});
test('airborne frames remain active; settling stops rAF; grabbing resets artwork and impact', () => {
  const h = harness();
  const el = { style: {}, dataset: {} };
  const m = new h.Motion(el);
  m.set('flight', 1200, -800);
  h.tick(100);
  assert.equal(el.dataset.motion, 'flight');
  assert.equal(h.queue.size, 1);
  m.impact('wall', 1700, 1);
  h.tick(170);
  assert.equal(el.dataset.impact, 'wall');
  m.set('idle');
  h.tick(800);
  assert.equal(h.queue.size, 0);
  assert.equal(el.style.transform, '');
  m.set('flight');
  m.impact('ground', 1800);
  m.reset();
  assert.equal(h.queue.size, 0);
  assert.equal(el.dataset.impact, undefined);
});
test('reduced motion keeps original video animation with no transform loop', () => {
  const h = harness(true);
  const el = { style: {}, dataset: {} };
  const m = new h.Motion(el);
  m.set('flight', 3000, -2000);
  m.impact('pet', 2000);
  assert.equal(h.queue.size, 0);
  assert.equal(el.style.transform, '');
});
test('floor sliding keeps upright proportions and a small lean; wall recoils away', () => {
  const { Motion } = harness();
  const pose = Motion.poseAt({ mode: 'flight', grounded: true, vx: 2400, vy: 0, started: 0 }, 500);
  assert.ok(Math.abs(pose.angle) <= 3);
  assert.equal(pose.sx, 1);
  assert.equal(pose.sy, 1);
  const wall = Motion.poseAt(
    { mode: 'idle', started: 0, impact: { kind: 'wall', at: 0, strength: 0.3, direction: 1 } },
    70,
  );
  assert.ok(wall.angle < 0);
});
