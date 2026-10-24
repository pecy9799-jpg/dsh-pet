/** Original-reference Doubao video; movement and collision physics stay in sprite.js. */
'use strict';
(() => {
  class PetThrowVideo {
    constructor(layer, base) {
      this.layer = layer;
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
      this.canvas = document.createElement('canvas');
      this.canvas.width = 640;
      this.canvas.height = 360;
      this.context = this.canvas.getContext?.('2d');
      if (this.context) {
        this.root.classList.add('has-frame-surface');
        this.root.appendChild(this.canvas);
      }
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
      this.cancelFrame();
      const token = ++this.token;
      const previous = this.videos[this.front];
      const index = 1 - this.front;
      const next = this.videos[index];
      this.busy = true;
      if (this.visible) previous.pause();
      next.pause();
      next.style.transition = 'none';
      next.classList.remove('is-front');
      next.style.zIndex = '1';
      previous.style.zIndex = '0';
      // Commit the hidden back buffer before seeking; never expose its previous frame.
      void next.offsetWidth;
      next.onplaying = () => {
        next.onplaying = null;
        if (next.seeking) next.addEventListener('seeked', present, { once: true });
        else present();
      };
      const present = () => {
        if (token !== this.token) return;
        if (!next.requestVideoFrameCallback) return commit();
        this.frameVideo = next;
        this.frameRequest = next.requestVideoFrameCallback((_, frame) => {
          this.frameRequest = null;
          if (token !== this.token) return;
          // 'playing' is not proof that the sought picture reached the compositor.
          if (next.seeking || frame.mediaTime < time - 1 / 24) return present();
          commit();
        });
      };
      const commit = () => {
        if (token !== this.token) return;
        if (!this.paint(next)) return present();
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
      if (this.phase === 'native') {
        const native = this.nativeVideo?.();
        if (native && this.paint(native)) this.nativeFrames++;
        if (this.nativeFrames >= 3 || performance.now() > this.nativeDeadline) this.hide();
        return this.visible;
      }
      if (this.visible) this.paint(this.videos[this.front]);
      const modeChanged = mode !== this.mode;
      this.mode = mode;
      const active = (mode === 'drag' || mode === 'flight') && !grounded;
      const hit = this.pendingImpact;
      this.pendingImpact = null;
      // A landing replaces the airborne picture only after its own frame is ready.
      const impactPlaying = this.phase === 'impact' || (this.busy && this.action && this.action !== 'launch');
      if (hit) {
        this.wanted = active;
        this.actionClip(hit.kind, hit.direction);
      } else if (active !== this.wanted) {
        this.wanted = active;
        if (active) {
          if (impactPlaying && !modeChanged) {
            // A physical bounce can lift the feet again; it is not a new release.
          } else if (mode === 'flight' && !modeChanged) this.show(59 / 24, 'loop');
          else if (mode !== 'flight' || !this.actionClip('launch')) this.show(0, 'intro');
        } else if (!impactPlaying) {
          if (grounded) this.hide();
          else this.show(7.1, 'outro');
        }
      } else if (active && modeChanged) {
        if (mode === 'flight') this.actionClip('launch');
        else this.show(0, 'intro');
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
        else this.hide(true);
      } else if (!active && this.phase === 'outro' && time >= 9.9) {
        this.hide(true);
      }
      return this.visible;
    }

    paint(video) {
      if (!this.context) return true;
      if (video.readyState < 2 || video.seeking) return false;
      try {
        // One persistent texture survives video seeks and decoder-buffer swaps.
        this.context.globalCompositeOperation = 'copy';
        this.context.drawImage(video, 0, 0, 640, 360);
        return true;
      } catch {
        return false;
      }
    }

    impact(kind, direction) {
      const now = performance.now();
      if (this.disabled || !this.reactions || !this.cues[kind] || now - this.lastImpact < 180) return;
      // Small physical bounces must not rewind a landing that is still playing/loading.
      if (kind === 'ground' && (this.action === 'ground' || this.pendingImpact?.kind === 'ground')) return;
      this.lastImpact = now;
      // Consume on the next frame, after the current airborne/grounded state is known.
      this.pendingImpact = { kind, direction };
    }

    mirror(facing, flightMirror = null) {
      if (this.phase === 'native') return facing;
      if (this.phase === 'impact' && this.impactMirror !== null) return this.impactMirror;
      return flightMirror ?? facing;
    }

    hide(recoverNative = false) {
      ++this.token;
      this.cancelFrame();
      this.phase = 'idle';
      this.busy = this.visible = false;
      this.action = null;
      for (const video of this.videos) {
        video.onplaying = null;
        video.pause();
        // Retain the last decoded picture until the native/custom handoff is painted.
      }
      this.layer.classList?.remove('flight-native-handoff');
      if (recoverNative && this.context && this.nativeVideo) {
        this.visible = true;
        this.phase = 'native';
        this.nativeFrames = 0;
        this.nativeDeadline = performance.now() + 1000;
        const native = this.nativeVideo();
        if (native) this.paint(native);
        // Keep the same picture covering the native surface while it is promoted.
        this.layer.classList?.add('flight-native-handoff');
      }
    }

    stop() {
      this.hide();
      this.wanted = false;
      this.mode = 'idle';
      this.pendingImpact = null;
    }

    cancelFrame() {
      if (this.frameRequest != null) this.frameVideo?.cancelVideoFrameCallback?.(this.frameRequest);
      this.frameVideo = null;
      this.frameRequest = null;
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
