// Verify real drag trails pass through release-velocity estimation to the artwork.
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const out = path.resolve(
  __dirname,
  "../../dsh-pet/output/playwright/direction",
);
fs.mkdirSync(out, { recursive: true });
app.setName("dsh-pet-isolated-direction-test");
app.setPath("userData", path.join(out, "electron-profile"));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1100,
      height: 620,
      show: false,
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    await win.loadFile(path.join(__dirname, "index.html"));
    await win.webContents.executeJavaScript(`(async () => {
    while (!window.preview?.pet.motion.videoArt.videos.every(v=>v.readyState>=2))
      await new Promise(r=>setTimeout(r,20));
    for(const s of ['header','footer','.floor']) document.querySelector(s).style.display='none';
  })()`);
    const rows = [];
    for (const sign of [-1, 1]) {
      const result = await win.webContents.executeJavaScript(`(async () => {
      const p=preview.pet, a=p.motion.videoArt, wait=ms=>new Promise(r=>setTimeout(r,ms));
      p.facing=${JSON.stringify(sign < 0 ? "left" : "right")}; preview.reset();
      p.sendBounds(340,180); await wait(300); p.lastPressAt=-Infinity;
      p.onPointerDown({button:0,pointerId:1,screenX:500,screenY:350,clientX:200,clientY:130});
      p.onPointerMove({screenX:500+${sign}*12,screenY:338});
      const heldUntil=performance.now()+2000;
      while((!a.visible||a.busy)&&performance.now()<heldUntil) await wait(20);
      await wait(100);
      p.onPointerMove({screenX:500+${sign}*32,screenY:318}); await wait(50);
      p.onPointerMove({screenX:500+${sign}*56,screenY:294});
      p.stopDragFollow(); p.sendBounds(340,180); p.onPointerUp();
      const releaseVX=p.motion.state.vx, releaseVY=p.motion.state.vy, startedFlight=p.flightPose;
      const deadline=performance.now()+2500;
      while((a.phase!=='launch'||a.busy)&&performance.now()<deadline) await wait(10);
      await wait(80);
      return {sign:${sign},releaseVX,releaseVY,startedFlight,phase:a.phase,
        mirrored:p.motion.art.style.transform==='scaleX(-1)',flightMirror:p.motion.flightMirror,
        originalFacing:p.facing,layerTransform:p.motion.layer.style.transform};
    })()`);
      console.log(JSON.stringify(result));
      assert.equal(Math.sign(result.releaseVX), sign);
      assert.equal(result.phase, "launch");
      assert.equal(result.mirrored, sign < 0);
      assert.equal(result.flightMirror, sign < 0);
      fs.writeFileSync(
        path.join(out, `throw-${sign}.png`),
        (await win.webContents.capturePage()).toPNG(),
      );
      const recovery = await win.webContents.executeJavaScript(`(async () => {
      const p=preview.pet,a=p.motion.videoArt,deadline=performance.now()+5000;
      p.stopThrow(true);
      while((a.phase!=='idle'||a.visible)&&performance.now()<deadline)
        await new Promise(r=>setTimeout(r,20));
      return {phase:a.phase,visible:a.visible,facing:p.facing};
    })()`);
      assert.equal(recovery.visible, false);
      assert.equal(recovery.phase, "idle");
      assert.equal(recovery.facing, result.originalFacing);
      rows.push({ ...result, recovery });
    }
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(rows, null, 2),
    );
    console.log(JSON.stringify(rows));
    win.destroy();
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
