// Exercise the actual pointer handlers with a deterministic input clock.
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const out = path.resolve(__dirname, "../../dsh-pet/output/playwright/release");
fs.mkdirSync(out, { recursive: true });
app.setName("dsh-pet-isolated-release-test");
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
  })()`);
    const cases = [
      {
        name: "slow-drag",
        moves: [
          [0, 12],
          [40, 16],
          [80, 20],
        ],
        pause: 0,
        throws: false,
      },
      {
        name: "fast-right",
        moves: [
          [0, 12],
          [40, 72],
          [80, 132],
        ],
        pause: 0,
        throws: true,
        sign: 1,
      },
      {
        name: "fast-left",
        moves: [
          [0, -12],
          [40, -72],
          [80, -132],
        ],
        pause: 0,
        throws: true,
        sign: -1,
      },
      {
        name: "short-event-gap",
        moves: [
          [0, 12],
          [40, 72],
          [80, 132],
        ],
        pause: 20,
        throws: true,
        sign: 1,
      },
      {
        name: "pause-80",
        moves: [
          [0, 12],
          [40, 72],
          [80, 132],
        ],
        pause: 80,
        throws: false,
      },
      {
        name: "brake-before-release",
        moves: [
          [0, 12],
          [40, 72],
          [80, 132],
          [120, 138],
          [140, 140],
        ],
        pause: 0,
        throws: false,
      },
      {
        name: "intentional-slingshot",
        moves: [
          [0, 12],
          [100, 30],
          [200, 50],
        ],
        pause: 200,
        sling: true,
        throws: true,
        sign: -1,
      },
    ];
    const rows = [];
    for (const c of cases) {
      const result = await win.webContents.executeJavaScript(`(async () => {
      const c=${JSON.stringify(c)}, p=preview.pet;
      preview.reset(); p.sendBounds(340,180); await new Promise(r=>setTimeout(r,300));
      p.lastPressAt=-Infinity;
      const descriptor=Object.getOwnPropertyDescriptor(performance,'now');
      let time=performance.now(); const base=time;
      Object.defineProperty(performance,'now',{configurable:true,value:()=>time});
      const event=x=>({button:0,pointerId:1,screenX:500+x,screenY:350,clientX:200,clientY:130});
      try {
        if(c.sling){ p.onPointerDown(event(0)); p.onPointerUp(event(0)); time+=100; }
        const start=time;
        p.onPointerDown(event(0));
        for(const [dt,x] of c.moves){time=start+dt;p.onPointerMove(event(x));}
        time+=c.pause;
        if(c.sling)p.sendBounds(p.dragTarget.x,p.dragTarget.y);
        p.stopDragFollow();
        const sling=p.dragState.sling;
        const before={x:p.pos.x,y:p.pos.y};
        p.onPointerUp(event(c.moves.at(-1)[1]));
        const launched=p.flightPose, vx=launched?p.motion.state.vx:0;
        const after={x:p.pos.x,y:p.pos.y};
        // A subsequent lostpointercapture/pointerup must not launch a second time.
        p.onPointerUp(event(c.moves.at(-1)[1]));
        return {name:c.name,sling,launched,vx,positionUnchanged:before.x===after.x&&before.y===after.y,
          duplicatePreservedFlight:p.flightPose===launched};
      } finally {
        if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;
      }
    })()`);
      assert.equal(result.launched, c.throws, c.name);
      assert.equal(result.sling, !!c.sling, c.name);
      assert.ok(result.duplicatePreservedFlight, c.name);
      if (c.sign) assert.equal(Math.sign(result.vx), c.sign, c.name);
      if (!c.throws) assert.ok(result.positionUnchanged, c.name);
      rows.push(result);
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
