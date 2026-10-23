async (page) => {
  const ok = (value, message) => {
    if (!value) throw Error(message);
  };
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.reload();
  await page.waitForFunction(() =>
    window.preview?.pet.motion.videoArt.videos.every((v) => v.readyState >= 2),
  );
  const result = await page.evaluate(async () => {
    const p = preview.pet,
      art = p.motion.videoArt,
      wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const snapshot = () => ({
      phase: art.phase,
      action: art.action,
      visible: art.visible,
      grounded: p.motion.state.grounded,
      anim: p.anim,
      time: art.videos[art.front].currentTime,
      rate: art.videos[art.front].playbackRate,
    });
    preview.reset();
    p.updateThrowMotion("drag", 1000, 0, p.pos.x, VIEW.h - p.height);
    await wait(250);
    const floor = snapshot();
    const token = art.token;
    for (let n = 0; n < 40; n++) {
      p.updateThrowMotion("drag", 1000, 0, p.pos.x, VIEW.h - p.height);
      await wait(10);
    }
    floor.noReplay = token === art.token;
    floor.transform = p.motion.layer.style.transform;
    p.stopThrow();
    p.motion.set("drag");
    await wait(100);
    p.motion.set("flight", 1100, -500);
    await wait(160);
    const release = snapshot();
    const launchToken = art.token;
    await wait(120);
    release.once = launchToken === art.token;
    const loopDeadline = performance.now() + 2000;
    while (art.phase !== "loop" && performance.now() < loopDeadline)
      await wait(20);
    const loop = snapshot();
    const actions = [];
    for (const kind of ["wall", "ceiling", "ground"]) {
      p.motion.impact(kind, 1000, 1);
      await wait(180);
      actions.push({ kind, ...snapshot() });
      await wait(850);
    }
    preview.reset();
    const physics = p.physics;
    p.physics = { ...physics, restitution: 0 };
    p.startThrow(300, VIEW.h - p.height - 3, 400, 1100);
    const landings = [];
    const impact = p.motion.impact.bind(p.motion);
    p.motion.impact = (...args) => {
      if (args[0] === "ground") landings.push(performance.now());
      return impact(...args);
    };
    await wait(4200);
    const resting = snapshot();
    resting.throwing = p.throwRef !== null;
    resting.frame = p.motion.frame;
    p.motion.impact = impact;
    p.physics = physics;
    // Resting on the floor cannot acquire a landing or a launch just by moving sideways.
    preview.reset();
    p.startThrow(300, VIEW.h - p.height, 500, 0);
    await wait(100);
    const slide = snapshot();
    await wait(2000);
    slide.end = snapshot();
    p.stopThrow();
    p.motion.set("flight", 1500, -500);
    await wait(100);
    p.stopThrow();
    p.motion.set("drag");
    await wait(120);
    const grab = snapshot();
    p.motion.reset();
    preview.reset();
    return {
      floor,
      release,
      loop,
      actions,
      landings: landings.length,
      resting,
      slide,
      grab,
    };
  });
  ok(
    !result.floor.visible &&
      result.floor.grounded &&
      result.floor.noReplay &&
      result.floor.anim === "待机呼吸休闲",
    "floor stance " + JSON.stringify(result),
  );
  ok(
    result.release.phase === "launch" &&
      result.release.once &&
      result.release.rate === 2.5,
    "release " + JSON.stringify(result),
  );
  ok(
    result.loop.phase === "loop" &&
      result.loop.rate === 1 &&
      result.loop.time >= 59 / 24,
    "normal suspended loop " + JSON.stringify(result),
  );
  ok(
    result.actions.every(
      (a) =>
        a.phase === "impact" &&
        a.action === a.kind &&
        a.visible &&
        a.time > { wall: 2.75, ceiling: 4.95, ground: 7.05 }[a.kind],
    ),
    "direction cues " + JSON.stringify(result),
  );
  ok(
    result.landings === 1 &&
      !result.resting.visible &&
      !result.resting.throwing &&
      result.resting.frame === null,
    "landing edge " + JSON.stringify(result),
  );
  ok(
    !result.slide.visible &&
      !result.slide.end.visible &&
      result.slide.anim === "待机呼吸休闲",
    "floor slide " + JSON.stringify(result),
  );
  ok(result.grab.phase === "intro", "interrupt " + JSON.stringify(result));
  return { passed: true, ...result };
}
