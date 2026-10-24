// Acceptance against the production helper, preload, renderer and host routes.
// All user data and the local capability stay in this test's output directory.
const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const [nodeExe, packageRoot, outputDir, scale = "1.25"] = process.argv.slice(2);
if (!outputDir)
  throw new Error(
    "Usage: electron check-desktop.cjs <node> <package-root> <output-dir> [scale]",
  );
const root = path.resolve(packageRoot),
  out = path.resolve(outputDir),
  home = path.join(out, "home");
fs.mkdirSync(path.join(home, "dsh-pet"), { recursive: true });
fs.mkdirSync(path.join(out, "cache"), { recursive: true });
fs.mkdirSync(path.join(out, "electron-profile"), { recursive: true });
fs.writeFileSync(
  path.join(home, "dsh-pet/main-config.jsonc"),
  JSON.stringify({
    trayEnabled: false,
    notificationsEnabled: false,
    pets: [
      {
        id: "main",
        name: "验收桌宠",
        size: 420,
        display: "desktop",
        balanceEnabled: false,
        whisperEnabled: false,
        workStatusEnabled: false,
        fixedEnabled: true,
        position: { corner: "bottom-left", marginX: 40, marginY: 0 },
      },
    ],
  }),
);
app.setPath("userData", path.join(out, "electron-profile"));
const host = spawn(
  nodeExe,
  [path.join(root, "lib/standalone.js"), "--port", "19069"],
  {
    env: {
      ...process.env,
      DSH_HOME: home,
      DSH_PET_IN_PROCESS: "1",
      ELECTRON_RUN_AS_NODE: "1",
    },
    windowsHide: true,
    stdio: [
      "ignore",
      fs.openSync(path.join(out, "host.log"), "w"),
      fs.openSync(path.join(out, "host-error.log"), "w"),
    ],
  },
);
process.on("exit", () => {
  if (host.exitCode === null) host.kill();
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let runtime;
const ready = (async () => {
  for (let i = 0; i < 150; i++) {
    try {
      const value = JSON.parse(
        fs.readFileSync(
          path.join(home, "dsh-pet/standalone-runtime.json"),
          "utf8",
        ),
      );
      if (value.pid === host.pid) {
        runtime = value;
        return value;
      }
    } catch {}
    if (host.exitCode !== null) throw new Error("Acceptance host exited");
    await wait(100);
  }
  throw new Error("Acceptance host startup timeout");
})();
ready.catch(() => {});
// Adapt the existing bridge protocol to the real isolated host's HTTP boundary.
const originalWrite = process.stdout.write.bind(process.stdout);
async function respond(req) {
  const rt = await ready;
  const endpoint = new URL(req.url, `http://127.0.0.1:${rt.port}`);
  assert.equal(endpoint.origin, `http://127.0.0.1:${rt.port}`);
  const res = await fetch(endpoint, {
    method: req.method,
    body: req.body || undefined,
    headers: {
      "x-dsh-pet-token": rt.token,
      "content-type": "application/json",
    },
  });
  const contentType =
    res.headers.get("content-type") || "application/octet-stream";
  const bytes = Buffer.from(await res.arrayBuffer());
  const answer = { id: req.id, status: res.status, contentType };
  if (/json|text|javascript/.test(contentType))
    answer.body = bytes.toString("utf8");
  else {
    const file = path.join(
      out,
      "cache",
      crypto.createHash("sha256").update(req.url).digest("hex"),
    );
    fs.writeFileSync(file, bytes);
    answer.file = file;
  }
  assert.equal(new URL(req.cb).hostname, "127.0.0.1");
  await fetch(req.cb, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(answer),
  });
}
process.stdout.write = function (chunk, ...args) {
  const text = String(chunk);
  if (text.startsWith("dsh-pet-bridge:")) {
    for (const line of text.trim().split("\n"))
      respond(JSON.parse(line.slice("dsh-pet-bridge:".length))).catch((error) =>
        originalWrite(`acceptance bridge error: ${error.message}\n`),
      );
    const callback = args.at(-1);
    if (typeof callback === "function") queueMicrotask(callback);
    return true;
  }
  return originalWrite(chunk, ...args);
};
process.env.DSH_PET_CONFIG_URL = "http://127.0.0.1:19069/dsh-pet-7340/config";
process.env.DSH_PET_BRIDGE = "1";
process.env.DSH_PET_FORCE_DSF = scale;
process.env.DSH_PET_SCALE = "1";
process.env.DSH_PET_PETS = JSON.stringify([
  { id: "main", size: 420, index: 0 },
]);
process.env.DSH_PET_APP_MODE = "0";
process.env.DSH_PET_HOST_PID = String(process.pid);
require(path.join(root, "runtime/electron-helper/main.js"));
let completed = false;
const deadline = setTimeout(() => {
  console.error("Acceptance timeout");
  app.exit(1);
}, 60000);
app
  .whenReady()
  .then(async () => {
    await ready;
    assert.equal(runtime.port, 19069, "Acceptance port must be free");
    let win;
    for (let i = 0; i < 200; i++) {
      win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      if (win && !win.webContents.isLoadingMainFrame()) {
        const ok = await win.webContents
          .executeJavaScript(
            `!!window.__dshPetDebug?.configOk && sprites[0]?.motion.videoArt.videos.every(v=>v.readyState>=2)`,
          )
          .catch(() => false);
        if (ok) break;
      }
      await wait(100);
    }
    assert.ok(win, "Production helper window exists");
    const boot = await win.webContents
      .executeJavaScript(`({configOk:__dshPetDebug.configOk,
    errors:__dshPetDebug.errors,sprites:sprites.length,bridge:BRIDGE,scale:CONFIG.scale,
    displays:AREAS.length,customAvailable:!sprites[0].motion.videoArt.disabled})`);
    assert.ok(boot.configOk && boot.customAvailable && boot.bridge);
    assert.equal(boot.sprites, 1);
    assert.deepEqual(boot.errors, []);
    const cases = await win.webContents.executeJavaScript(`(async()=>{
    const p=sprites[0], rows=[], wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(const c of [
      {name:'slow',moves:[[0,12],[40,16],[80,20]],pause:0,fly:false},
      {name:'right',moves:[[0,12],[40,72],[80,132]],pause:0,fly:true,sign:1},
      {name:'left',moves:[[0,-12],[40,-72],[80,-132]],pause:0,fly:true,sign:-1},
      {name:'pause',moves:[[0,12],[40,72],[80,132]],pause:80,fly:false},
      {name:'brake',moves:[[0,12],[40,72],[80,132],[120,138],[140,140]],pause:0,fly:false}]){
      p.stopThrow(true);p.stopMove();p.lastPressAt=-Infinity;
      p.sendBounds(PRIMARY_AREA.x+400,150);await wait(200);
      const base=performance.now();let clock=base;
      const desc=Object.getOwnPropertyDescriptor(performance,'now');
      Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
      const event=(type,x)=>new PointerEvent(type,{bubbles:true,button:0,pointerId:75,
        screenX:600+x,screenY:350,clientX:p.margin.l+p.size/2,clientY:p.margin.t+p.height/2});
      let row;
      try{
        p.hit.dispatchEvent(event('pointerdown',0));
        for(const [dt,x] of c.moves){clock=base+dt;p.hit.dispatchEvent(event('pointermove',x));}
        clock+=c.pause;p.stopDragFollow();
        window.dispatchEvent(event('pointerup',c.moves.at(-1)[1]));
        row={name:c.name,expectedFlight:c.fly,expectedSign:c.sign||0,flight:p.flightPose,vx:p.motion.state.vx,
          inputReleased:!p.dragState.active&&!p.dragState.dragging};
      }finally{if(desc)Object.defineProperty(performance,'now',desc);else delete performance.now;}
      await wait(200);row.mirror=p.motion.art.style.transform==='scaleX(-1)';rows.push(row);
    }
    p.stopThrow(true);await wait(300);return rows;
  })()`);
    fs.writeFileSync(
      path.join(out, "pointer-cases.json"),
      JSON.stringify(cases, null, 2),
    );
    for (const c of cases) {
      assert.equal(c.flight, c.expectedFlight, c.name);
      assert.ok(c.inputReleased, c.name);
      if (c.expectedSign) {
        assert.equal(Math.sign(c.vx), c.expectedSign, c.name);
        assert.equal(c.mirror, c.expectedSign < 0, c.name);
      }
    }
    await win.webContents
      .executeJavaScript(`(()=>{const p=sprites[0], b=p.throwSpaceOf().bounds[S.screenOfBox(p.throwSpaceOf(),p.pos.x,p.pos.y)];
    p.startThrow(p.pos.x,b.maxY-20,0,320);})()`);
    let frames = 0,
      minOpaque = Infinity,
      emptyFrames = 0;
    const phases = new Set();
    for (let i = 0; i < 70; i++) {
      await wait(70);
      const pixels = (await win.webContents.capturePage()).toBitmap();
      let opaque = 0;
      for (let n = 3; n < pixels.length; n += 4) if (pixels[n] > 32) opaque++;
      frames++;
      minOpaque = Math.min(minOpaque, opaque);
      if (opaque < 1000) emptyFrames++;
      phases.add(
        await win.webContents.executeJavaScript(
          "sprites[0].motion.videoArt.phase",
        ),
      );
    }
    assert.equal(
      emptyFrames,
      0,
      "Actual desktop window must retain a visible character",
    );
    const final = await win.webContents
      .executeJavaScript(`({errors:__dshPetDebug.errors,
    flight:sprites[0].flightPose,phase:sprites[0].motion.videoArt.phase})`);
    assert.deepEqual(final.errors, []);
    assert.equal(final.flight, false);
    fs.writeFileSync(
      path.join(out, "desktop.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    const result = {
      productionMain: true,
      productionPreload: true,
      productionRenderer: true,
      productionHostRoutes: true,
      bridgeAdapter:
        "Test adapter forwards protocol messages to the actual isolated host HTTP routes.",
      osMouseInput: false,
      boot,
      cases,
      landing: { frames, minOpaque, emptyFrames, phases: [...phases] },
      final,
    };
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    await fetch(`http://127.0.0.1:${runtime.port}/shutdown`, {
      method: "POST",
      headers: { "x-dsh-pet-token": runtime.token },
    });
    completed = true;
    clearTimeout(deadline);
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    clearTimeout(deadline);
    app.exit(1);
  });
app.on("will-quit", () => {
  if (!completed && host.exitCode === null) host.kill();
});
