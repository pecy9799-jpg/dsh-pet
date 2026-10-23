/** Local desktop motion overlay. Leaves window geometry, hit regions and physics unchanged. */
'use strict';

(() => {
  const assetBase = typeof document !== 'undefined' ? new URL('.', document.currentScript.src).href : '';
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));
  const IMPACT_MS = 480;

  // Pure pose calculation: testable without a browser, shared with the working preview.
  function poseAt(state, now) {
    const vx = clamp(state.vx, -8000, 8000);
    const vy = clamp(state.vy, -8000, 8000);
    const speed = Math.hypot(vx, vy);
    const moving = state.mode === 'flight' || state.mode === 'drag';
    const active = moving && !state.grounded;
    const elapsed = Math.max(0, now - state.started);
    const gain = state.mode === 'drag' ? 0.5 : 1;
    let angle = active ? clamp(vx / 100, -20, 20) * gain : moving && state.grounded ? clamp(vx / 450, -3, 3) : 0;
    if (active) angle += Math.sin(elapsed / 115) * Math.min(3, speed / 500) * gain;
    let sy = active ? 1 + Math.min(0.065, speed / 45000) * gain : 1;
    let sx = 1 / Math.sqrt(sy);
    let origin = '50% 54%';
    const hit = state.impact;
    const age = hit ? Math.max(0, now - hit.at) : IMPACT_MS;
    if (hit && age < IMPACT_MS) {
      const wave =
        age < 70 ? Math.sin(((age / 70) * Math.PI) / 2) : Math.exp(-(age - 70) / 105) * Math.cos((age - 70) / 62);
      const q = hit.strength * wave;
      if (hit.kind === 'ground' || hit.kind === 'ceiling') {
        sy *= 1 - q;
        sx *= 1 + q * 0.48;
        angle *= 1 - Math.max(0, wave) * 0.9;
        origin = hit.kind === 'ground' ? '50% 91.6667%' : '50% 13.8889%';
      } else {
        sx *= 1 - q;
        sy *= 1 + q * 0.38;
        angle -= hit.direction * q * 26;
        origin = hit.direction > 0 ? '68.75% 54%' : '31.25% 54%';
      }
    }
    return { angle: clamp(angle, -27, 27), sx, sy, origin, active: moving || age < IMPACT_MS };
  }

  class PetThrowMotion {
    constructor(layer) {
      this.layer = layer;
      this.media = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.state = { mode: 'idle', vx: 0, vy: 0, started: 0, impact: null };
      this.frame = null;
      this.blocked = false;
      this.step = this.step.bind(this);
    }

    set(mode, vx = 0, vy = 0, grounded = false) {
      if (this.blocked) return;
      if (mode !== this.state.mode) this.state.started = performance.now();
      Object.assign(this.state, { mode, vx, vy, grounded });
      this.wake();
    }

    impact(kind, speed, direction = 1) {
      if (this.blocked || this.media.matches || Math.abs(speed) < 70) return;
      const now = performance.now();
      const previous = this.state.impact;
      if (previous && previous.kind === kind && now - previous.at < 100) return;
      this.state.impact = {
        kind,
        at: now,
        direction: direction < 0 ? -1 : 1,
        strength: 0.1 + clamp(Math.abs(speed) / 2600, 0, 1) * 0.24,
      };
      this.layer.dataset.impact = kind;
      this.videoArt?.impact(kind, direction);
      this.wake();
    }

    wake() {
      if (this.media.matches) {
        this.reset();
        return;
      }
      if (this.frame === null) this.frame = requestAnimationFrame(this.step);
    }

    step(now) {
      this.frame = null;
      if (this.media.matches) return this.reset();
      const pose = poseAt(this.state, now);
      const videoActive = this.videoArt?.tick(this.state.mode, this.state.grounded) || false;
      if (this.art) {
        const mirror = this.videoArt ? this.videoArt.mirror(this.mirror) : this.mirror;
        this.art.style.transform = mirror ? 'scaleX(-1)' : '';
        if (!this.videoArt) {
          const frame = Math.floor(Math.max(0, now - this.state.started) / 100) % 8;
          this.art.style.backgroundPosition = ((frame % 4) * 100) / 3 + '% ' + (frame < 4 ? 0 : 100) + '%';
        }
        this.setArtVisible(this.videoArt ? videoActive : pose.active);
      }
      this.layer.style.transformOrigin = pose.active ? pose.origin : '';
      this.layer.style.transform = pose.active
        ? 'rotate(' + pose.angle.toFixed(2) + 'deg) scale(' + pose.sx.toFixed(4) + ',' + pose.sy.toFixed(4) + ')'
        : '';
      this.layer.dataset.motion = this.state.mode;
      if (pose.active || videoActive || this.videoArt?.busy) this.frame = requestAnimationFrame(this.step);
      else this.reset();
    }

    reset() {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      this.videoArt?.stop();
      this.state.mode = 'idle';
      this.state.grounded = false;
      this.state.impact = null;
      this.layer.style.transform = '';
      this.layer.style.transformOrigin = '';
      if (this.art) this.setArtVisible(false);
      else this.layer.classList?.remove('has-flight-art');
      delete this.layer.dataset.motion;
      delete this.layer.dataset.impact;
    }

    setArtVisible(visible) {
      if (this.layer.classList.contains('has-flight-art') === visible) return;
      // Disable opacity interpolation only for this handoff; native idle transitions stay intact.
      this.layer.classList.add('flight-handoff');
      this.layer.classList.toggle('has-flight-art', visible);
      void this.layer.offsetWidth;
      this.layer.classList.remove('flight-handoff');
    }
  }

  PetThrowMotion.poseAt = poseAt;
  PetThrowMotion.assetBase = assetBase;
  globalThis.PetThrowMotion = PetThrowMotion;
})();
