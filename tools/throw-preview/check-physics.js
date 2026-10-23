async (page) => {
  const assert = {
    ok(value, message = "assertion failed") {
      if (!value) throw new Error(message);
    },
    equal(a, b) {
      if (a !== b) throw new Error(JSON.stringify({ expected: b, actual: a }));
    },
    deepEqual(a, b) {
      if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(JSON.stringify({ expected: b, actual: a }));
    },
  };
  const output = "output/playwright";
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.reload();
  await page.waitForFunction(
    () =>
      window.preview?.pet.videoB.readyState >= 2 ||
      window.preview?.pet.videoA.readyState >= 2,
  );
  await page.waitForFunction(() =>
    preview.pet.motion.videoArt.videos.every((v) => v.readyState >= 2),
  );
  const art = await page.evaluate(async () => {
    preview.pet.facing = "right";
    preview.pet.startThrow(300, 320, 1000, -500);
    await new Promise((r) => setTimeout(r, 100));
    const p = preview.pet;
    const position =
      p.motion.videoArt.videos[p.motion.videoArt.front].currentTime;
    await new Promise((r) => setTimeout(r, 150));
    return {
      visible: +getComputedStyle(p.motion.art).opacity > 0.98,
      videoHidden:
        +getComputedStyle(p.front === 0 ? p.videoA : p.videoB).opacity < 0.02,
      framesAdvance:
        position !==
        p.motion.videoArt.videos[p.motion.videoArt.front].currentTime,
      mirror: p.motion.art.style.transform,
    };
  });
  assert.ok(art.visible && art.videoHidden && art.framesAdvance);
  assert.equal(art.mirror, "scaleX(-1)");
  await page.evaluate(() => {
    preview.pet.facing = "left";
    preview.reset();
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const scenarios = [];
  for (const [button, kind] of [
    ["#throw", "ground"],
    ["#wall", "wall"],
    ["#pets", "pet"],
  ]) {
    await page.click(button);
    const result = await page.evaluate(async (kind) => {
      const result = {
        kind,
        flight: false,
        loop: false,
        tilt: false,
        impacts: [],
        rest: false,
        restPose: false,
      };
      const deadline = performance.now() + 13000;
      const p = preview.pet;
      while (performance.now() < deadline) {
        const layer = p.motion.layer;
        if (p.flightPose) {
          result.flight = true;
          result.loop ||= (p.front === 0 ? p.videoA : p.videoB).loop;
        }
        result.tilt ||=
          !!layer.style.transform &&
          !layer.style.transform.startsWith("rotate(0.00deg)");
        const hit = layer.dataset.impact;
        if (hit && !result.impacts.includes(hit)) result.impacts.push(hit);
        if (
          result.flight &&
          !p.flightPose &&
          p.motion.frame === null &&
          (!preview.other || !preview.other.flightPose)
        ) {
          result.rest = true;
          result.restPose =
            layer.style.transform === "" && p.anim === "待机呼吸休闲";
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      return result;
    }, kind);
    assert.ok(
      result.flight && result.loop && result.tilt,
      JSON.stringify(result),
    );
    assert.ok(result.impacts.includes(kind), JSON.stringify(result));
    assert.ok(result.rest && result.restPose, JSON.stringify(result));
    scenarios.push(result);
  }
  // Grab mid-flight, then gently release: pending flight animation must not win a later video load race.
  await page.click("#throw");
  const grabbed = await page.evaluate(async () => {
    const p = preview.pet;
    await new Promise((r) => setTimeout(r, 180));
    p.onPointerDown({
      button: 0,
      pointerId: 1,
      screenX: 500,
      screenY: 350,
      clientX: 200,
      clientY: 130,
    });
    p.dragState.dragging = true;
    p.dragTrail = [];
    p.onPointerUp();
    await new Promise((r) => setTimeout(r, 350));
    return {
      flight: p.flightPose,
      throwing: p.throwRef !== null,
      motion: p.motion.layer.style.transform,
      anim: p.anim,
    };
  });
  assert.equal(grabbed.flight, false);
  assert.equal(grabbed.throwing, false);
  assert.equal(grabbed.motion, "");
  assert.equal(grabbed.anim, "待机呼吸休闲");
  // Actual pointer sequence with real captured pointer input, not only direct method calls.
  await page.click("#reset");
  const box = await page.locator(".pet-hit").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 - 40,
    box.y + box.height / 2 - 35,
    { steps: 6 },
  );
  await page.waitForTimeout(60);
  const dragging = await page.evaluate(() => ({
    active: preview.pet.dragState.active,
    dragging: preview.pet.dragState.dragging,
    mode: preview.pet.motion.state.mode,
  }));
  assert.ok(dragging.active && dragging.dragging);
  assert.equal(dragging.mode, "drag");
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const gentle = await page.evaluate(() => ({
    flying: preview.pet.flightPose,
    pose: preview.pet.motion.layer.style.transform,
  }));
  assert.equal(gentle.flying, false);
  assert.equal(gentle.pose, "");
  // Work-status/balance-style animation requests cannot replace flight artwork.
  await page.click("#throw");
  const protectedPose = await page.evaluate(() => {
    const p = preview.pet;
    p.playOnce("被吓一跳");
    return { anim: p.anim, once: p.once };
  });
  assert.equal(protectedPose.anim, "被鼠标拖拽悬空反馈");
  assert.equal(protectedPose.once, false);
  await page.waitForTimeout(200);
  await page.screenshot({ path: output + "/dsh-pet-motion-flight.png" });
  // Opposite-side impact, and head-first ceiling hit.
  const extra = await page.evaluate(async () => {
    const p = preview.pet;
    const seen = [];
    preview.reset();
    p.startThrow(-120, 40, -1300, -1400);
    const deadline = performance.now() + 1000;
    while (performance.now() < deadline) {
      const k = p.motion.layer.dataset.impact;
      if (k && !seen.includes(k)) seen.push(k);
      await new Promise((r) => setTimeout(r, 8));
    }
    return seen;
  });
  assert.ok(
    extra.includes("wall") && extra.includes("ceiling"),
    JSON.stringify(extra),
  );
  // Reduced-motion requests suppress new transforms while preserving original flight physics/video.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.click("#throw");
  await page.waitForTimeout(100);
  const reduced = await page.evaluate(() => ({
    flying: preview.pet.flightPose,
    pose: preview.pet.motion.layer.style.transform,
    frames: preview.pet.motion.frame,
  }));
  assert.ok(reduced.flying);
  assert.equal(reduced.pose, "");
  assert.equal(reduced.frames, null);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.click("#reset");
  // Failed custom-art loads retain upstream videos and physics; other species never use this artwork.
  await page.route("**/throw-flight.webm", (route) => route.abort());
  await page.reload();
  await page.waitForFunction(() => !!window.preview?.pet);
  const fallback = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 200));
    const p = preview.pet;
    p.startThrow(300, 320, 1000, -500);
    await new Promise((r) => setTimeout(r, 150));
    const other = new PetSprite({
      ...p.pet,
      id: "custom-species",
      assetRoot: "custom-species",
    });
    const customArt = !!other.motion.art;
    other.dispose();
    return {
      flying: p.flightPose,
      hasArt: !!p.motion.art && !p.motion.videoArt.disabled,
      videoHidden:
        +getComputedStyle(p.front === 0 ? p.videoA : p.videoB).opacity < 0.02,
      customArt,
    };
  });
  assert.ok(fallback.flying);
  assert.equal(fallback.hasArt, false);
  assert.equal(fallback.videoHidden, false);
  assert.equal(fallback.customArt, false);
  await page.unroute("**/throw-flight.webm");
  await page.reload();
  await page.waitForFunction(() => !!preview.pet.motion.art);
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    art,
    scenarios,
    grabbed,
    dragging,
    gentle,
    protectedPose,
    extra,
    reduced,
    fallback,
    errors,
  };
  return report;
}
