async (page) => {
  await page.reload();
  await page.waitForFunction(
    () =>
      window.preview?.pet.videoA.readyState >= 2 ||
      window.preview?.pet.videoB.readyState >= 2,
  );
  const result = await page.evaluate(async () => {
    const p = preview.pet,
      wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const physics = p.physics;
    preview.reset();
    preview.playbackReports.length = 0;
    p.physics = { ...physics, gravity: 0 };
    p.startThrow(300, 180, 200, 0);
    await wait(200);
    p.playOnce("被吓一跳", "explicit-flight");
    await wait(350);
    const native = p.front === 0 ? p.videoA : p.videoB;
    const explicit = {
      flying: p.flightPose,
      blocked: p.motion.blocked,
      customVisible: p.motion.videoArt.visible,
      nativeOpacity: +getComputedStyle(native).opacity,
      playing: preview.playbackReports.some(
        (x) => x.id === "explicit-flight" && x.status === "playing",
      ),
    };
    await new Promise((r) => {
      if (native.readyState >= 1) r();
      else native.addEventListener("loadedmetadata", r, { once: true });
    });
    native.currentTime = native.duration - 0.1;
    await wait(400);
    explicit.ended = preview.playbackReports.some(
      (x) => x.id === "explicit-flight" && x.status === "ended",
    );
    explicit.resumed = !p.motion.blocked;
    p.stopThrow();
    p.playOnce("被吓一跳", "cancel-by-drag");
    await wait(150);
    p.lastPressAt = 0;
    p.onPointerDown({
      button: 0,
      pointerId: 1,
      screenX: 500,
      screenY: 350,
      clientX: 200,
      clientY: 130,
    });
    p.onPointerMove({ screenX: 540, screenY: 320 });
    await wait(180);
    const cancelled = preview.playbackReports.filter(
      (x) => x.id === "cancel-by-drag" && x.status === "cancelled",
    ).length;
    p.dragTrail = [];
    p.onPointerUp();
    await wait(200);
    p.startThrow(300, 180, 200, 0);
    await wait(100);
    p.applyFreeze(true);
    await wait(100);
    const frozen = {
      artHidden: !p.motion.videoArt.visible,
      nativePaused: (p.front === 0 ? p.videoA : p.videoB).paused,
    };
    p.playOnce("被吓一跳", "explicit-frozen");
    await wait(250);
    frozen.explicitAllowed = preview.playbackReports.some(
      (x) => x.id === "explicit-frozen" && x.status === "playing",
    );
    p.applyFreeze(false);
    p.stopThrow();
    p.moveToCenter(0.4, 0.6, "instant", 0);
    const positioned =
      Math.abs(p.pos.x + p.halfW - VIEW.w * 0.4) <= 1 &&
      Math.abs(p.pos.y + p.halfH - VIEW.h * 0.6) <= 1;
    p.lastPressAt = performance.now() - 60;
    p.onPointerDown({
      button: 0,
      pointerId: 1,
      screenX: 500,
      screenY: 350,
      clientX: 200,
      clientY: 130,
    });
    const slingArmed = p.dragState.sling;
    p.onPointerMove({ screenX: 650, screenY: 300 });
    await wait(200);
    p.onPointerUp();
    await wait(60);
    const sling = {
      armed: slingArmed,
      flying: p.flightPose,
      vx: p.throwState?.vx,
    };
    p.stopThrow();
    const hits = [];
    const impact = p.motion.impact.bind(p.motion);
    p.motion.impact = (...args) => {
      hits.push(args[0]);
      return impact(...args);
    };
    p.startThrow(-130, 180, -40000, 0);
    await wait(100);
    p.stopThrow();
    p.motion.impact = impact;
    p.physics = physics;
    preview.reset();
    return {
      explicit,
      cancelled,
      frozen,
      positioned,
      sling,
      highSpeedHits: hits,
      reports: preview.playbackReports,
    };
  });
  if (
    !result.explicit.flying ||
    !result.explicit.blocked ||
    result.explicit.customVisible ||
    result.explicit.nativeOpacity < 0.98 ||
    !result.explicit.playing ||
    !result.explicit.ended ||
    !result.explicit.resumed ||
    result.cancelled !== 1 ||
    !result.frozen.artHidden ||
    !result.frozen.nativePaused ||
    !result.frozen.explicitAllowed ||
    !result.positioned ||
    !result.sling.armed ||
    !result.sling.flying ||
    !Number.isFinite(result.sling.vx) || result.sling.vx >= 0 ||
    !result.highSpeedHits.includes("wall")
  )
    throw Error(JSON.stringify(result));
  return { passed: true, ...result };
}
