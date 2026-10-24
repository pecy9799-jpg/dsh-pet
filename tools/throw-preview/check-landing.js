async (page) => {
  const results = [];
  for (const kind of ["gentle", "short-drop", "no-bounce", "cold-drop"]) {
    if (kind === "cold-drop")
      await page.route("**/throw-reactions.webm", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 180));
        await route.continue();
      });
    await page.reload();
    await page.waitForFunction(() =>
      window.preview?.pet.motion.videoArt.videos.every(
        (v) => v.readyState >= 2,
      ),
    );
    const result = await page.evaluate(async (kind) => {
      const p = preview.pet,
        a = p.motion.videoArt;
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      preview.reset();
      p.sendBounds(340, VIEW.h - p.height - 80);
      p.lastPressAt = -Infinity;
      p.onPointerDown({
        button: 0,
        pointerId: 1,
        screenX: 500,
        screenY: 350,
        clientX: 200,
        clientY: 130,
      });
      p.onPointerMove({ screenX: 530, screenY: 320 });
      await wait(700);
      p.stopDragFollow();
      if (!a.visible) throw Error("drag picture not ready");
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 45;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const rows = [];
      let previousPadding = new DOMMatrixReadOnly(
        getComputedStyle(p.stage).transform,
      ).m42;
      let maximumPaddingStep = 0;
      const releaseAt = performance.now();
      let sampling = true;
      const sample = () => {
        const padding = new DOMMatrixReadOnly(
          getComputedStyle(p.stage).transform,
        ).m42;
        if (performance.now() - releaseAt < 220)
          maximumPaddingStep = Math.max(
            maximumPaddingStep,
            Math.abs(padding - previousPadding),
          );
        previousPadding = padding;
        const rootOpacity = +getComputedStyle(a.root).opacity;
        const videos = [
          p.videoA,
          p.videoB,
          ...a.videos,
          ...(a.context ? [a.canvas] : []),
        ];
        const opacities = videos.map(
          (v, i) => +getComputedStyle(v).opacity * (i < 2 ? 1 : rootOpacity),
        );
        context.clearRect(0, 0, 80, 45);
        videos.forEach((v, i) => {
          if (
            opacities[i] > 0.01 &&
            (v.tagName === "CANVAS" || v.readyState >= 2)
          ) {
            context.globalAlpha = opacities[i];
            context.drawImage(v, 0, 0, 80, 45);
          }
        });
        context.globalAlpha = 1;
        const pixels = context.getImageData(0, 0, 80, 45).data;
        let opaque = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 64) opaque++;
        rows.push({
          phase: a.phase,
          action: a.action,
          busy: a.busy,
          visible: a.visible,
          opaque,
          count: opacities.filter(
            (o, i) => o > 0.01 && !(a.phase === "native" && i < 2),
          ).length,
          coverage: 1 - opacities.reduce((alpha, o) => alpha * (1 - o), 1),
        });
        if (sampling) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      if (kind === "gentle") {
        p.dragTrail = [];
        p.onPointerUp();
      } else {
        if (kind === "no-bounce") p.physics = { ...p.physics, restitution: 0 };
        const now = performance.now();
        p.dragTrail = [
          { t: now - 50, x: 400, y: 300 },
          { t: now, x: 400, y: 335 },
        ];
        p.onPointerUp();
      }
      const deadline = performance.now() + 6500;
      while (
        performance.now() < deadline &&
        (a.visible ||
          a.busy ||
          p.flightPose ||
          p.motion.frame !== null ||
          rows.length < 10)
      )
        await wait(20);
      sampling = false;
      const artRows = rows.filter((r) => r.visible || r.busy);
      let hidden = false,
        reentries = 0;
      for (const row of rows) {
        if (!row.visible) hidden = true;
        else if (hidden) {
          reentries++;
          hidden = false;
        }
      }
      const result = {
        kind,
        samples: rows.length,
        phases: [...new Set(rows.map((r) => r.phase))],
        sawLanding: rows.some((r) => r.action === "ground"),
        nativeFlashesBeforeAction: reentries,
        emptyPictures: rows.filter((r) => r.opaque < 100).length,
        maxSimultaneousPictures: Math.max(...artRows.map((r) => r.count)),
        minimumCoverage: Math.min(...artRows.map((r) => r.coverage)),
        maximumPaddingStep,
        paddingRestoredContinuously: maximumPaddingStep < p.bottomPad * 0.65,
        settled:
          !a.visible && !a.busy && !p.flightPose && p.motion.frame === null,
      };
      preview.reset();
      return result;
    }, kind);
    if (
      result.nativeFlashesBeforeAction ||
      result.emptyPictures ||
      result.maxSimultaneousPictures !== 1 ||
      result.minimumCoverage < 0.99 ||
      !result.paddingRestoredContinuously ||
      !result.settled ||
      (kind === "gentle"
        ? !result.phases.includes("outro")
        : !result.sawLanding)
    )
      throw Error(JSON.stringify(result));
    results.push(result);
    if (kind === "cold-drop") await page.unroute("**/throw-reactions.webm");
  }
  return { passed: true, scenarios: results };
}
