// Capture the isolated preview; encoder and output paths are explicit CLI arguments.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const [encoder, output] = process.argv.slice(2);
if (!encoder || !output)
  throw new Error("Usage: electron record-electron.cjs <ffmpeg> <output.mp4>");
fs.mkdirSync(path.dirname(output), { recursive: true });
app.setName("dsh-pet-isolated-demo");
app.setPath("userData", path.join(path.dirname(output), ".electron-demo"));
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
    win.webContents.setFrameRate(25);
    let latest = null;
    win.webContents.on("paint", (_, dirty, image) => {
      latest = image.toPNG();
    });
    await win.loadFile(path.join(__dirname, "index.html"));
    await win.webContents.executeJavaScript(`(async()=>{
    while(!window.preview?.pet.motion.videoArt.videos.every(v=>v.readyState>=2))
      await new Promise(r=>setTimeout(r,20));
  })()`);
    latest = (await win.webContents.capturePage()).toPNG();
    const child = spawn(
      encoder,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-framerate",
        "25",
        "-vcodec",
        "png",
        "-i",
        "pipe:0",
        "-vf",
        "scale=1100:620",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        output,
      ],
      { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
    );
    let errorText = "",
      streamError = null,
      frames = 0;
    child.stderr.on("data", (chunk) => {
      errorText += chunk.toString();
    });
    child.stdin.on("error", (error) => {
      streamError = error;
    });
    let encoderError = null;
    const finished = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(errorText || `Encoder exit ${code}`)),
      );
    }).catch((error) => {
      encoderError = error;
    });
    const timer = setInterval(() => {
      if (latest && !streamError) {
        child.stdin.write(latest);
        frames++;
      }
    }, 40);
    try {
      const script = fs.readFileSync(
        path.join(__dirname, "record-demo.js"),
        "utf8",
      );
      await win.webContents.executeJavaScript(`(${script})({
      reload:async()=>{},setViewportSize:async()=>{},
      waitForFunction:async fn=>{while(!fn())await new Promise(r=>setTimeout(r,20));},
      evaluate:async fn=>fn()
    })`);
    } finally {
      clearInterval(timer);
      child.stdin.end();
    }
    await finished;
    if (encoderError) throw encoderError;
    if (streamError) throw streamError;
    console.log(JSON.stringify({ frames, fps: 25, output }));
    win.destroy();
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
