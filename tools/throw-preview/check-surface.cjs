// Run with the desktop helper's Electron binary after prepare.mjs, not plain Node.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const out = path.resolve(__dirname, "../../dsh-pet/output/playwright/surface");
fs.mkdirSync(out, { recursive: true });
app.setName("dsh-pet-isolated-surface-test");
app.setPath("userData", path.join(out, "electron-profile"));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1100,
      height: 620,
      show: false,
      transparent: true,
      frame: false,
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    win.webContents.setFrameRate(60);
    const rows = [];
    let recording = false,
      kind = "loading";
    win.webContents.on("paint", (_, dirty, image) => {
      if (!recording) return;
      const pixels = image.toBitmap();
      let opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 32) opaque++;
      rows.push({ kind, opaque });
      if (opaque < 1000)
        fs.writeFileSync(
          path.join(out, `empty-${rows.length}.png`),
          image.toPNG(),
        );
    });
    await win.loadFile(path.join(__dirname, "index.html"));
    await win.webContents.executeJavaScript(`(async () => {
    while (!window.preview?.pet.motion.videoArt.videos.every(v => v.readyState >= 2))
      await new Promise(r => setTimeout(r, 20));
    document.body.style.background = document.documentElement.style.background = 'transparent';
    for (const selector of ['header', 'footer', '.floor']) document.querySelector(selector).style.display = 'none';
  })()`);
    for (kind of ["gentle", "throw", "interrupted"]) {
      await win.webContents.executeJavaScript(`(async () => {
      preview.reset(); preview.pet.sendBounds(340,300); await new Promise(r=>setTimeout(r,300));
    })()`);
      recording = true;
      await win.webContents.executeJavaScript(`(async () => {
      const p=preview.pet; p.lastPressAt=-Infinity;
      p.onPointerDown({button:0,pointerId:1,screenX:500,screenY:350,clientX:200,clientY:130});
      p.onPointerMove({screenX:530,screenY:320});
      await new Promise(r=>setTimeout(r,1200)); p.stopDragFollow();
      const t=performance.now();
      p.dragTrail=${kind === "throw" ? "[{t:t-50,x:400,y:300},{t:t,x:400,y:335}]" : "[]"};
      p.onPointerUp();
    })()`);
      if (kind === "interrupted")
        await win.webContents.executeJavaScript(`(async () => {
      await new Promise(r=>setTimeout(r,50)); const p=preview.pet; p.lastPressAt=-Infinity;
      p.onPointerDown({button:0,pointerId:2,screenX:500,screenY:350,clientX:200,clientY:130});
      p.onPointerMove({screenX:530,screenY:320});
      await new Promise(r=>setTimeout(r,200)); p.stopDragFollow(); p.dragTrail=[]; p.onPointerUp();
    })()`);
      await new Promise((r) => setTimeout(r, kind === "throw" ? 5500 : 2000));
      recording = false;
    }
    const result = {
      frames: rows.length,
      minimumOpaque: Math.min(...rows.map((r) => r.opaque)),
      emptyFrames: rows.filter((r) => r.opaque < 1000),
    };
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    win.destroy();
    app.exit(result.frames > 100 && result.emptyFrames.length === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
