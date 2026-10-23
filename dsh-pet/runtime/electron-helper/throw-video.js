/** Original-reference Doubao video; movement and collision physics stay in sprite.js. */
'use strict';
(() => {
  class PetThrowVideo {
    constructor(layer, base) {
      this.root = document.createElement('div');
      this.root.className = 'pet-flight-video';
      this.videos = [0, 1].map(() => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = new URL('throw-flight.webm', base).href;
        video.addEventListener('error', () => this.fail(video));
        this.root.appendChild(video);
        return video;
      });
      layer.appendChild(this.root);
      this.flight = new URL('throw-flight.webm', base).href;
      this.reactions = new URL('throw-reactions.webm', base).href;
      // Measured from the actual generated frames, not the requested timeline.
      this.cues = {
        launch: [0.55, 2.15],
        wall: [2.75, 4.2],
        pet: [2.75, 4.2],
        ceiling: [4.95, 6.75],
        ground: [7.05, 9.15],
      };
      this.front = 0;
      this.phase = 'idle';
      this.wanted = false;
      this.visible = false;
      this.disabled = false;
      this.busy = false;
      this.token = 0;
      this.lastImpact = -Infinity;
      this.mode = 'idle';
      this.pendingImpact = null;
      this.action = null;
    }

    show(time, phase, source = this.flight) {
      if (this.disabled) return;
      const token = ++this.token;
      const previous = this.videos[this.front];
      const index = 1 - this.front;
      const next = this.videos[index];
      this.busy = true;
      next.pause();
      next.style.transition = 'none';
      next.classList.remove('is-front');
      next.style.zIndex = '1';
      previous.style.zIndex = '0';
      // Commit the hidden back buffer before seeking; never expose its previous frame.
      void next.offsetWidth;
      next.onplaying = () => {
        next.onplaying = null;
        if (next.seeking) next.addEventListener('seeked', commit, { once: true });
        else commit();
      };
      const commit = () => {
        if (token !== this.token) return;
        // The decoded frame replaces the previous one in the same paint, without ghosting.
        this.front = index;
        this.phase = phase;
        this.visible = true;
        this.busy = false;
        next.classList.add('is-front');
        previous.classList.remove('is-front');
        previous.pause();
      };
      const start = () => {
        if (token !== this.token) return;
        next.currentTime = time;
        next.playbackRate = phase === 'loop' ? 1 : 2.5;
        Promise.resolve(next.play()).catch(() => {
          if (token === this.token) this.fail(next);
        });
      };
      if (next.src !== source) {
        next.src = source;
        next.load?.();
      }
      // Assigning currentTime before new metadata arrives can silently reset it to zero.
      if (next.readyState >= 1) start();
      else next.addEventListener('loadedmetadata', start, { once: true });
    }

    actionClip(kind, direction) {
      if (!this.reactions) return false;
      const cue = this.cues[kind];
      if (!cue) return false;
      this.action = kind;
      this.actionEnd = cue[1];
      this.impactMirror = kind === 'wall' || kind === 'pet' ? direction > 0 : null;
      this.show(cue[0], kind === 'launch' ? 'launch' : 'impact', this.reactions);
      return true;
    }

    tick(mode, grounded = false) {
      if (this.disabled || !this.videos.some((video) => video.readyState >= 2)) return false;
      const modeChanged = mode !== this.mode;
      this.mode = mode;
      const active = (mode === 'drag' || mode === 'flight') && !grounded;
      if (active !== this.wanted) {
        this.wanted = active;
        if (active) {
          if (this.phase === 'impact' && !modeChanged) {
            // A physical bounce can lift the feet again; it is not a new release.
          } else if (mode === 'flight' && !modeChanged) this.show(59 / 24, 'loop');
          else if (mode !== 'flight' || !this.actionClip('launch')) this.show(0, 'intro');
        } else if (this.phase !== 'impact') {
          if (grounded) this.hide();
          else this.show(7.1, 'outro');
        }
      } else if (active && modeChanged) {
        if (mode === 'flight') this.actionClip('launch');
        else this.show(0, 'intro');
      }
      if (this.pendingImpact) {
        const hit = this.pendingImpact;
        this.pendingImpact = null;
        this.actionClip(hit.kind, hit.direction);
      }
      if (this.busy) return this.visible;
      const video = this.videos[this.front];
      const time = video.currentTime;
      if (active && this.phase === 'intro' && time >= 59 / 24) {
        this.phase = 'loop';
        video.playbackRate = 1;
      }
      if (active && this.phase === 'loop' && time >= 146 / 24) {
        this.show(59 / 24, 'loop');
      } else if ((this.phase === 'impact' || this.phase === 'launch') && time >= this.actionEnd) {
        this.action = null;
        if (active) this.show(59 / 24, 'loop');
        else this.hide();
      } else if (!active && this.phase === 'outro' && time >= 9.9) {
        this.stop();
      }
      return this.visible;
    }

    impact(kind, direction) {
      const now = performance.now();
      if (this.disabled || !this.reactions || !this.cues[kind] || now - this.lastImpact < 180) return;
      this.lastImpact = now;
      // Consume on the next frame, after the current airborne/grounded state is known.
      this.pendingImpact = { kind, direction };
    }

    mirror(facing) {
      return this.phase === 'impact' && this.impactMirror !== null ? this.impactMirror : facing;
    }

    hide() {
      ++this.token;
      this.phase = 'idle';
      this.busy = this.visible = false;
      this.action = null;
      for (const video of this.videos) {
        video.onplaying = null;
        video.pause();
        // Retain the last decoded picture until the native/custom handoff is painted.
      }
    }

    stop() {
      this.hide();
      this.wanted = false;
      this.mode = 'idle';
      this.pendingImpact = null;
    }

    disable() {
      this.disabled = true;
      this.stop();
      this.onUnavailable?.();
    }

    fail(video) {
      if (this.reactions && video.src === this.reactions) {
        this.reactions = null;
        this.pendingImpact = null;
        this.action = null;
        if (this.wanted) this.show(59 / 24, 'loop');
        else this.hide();
      } else {
        this.disable();
      }
    }
  }
  globalThis.PetThrowVideo = PetThrowVideo;
})();
