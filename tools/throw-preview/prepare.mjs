import { readFileSync, writeFileSync } from "node:fs";
const runtime = new URL(
  "../../dsh-pet/runtime/electron-helper/",
  import.meta.url,
);
const css = readFileSync(new URL("index.html", runtime), "utf8").match(
  /<style>([\s\S]*?)<\/style>/,
)[1];
const scripts = [
  "shared-core.js",
  "constants.js",
  "throw-video.js",
  "throw-motion.js",
  "sprite.js",
  "events.js",
];
writeFileSync(
  new URL("index.html", import.meta.url),
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>桌宠动作改版预览</title><style>${css}
html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:Microsoft YaHei,sans-serif;background:#edf4fc;color:#294a73}
#root{position:absolute;inset:0;overflow:hidden}header{position:absolute;z-index:3;left:30px;top:24px;pointer-events:none}h1{font-size:23px;margin:0 0 10px}p{font-size:14px;margin:0 0 16px}nav{display:flex;gap:9px;pointer-events:auto}button{border:1px solid #bdcfe4;background:#fff;color:#31547b;border-radius:10px;padding:10px 15px;cursor:pointer}#status{margin-top:14px}footer{position:absolute;bottom:10px;left:28px;font-size:12px;pointer-events:none}.floor{position:absolute;bottom:2px;height:2px;background:#afc9e2;width:100%}
</style><body><div class="floor"></div><div id="root"></div><div id="pet-error"></div>
<header><h1>桌宠动作改版 · 基于 0.3.8</h1><p>甩出、分方向碰撞与贴地恢复；可直接拖动，连续两次按下可体验原版弹弓。</p>
<nav><button id="throw">抛起</button><button id="wall">撞屏幕边缘</button><button id="pets">两只桌宠碰撞</button><button id="reset">复位</button></nav><p id="status">准备就绪</p></header>
<footer>AI 生成动画二创 · 非官方 · 不连接 DSH、不调用模型 · 原作 github.com/PC2005-cloud/dsh-pet</footer>
${scripts.map((name) => `<script src="../../dsh-pet/runtime/electron-helper/${name}"></script>`).join("")}<script src="preview.js"></script></body></html>`,
  "utf8",
);
