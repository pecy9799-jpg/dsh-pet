async (page) => {
  await page.reload();
  await page.waitForFunction(() =>
    window.preview?.pet.motion.videoArt.videos.every((v) => v.readyState >= 2),
  );
  await page.waitForTimeout(250);
  const result = await page.evaluate(async () => {
    const p = preview.pet,
      a = p.motion.videoArt,
      wait = (ms) => new Promise((r) => setTimeout(r, ms));
    preview.reset();
    p.sendBounds(340, 240);
    await wait(250);
    let sampling = true;
    const rows = [];
    const sample = () => {
      const rootOpacity = +getComputedStyle(a.root).opacity;
      const opacities = [p.videoA, p.videoB]
        // During native promotion the canvas is a copy of that same native frame.
        .map((v) => (a.phase === "native" ? 0 : +getComputedStyle(v).opacity))
        .concat(
          a.videos.map(
            (v) => rootOpacity * Number(getComputedStyle(v).opacity),
          ),
        );
      if (a.context) opacities.push(rootOpacity);
      if (p.motion.state.mode !== "idle" || a.visible)
        rows.push({
          phase: a.phase,
          count: opacities.filter((x) => x > 0.01).length,
          coverage: 1 - opacities.reduce((alpha, x) => alpha * (1 - x), 1),
        });
      if (sampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    const grab = () => {
      p.lastPressAt = 0;
      p.onPointerDown({
        button: 0,
        pointerId: 1,
        screenX: 500,
        screenY: 350,
        clientX: 200,
        clientY: 130,
      });
      p.onPointerMove({ screenX: 530, screenY: 320 });
    };
    grab();
    await wait(1100);
    p.dragTrail = [];
    p.onPointerUp();
    await wait(1400);
    grab();
    await wait(500);
    const now = performance.now();
    p.dragTrail = [
      { t: now - 50, x: 400, y: 300 },
      { t: now, x: 480, y: 270 },
    ];
    p.onPointerUp();
    await wait(1500);
    p.stopThrow();
    await wait(300);
    // Repeat quick grab/release around a pending media handoff.
    for (let n = 0; n < 3; n++) {
      grab();
      await wait(35);
      p.dragTrail = [];
      p.onPointerUp();
      await wait(60);
    }
    const settleStart = performance.now();
    while (
      (a.phase !== "idle" || a.busy || p.motion.frame !== null) &&
      performance.now() - settleStart < 4000
    )
      await wait(20);
    sampling = false;
    const phases = [...new Set(rows.map((x) => x.phase))];
    return {
      samples: rows.length,
      maxSimultaneousPictures: Math.max(...rows.map((x) => x.count)),
      minimumCoverage: Math.min(...rows.map((x) => x.coverage)),
      phases,
      rest: { phase: a.phase, busy: a.busy, frame: p.motion.frame },
    };
  });
  if (
    result.maxSimultaneousPictures !== 1 ||
    result.minimumCoverage < 0.99 ||
    !result.phases.includes("launch") ||
    !result.phases.includes("outro") ||
    result.rest.busy ||
    result.rest.phase !== "idle" ||
    result.rest.frame !== null
  )
    throw Error(JSON.stringify(result));
  return { passed: true, ...result };
}
