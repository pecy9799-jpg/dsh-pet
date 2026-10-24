const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function harness(surface = false) {
  let now = 0;
  const elements = [],
    timers = new Set();
  const painted = [];
  const context2d = { drawImage: (video) => painted.push({ video, time: video.currentTime }) };
  const document = {
    createElement(tag) {
      const classes = new Set();
      const e = {
        style: {},
        readyState: 2,
        currentTime: 0,
        src: '',
        paused: true,
        classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n) },
        appendChild() {},
        addEventListener() {},
        pause() {
          this.paused = true;
        },
        play() {
          this.paused = false;
          queueMicrotask(() => this.onplaying?.());
          return Promise.resolve();
        },
      };
      if (surface && tag === 'canvas') e.getContext = () => context2d;
      elements.push(e);
      return e;
    },
  };
  const context = {
    document,
    URL,
    performance: { now: () => now },
    setTimeout: (fn) => {
      timers.add(fn);
      return fn;
    },
    clearTimeout: (fn) => timers.delete(fn),
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname + '/../../runtime/electron-helper/throw-video.js', 'utf8'), context);
  return {
    art: new context.PetThrowVideo({ appendChild() {} }, 'file:///test/'),
    advance: (ms) => (now += ms),
    elements,
    timers,
    painted,
  };
}
const flush = () => new Promise(queueMicrotask);

test('launch follows flight direction while collision and native handoff keep their own facing', async () => {
  const { art } = harness();
  art.tick('flight');
  await flush();
  assert.equal(art.phase, 'launch');
  assert.equal(art.mirror(false, true), true);
  assert.equal(art.mirror(true, false), false);
  art.impact('wall', 1);
  art.tick('flight');
  await flush();
  assert.equal(art.mirror(false, false), true);
  art.phase = 'native';
  assert.equal(art.mirror(false, true), false);
  assert.equal(art.mirror(true, false), true);
});
test('drag transitions stay fast, suspended loop stays normal, resting recovery stops', async () => {
  const { art, timers } = harness();
  art.tick('drag');
  await flush();
  assert.equal(art.phase, 'intro');
  assert.equal(art.videos[art.front].playbackRate, 2.5);
  art.videos[art.front].currentTime = 2.5;
  art.tick('drag');
  assert.equal(art.phase, 'loop');
  assert.equal(art.videos[art.front].playbackRate, 1);
  art.videos[art.front].currentTime = 6.2;
  art.tick('drag');
  await flush();
  assert.equal(art.phase, 'loop');
  assert.equal(art.videos[art.front].currentTime, 59 / 24);
  art.tick('idle');
  await flush();
  assert.equal(art.phase, 'outro');
  assert.equal(art.videos[art.front].currentTime, 7.1);
  assert.equal(art.videos[art.front].playbackRate, 2.5);
  art.videos[art.front].currentTime = 9.95;
  assert.equal(art.tick('idle'), false);
  assert.ok(art.videos.every((v) => v.paused));
  assert.equal(timers.size, 0);
});
test('late playing callbacks cannot revive a canceled transition', async () => {
  const { art } = harness();
  art.tick('flight');
  const stale = art.videos[1].onplaying;
  art.stop();
  stale();
  await flush();
  assert.equal(art.phase, 'idle');
  assert.equal(art.visible, false);
  assert.ok(art.videos.every((v) => v.paused));
});
test('a new grab interrupts recovery; repeated impacts are throttled and direction is preserved', async () => {
  const { art, advance } = harness();
  art.tick('flight');
  await flush();
  art.tick('idle');
  await flush();
  art.tick('drag');
  await flush();
  assert.equal(art.phase, 'intro');
  art.impact('wall', -100);
  art.tick('drag');
  await flush();
  assert.equal(art.phase, 'impact');
  assert.equal(art.mirror(true), false);
  const token = art.token;
  art.impact('pet', 100);
  art.tick('drag');
  assert.equal(art.token, token);
  advance(500);
  art.impact('wall', 100);
  art.tick('drag');
  await flush();
  assert.equal(art.mirror(false), true);
  art.videos[art.front].currentTime = art.cues.wall[1];
  art.tick('drag');
  await flush();
  assert.equal(art.phase, 'loop');
});
test('failed media leaves artwork hidden and all video buffers stopped', async () => {
  const { art } = harness();
  art.tick('flight');
  await flush();
  art.disable();
  assert.equal(art.tick('flight'), false);
  assert.equal(art.visible, false);
  assert.ok(art.videos.every((v) => v.paused));
});
test('unavailable optional reaction video preserves the working airborne animation', async () => {
  const { art } = harness();
  art.tick('flight');
  await flush();
  art.impact('wall', 100);
  art.tick('flight');
  await flush();
  art.fail(art.videos[art.front]);
  await flush();
  assert.equal(art.reactions, null);
  assert.equal(art.disabled, false);
  assert.equal(art.phase, 'loop');
  const token = art.token;
  art.impact('wall', 100);
  assert.equal(art.token, token);
});
test('release plays launch exactly once; ceiling and ground use independent cues', async () => {
  const { art, advance } = harness();
  art.tick('drag');
  await flush();
  art.tick('flight');
  await flush();
  assert.equal(art.phase, 'launch');
  assert.equal(art.action, 'launch');
  const token = art.token;
  art.tick('flight');
  await flush();
  assert.equal(art.token, token);
  art.videos[art.front].currentTime = art.cues.launch[1];
  art.tick('flight');
  await flush();
  assert.equal(art.phase, 'loop');
  for (const kind of ['ceiling', 'ground']) {
    advance(300);
    art.impact(kind, 1);
    art.tick('flight', kind === 'ground');
    await flush();
    assert.equal(art.phase, 'impact');
    assert.equal(art.action, kind);
    assert.equal(art.videos[art.front].currentTime, art.cues[kind][0]);
    assert.equal(art.mirror(true), true);
  }
  // The floor holds a normal stance after one landing, even if physics is still sliding.
  art.videos[art.front].currentTime = art.cues.ground[1];
  art.tick('flight', true);
  await flush();
  assert.equal(art.visible, false);
  const endToken = art.token;
  for (let n = 0; n < 100; n++) art.tick('flight', true);
  assert.equal(art.token, endToken);
  assert.equal(art.phase, 'idle');
  art.tick('flight', false);
  await flush();
  assert.equal(art.phase, 'loop');
});
test('a floor-only drag never starts the airborne art or replays a landing', async () => {
  const { art } = harness();
  for (let n = 0; n < 100; n++) art.tick('drag', true);
  assert.equal(art.visible, false);
  assert.equal(art.token, 0);
  art.tick('drag', false);
  await flush();
  assert.equal(art.phase, 'intro');
  art.tick('drag', true);
  await flush();
  assert.equal(art.visible, false);
});
test('a cold source seeks after metadata and never commits an obsolete load', async () => {
  const { art } = harness();
  const next = art.videos[1];
  let ready;
  next.load = () => {
    next.readyState = 0;
    next.currentTime = 0;
  };
  next.addEventListener = (name, callback) => {
    if (name === 'loadedmetadata') ready = callback;
  };
  art.tick('flight');
  await flush();
  assert.equal(art.visible, false);
  assert.equal(next.paused, true);
  next.readyState = 1;
  ready();
  await flush();
  assert.equal(art.phase, 'launch');
  assert.equal(next.currentTime, art.cues.launch[0]);
  art.stop();
  next.src = 'file:///test/old.webm';
  art.tick('flight');
  const stale = ready;
  art.stop();
  stale();
  await flush();
  assert.equal(art.visible, false);
  assert.equal(next.paused, true);
});

test('a cold landing retains the airborne picture until the landing is ready', async () => {
  const { art, advance } = harness();
  art.tick('drag');
  await flush();
  const front = art.front;
  const next = art.videos[1 - front];
  let ready;
  next.load = () => {
    next.readyState = 0;
  };
  next.addEventListener = (event, callback) => {
    if (event === 'loadedmetadata') ready = callback;
  };
  art.impact('ground', 1);
  assert.equal(art.tick('flight', true), true);
  assert.equal(art.front, front);
  assert.equal(art.visible, true);
  assert.equal(art.videos[front].paused, true);
  // A settling bounce while metadata is pending cannot cancel/restart the landing.
  const token = art.token;
  art.tick('flight', false);
  art.tick('flight', true);
  advance(300);
  art.impact('ground', 1);
  art.tick('flight', true);
  assert.equal(art.token, token);
  assert.equal(art.visible, true);
  next.readyState = 2;
  ready();
  await flush();
  assert.equal(art.phase, 'impact');
  assert.equal(art.action, 'ground');
});

test('recovery waits for the sought video frame and cancels stale frame callbacks', async () => {
  const { art } = harness();
  art.tick('drag');
  await flush();
  const front = art.front;
  const next = art.videos[1 - front];
  let present,
    cancelled = 0;
  next.requestVideoFrameCallback = (callback) => {
    present = callback;
    return 7;
  };
  next.cancelVideoFrameCallback = (id) => {
    assert.equal(id, 7);
    cancelled++;
  };
  art.tick('idle');
  await flush();
  assert.equal(art.front, front);
  assert.equal(art.visible, true);
  present(0, { mediaTime: 0 });
  assert.equal(art.front, front);
  present(0, { mediaTime: 7.1 });
  assert.equal(art.phase, 'outro');
  assert.equal(art.front, 1 - front);
  art.tick('drag');
  await flush();
  // Arm another recovery, then grab it before its frame is presented.
  art.tick('idle');
  await flush();
  const stale = present;
  art.stop();
  stale(0, { mediaTime: 7.1 });
  assert.equal(cancelled, 1);
  assert.equal(art.visible, false);
  assert.equal(art.frameRequest, null);
});

test('the persistent surface retains its last picture while the next decoder seeks', async () => {
  const { art, painted } = harness(true);
  art.tick('drag');
  await flush();
  const current = art.videos[art.front];
  assert.equal(painted.at(-1).video, current);
  const count = painted.length;
  current.seeking = true;
  assert.equal(art.paint(current), false);
  assert.equal(painted.length, count);
  current.seeking = false;
  current.readyState = 0;
  assert.equal(art.paint(current), false);
  assert.equal(painted.length, count);
});

test('native recovery keeps the surface until the native layer has been painted', async () => {
  const { art, painted } = harness(true);
  const native = { readyState: 4, currentTime: 1 };
  art.nativeVideo = () => native;
  art.tick('drag');
  await flush();
  art.hide(true);
  assert.equal(art.visible, true);
  assert.equal(art.phase, 'native');
  assert.equal(painted.at(-1).video, native);
  art.tick('idle');
  art.tick('idle');
  assert.equal(art.visible, true);
  art.tick('idle');
  assert.equal(art.visible, false);
  assert.equal(art.phase, 'idle');
});

test('an explicit stop interrupts native recovery and a failed native load is bounded', async () => {
  const { art, advance } = harness(true);
  art.nativeVideo = () => ({ readyState: 0 });
  art.tick('drag');
  await flush();
  art.hide(true);
  art.stop();
  assert.equal(art.visible, false);
  art.tick('drag');
  await flush();
  art.hide(true);
  advance(1100);
  assert.equal(art.tick('idle'), false);
  assert.equal(art.phase, 'idle');
});
