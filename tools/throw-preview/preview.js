"use strict";
VIEW.w = 1100;
VIEW.h = 620;
AREAS = [{ x: 0, y: 0, width: VIEW.w, height: VIEW.h }];
PANELS = AREAS;
WORK_AREAS = AREAS;
PRIMARY_AREA = AREAS[0];
CONFIG.scale = 1;
const previewPhysics = { ...S.DEFAULT_PHYSICS, petCollision: true };
config = { physics: previewPhysics };
const animations = {
  idle: ["待机呼吸休闲"],
  drag: ["被鼠标拖拽悬空反馈"],
  clicks: ["点击回应-开心跃动"],
  turn: [],
  categories: [],
  moves: { actions: [] },
  events: {},
};
const originalBounds = PetSprite.prototype.sendBounds;
const playbackReports = [];
PetSprite.prototype.reportPose = function () {};
PetSprite.prototype.reportPlayback = function (id, status, reason) {
  playbackReports.push({ id, status, reason });
};
PetSprite.prototype.sendBounds = function (x, y) {
  originalBounds.call(this, x, y);
  // This element replaces the helper's fixed inner margin: screen sprite position is x/y.
  this.el.style.left = x + "px";
  this.el.style.top = y + "px";
};
const motions = [];
function makePet(id, x) {
  const p = new PetSprite({
    id,
    assetRoot: "main",
    name: "大肥鱼",
    size: 420,
    position: { corner: "bottom-right", marginX: 20, marginY: 0 },
    physics: previewPhysics,
    animations,
    animationWeights: { idle: 100, turn: 0, move: 0 },
    fixedEnabled: true,
  });
  p.assetBase = "../../dsh-pet/assets/webm/";
  p.customPos = { rx: (x + p.halfW) / VIEW.w, ry: (VIEW.h - p.halfH) / VIEW.h };
  p.position();
  p.playOnce(animations.idle[0]);
  motions.push(p);
  return p;
}
const pet = makePet("preview-main", 300);
let other = null;
window.petBridge = {
  setBounds() {},
  setInputBusy() {},
  setInteractive() {},
  setInputRegions() {},
  reportFlight() {},
  reportCollide(id, vx, vy) {
    const target = motions.find((p) => p.pet.id === id);
    if (target) target.onDeskHit(vx, vy);
  },
};
function resetPreview() {
  for (const p of motions) {
    p.stopThrow();
    p.stopMove();
    p.motion.blocked = false;
    p.motion.reset();
    p.lastPressAt = 0;
    p.others = {};
    p.playOnce(animations.idle[0]);
  }
  if (other) {
    other.dispose();
    motions.splice(motions.indexOf(other), 1);
    other = null;
  }
  pet.sendBounds(340, VIEW.h - pet.height);
  document.querySelector("#status").textContent = "准备就绪";
}
document.querySelector("#throw").onclick = () => {
  resetPreview();
  pet.startThrow(180, 360, 1050, -1030);
  document.querySelector("#status").textContent =
    "悬空挣扎 → 随速度倾斜 → 落地回弹";
};
document.querySelector("#wall").onclick = () => {
  resetPreview();
  pet.startThrow(690, 280, 1750, -180);
  document.querySelector("#status").textContent = "撞边挤压 → 反弹 → 落地恢复";
};
document.querySelector("#pets").onclick = () => {
  resetPreview();
  other = makePet("preview-other", 750);
  other.sendBounds(740, 360);
  pet.others = {};
  other.others = {};
  pet.startThrow(240, 360, 1600, -120);
  document.querySelector("#status").textContent =
    "双方挤压、弹开（使用原插件的碰撞计算）";
};
document.querySelector("#reset").onclick = resetPreview;
// Preview-only counterpart to the desktop cross-window broker, with the same shared physics.
setInterval(() => {
  for (const p of motions) {
    p.others = {};
    for (const q of motions) {
      if (p !== q)
        p.others[q.pet.id] = {
          x: q.pos.x,
          y: q.pos.y,
          size: q.size,
          bottomPad: q.bottomPad,
          vx: q.throwState?.vx || 0,
          vy: q.throwState?.vy || 0,
        };
    }
  }
}, 30);
window.preview = {
  pet,
  motions,
  playbackReports,
  reset: resetPreview,
  get other() {
    return other;
  },
};
