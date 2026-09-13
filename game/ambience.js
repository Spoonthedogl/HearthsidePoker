/* Hearthside room ambience. Geometry is measured in the original room-v2 PNG.
 * No art pixels, game state, cards, timers or random generators are modified.
 * Usage: var roomAmbience = new HearthAmbience(document.getElementById('stage'));
 */
(function (global) {
  'use strict';

  var SOURCE_WIDTH = 1536;
  var SOURCE_HEIGHT = 1024;
  var FRAME_MS = 1000 / 30;
  var instances = new WeakMap();

  // Conservative glass-only interiors. Gaps leave the wooden mullions untouched.
  // The lower strips end above the plants, lantern, books and sleeping cat.
  var GLASS = [
    { x: 253, y: 9, w: 45, h: 136 },
    { x: 317, y: 9, w: 90, h: 136 },
    { x: 428, y: 9, w: 146, h: 136 },
    { x: 253, y: 168, w: 44, h: 22 },
    { x: 317, y: 168, w: 90, h: 29 },
    { x: 428, y: 168, w: 143, h: 25 }
  ];

  var LIGHTS = [
    { id: 'back-lantern-left', x: 777, y: 101, radius: 44, strength: .067, flameY: 113, flameH: 20, phase: .8 },
    { id: 'back-lantern-right', x: 1078, y: 101, radius: 44, strength: .064, flameY: 113, flameH: 20, phase: 3.4 },
    { id: 'window-lantern', x: 295, y: 226, radius: 38, strength: .064, flameY: 238, flameH: 20, phase: 5.1 },
    { id: 'fireplace', x: 38, y: 423, radius: 105, strength: .082, phase: 1.2, fire: true },
    { id: 'right-candle', x: 1390, y: 582, radius: 42, strength: .073, flameY: 591, flameH: 18, phase: 4.2 },
    { id: 'foreground-candle', x: 94, y: 832, radius: 43, strength: .057, flameY: 839, flameH: 16, phase: 2.3 },
    { id: 'mantel-candle-tall', x: 141, y: 102, radius: 32, strength: .047, flameY: 108, flameH: 13, phase: 2.9 },
    { id: 'mantel-candle-small', x: 173, y: 131, radius: 27, strength: .041, flameY: 138, flameH: 13, phase: 6.1 },
    { id: 'bookshelf-candle', x: 1338, y: 102, radius: 28, strength: .044, flameY: 109, flameH: 13, phase: 1.7 }
  ];
  var FIRE_BASES = [{ x: 15, y: 446, h: 30 }, { x: 35, y: 434, h: 45 }, { x: 54, y: 437, h: 33 }, { x: 73, y: 432, h: 25 }];

  function pixel(value) { return Math.round(value / 2) * 2; }
  function seededRandom(seed) {
    var state = seed >>> 0;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
  function copyRect(rect) { return { x: rect.x, y: rect.y, w: rect.w, h: rect.h }; }

  function HearthAmbience(stage) {
    if (!(this instanceof HearthAmbience)) return new HearthAmbience(stage);
    if (!stage || typeof stage.insertBefore !== 'function') throw new Error('HearthAmbience needs the game stage element.');
    if (instances.has(stage)) return instances.get(stage);
    instances.set(stage, this);

    this.stage = stage;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hearth-ambience-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.setAttribute('role', 'presentation');
    var room = stage.querySelector('.room');
    stage.insertBefore(this.canvas, room ? room.nextSibling : stage.firstChild);
    this.context = this.canvas.getContext('2d', { alpha: true });
    this._disposed = false;
    this._paused = false;
    this._gentle = stage.classList.contains('gentle');
    this._raf = null;
    this._lastPaint = null;
    this._time = 0;
    this._frames = 0;
    this._width = 0;
    this._height = 0;
    this._drops = [];
    this._glowStamps = {};
    this._cachePixels = 0;
    this._gradientBuilds = 0;
    this._dirtyRects = [];
    this._clearPixels = 0;
    this._rainPainted = 0;
    this._paintCpuMs = 0;
    this._lastPaintCpuMs = 0;
    this._lastDrawCalls = 0;

    var random = seededRandom(0x48ea71);
    for (var i = 0; i < 106; i++) {
      var drop = {
        x: 246 + random() * 335,
        offset: random() * 264,
        speed: 61 + random() * 89,
        length: 4 + Math.floor(random() * 5) * 2,
        width: i % 6 === 0 ? 2 : 1,
        alpha: .075 + random() * .115,
        phase: random() * Math.PI * 2
      };
      drop.bodyColor = 'rgba(159,198,220,' + drop.alpha + ')';
      drop.tipColor = 'rgba(202,224,230,' + drop.alpha * .55 + ')';
      this._drops.push(drop);
    }

    this._buildGlowStamps();

    this._boundFrame = this._frame.bind(this);
    this._boundSync = this._sync.bind(this);
    this._boundResize = this._resize.bind(this);
    document.addEventListener('visibilitychange', this._boundSync);
    global.addEventListener('resize', this._boundResize);
    this._observer = new MutationObserver(this._boundSync);
    this._observer.observe(stage, { attributes: true, attributeFilter: ['class'] });
    this._resize();
    this._sync();
  }

  HearthAmbience.prototype._resize = function () {
    if (this._disposed) return;
    var width = this.stage.clientWidth || 1440;
    var height = this.stage.clientHeight || 900;
    if (width === this._width && height === this._height) return;
    this._width = width;
    this._height = height;
    // Half-resolution backing buffer gives the movement crisp, two-pixel edges.
    this.canvas.width = Math.ceil(width / 2);
    this.canvas.height = Math.ceil(height / 2);
    this._scale = Math.max(width / SOURCE_WIDTH, height / SOURCE_HEIGHT);
    this._offsetX = (width - SOURCE_WIDTH * this._scale) / 2;
    this._offsetY = (height - SOURCE_HEIGHT * this._scale) / 2;
    this._buildDirtyRects();
    this._draw(this._gentle ? 0 : this._time, this._gentle);
  };

  HearthAmbience.prototype._buildGlowStamps = function () {
    if (!this.context) return;
    // Source-resolution stamps are tiny, shared by equal radii, and reused at
    // every stage size. Alpha modulation preserves the original slow flicker.
    for (var i = 0; i < LIGHTS.length; i++) {
      var radius = LIGHTS[i].radius;
      if (this._glowStamps[radius]) continue;
      var stamp = document.createElement('canvas');
      stamp.width = stamp.height = radius * 2;
      var ctx = stamp.getContext('2d', { alpha: true });
      var glow = ctx.createRadialGradient(radius, radius, 1, radius, radius, radius);
      glow.addColorStop(0, 'rgba(255,190,87,1)');
      glow.addColorStop(.35, 'rgba(255,158,53,.53)');
      glow.addColorStop(1, 'rgba(237,119,35,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, stamp.width, stamp.height);
      this._glowStamps[radius] = stamp;
      this._cachePixels += stamp.width * stamp.height;
      this._gradientBuilds++;
    }
  };

  HearthAmbience.prototype._buildDirtyRects = function () {
    var sx = this.canvas.width / this._width, sy = this.canvas.height / this._height;
    var sourceRects = GLASS.map(copyRect);
    for (var i = 0; i < LIGHTS.length; i++) {
      var light = LIGHTS[i];
      sourceRects.push({ x: light.x - light.radius, y: light.y - light.radius,
        w: light.radius * 2, h: light.radius * 2 });
    }
    this._dirtyRects = [];
    this._clearPixels = 0;
    for (var j = 0; j < sourceRects.length; j++) {
      var source = sourceRects[j];
      // One backing pixel of padding covers antialiased clip/image boundaries.
      var x = Math.max(0, Math.floor((source.x * this._scale + this._offsetX) * sx) - 1);
      var y = Math.max(0, Math.floor((source.y * this._scale + this._offsetY) * sy) - 1);
      var right = Math.min(this.canvas.width, Math.ceil(((source.x + source.w) * this._scale + this._offsetX) * sx) + 1);
      var bottom = Math.min(this.canvas.height, Math.ceil(((source.y + source.h) * this._scale + this._offsetY) * sy) + 1);
      if (right <= x || bottom <= y) continue;
      var rect = { x: x, y: y, w: right - x, h: bottom - y };
      this._dirtyRects.push(rect);
      // Count overlapping clears too: this is actual cleared pixel work, not a
      // claimed union area. All rectangles clear before any effect is redrawn.
      this._clearPixels += rect.w * rect.h;
    }
  };

  HearthAmbience.prototype._sync = function () {
    if (this._disposed) return;
    var gentle = this.stage.classList.contains('gentle');
    var changed = gentle !== this._gentle;
    this._gentle = gentle;
    var stopped = this._paused || document.hidden || gentle;
    if (stopped) {
      if (this._raf !== null) global.cancelAnimationFrame(this._raf);
      this._raf = null;
      this._lastPaint = null;
      if (changed && gentle && !document.hidden) this._draw(0, true);
    } else if (this._raf === null) {
      this._lastPaint = null;
      this._raf = global.requestAnimationFrame(this._boundFrame);
    }
  };

  HearthAmbience.prototype._frame = function (now) {
    this._raf = null;
    if (this._disposed || this._paused || this._gentle || document.hidden) return;
    if (this._lastPaint === null) this._lastPaint = now - FRAME_MS;
    var elapsed = now - this._lastPaint;
    if (elapsed >= FRAME_MS - .3) {
      this._time += Math.min(elapsed, 100) / 1000;
      this._lastPaint = now;
      this._draw(this._time, false);
    }
    this._raf = global.requestAnimationFrame(this._boundFrame);
  };

  HearthAmbience.prototype._draw = function (time, still) {
    var ctx = this.context;
    if (!ctx) return;
    var begin = global.performance && global.performance.now ? global.performance.now() : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (var i = 0; i < this._dirtyRects.length; i++) {
      var rect = this._dirtyRects[i];
      ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    }
    var sx = this.canvas.width / this._width;
    var sy = this.canvas.height / this._height;
    ctx.setTransform(this._scale * sx, 0, 0, this._scale * sy, this._offsetX * sx, this._offsetY * sy);
    ctx.imageSmoothingEnabled = false;
    this._drawLights(ctx, time, still);
    this._rainPainted = 0;
    if (!still) {
      this._drawRain(ctx, time);
      this._drawFire(ctx, time);
    }
    this._lastDrawCalls = this._dirtyRects.length + LIGHTS.length + (still ? 0 : 44 + this._rainPainted * 2);
    this._lastPaintCpuMs = begin ? Math.max(0, global.performance.now() - begin) : 0;
    this._paintCpuMs += this._lastPaintCpuMs;
    this._frames++;
  };

  HearthAmbience.prototype._drawRain = function (ctx, time) {
    ctx.save();
    ctx.beginPath();
    for (var pane = 0; pane < GLASS.length; pane++) {
      var glass = GLASS[pane];
      ctx.rect(glass.x, glass.y, glass.w, glass.h);
    }
    ctx.clip();
    // No gradients or all-window wash: just faint vertical pixel streaks.
    for (var i = 0; i < this._drops.length; i++) {
      var drop = this._drops[i];
      var y = ((drop.offset + time * drop.speed) % 264) - 24;
      var x = drop.x + Math.sin(time * .28 + drop.phase) * 1.5;
      var px = pixel(x), py = pixel(y), visible = false;
      // Cull wholly clipped streaks before assigning styles or issuing draws.
      // Retain the exact six-pane clip for streaks crossing a glass boundary.
      for (var p = 0; p < GLASS.length; p++) {
        var rect = GLASS[p];
        if (px < rect.x + rect.w && px + drop.width > rect.x &&
            py < rect.y + rect.h && py + drop.length > rect.y) { visible = true; break; }
      }
      if (!visible) continue;
      ctx.fillStyle = drop.bodyColor;
      ctx.fillRect(px, py, drop.width, drop.length);
      ctx.fillStyle = drop.tipColor;
      ctx.fillRect(px, pixel(y + drop.length - 2), drop.width, 2);
      this._rainPainted++;
    }
    ctx.restore();
  };

  HearthAmbience.prototype._drawLights = function (ctx, time, still) {
    for (var i = 0; i < LIGHTS.length; i++) {
      var light = LIGHTS[i];
      // Independent, slow frequencies avoid synchronised pulsing or flashing.
      var breath = still ? 1 : 1 + .10 * Math.sin(time * 1.1 + light.phase) + .055 * Math.sin(time * 2.23 + light.phase * 2);
      var strength = light.strength * breath;
      ctx.globalAlpha = strength;
      ctx.drawImage(this._glowStamps[light.radius], light.x - light.radius, light.y - light.radius);
      ctx.globalAlpha = 1;
      if (still || light.fire) continue;
      var tick = Math.floor(time * 10) / 10;
      var sway = pixel(Math.sin(tick * 3 + light.phase) * (light.id==='right-candle'?2.3:1.6));
      var height = pixel(light.flameH + Math.sin(tick * 4.2 + light.phase) * (light.id==='right-candle'?3:2));
      var x = pixel(light.x), bottom = pixel(light.flameY);
      ctx.fillStyle = 'rgba(255,161,47,.20)';
      ctx.fillRect(x - 2, bottom - height + 4, 6, height - 4);
      ctx.fillStyle = 'rgba(255,208,99,.36)';
      ctx.fillRect(x + sway, bottom - height, 2, Math.max(4, height - 6));
      ctx.fillStyle = 'rgba(255,238,176,.27)';
      ctx.fillRect(x, bottom - 6, 2, 4);
    }
  };

  HearthAmbience.prototype._drawFire = function (ctx, time) {
    ctx.save();
    // The firebox mask prevents moving flame pixels reaching stone or firewood.
    ctx.beginPath();
    ctx.moveTo(0, 370); ctx.lineTo(38, 343); ctx.lineTo(79, 354);
    ctx.lineTo(98, 416); ctx.lineTo(75, 458); ctx.lineTo(0, 479);
    ctx.closePath(); ctx.clip();
    var tick = Math.floor(time * 12) / 12;
    for (var baseIndex = 0; baseIndex < FIRE_BASES.length; baseIndex++) {
      var base = FIRE_BASES[baseIndex], i = baseIndex;
      var phase = tick * (2.5 + i * .2) + i * 2.1;
      var height = pixel(base.h + Math.sin(phase) * 5 + Math.sin(phase * 1.8) * 3);
      var lean = pixel(Math.sin(phase * .75) * 3);
      var x = pixel(base.x), y = pixel(base.y);
      ctx.fillStyle = 'rgba(254,102,22,.12)';
      ctx.fillRect(x - 4, y - height + 12, 12, height - 12);
      ctx.fillStyle = 'rgba(255,180,53,.25)';
      ctx.fillRect(x - 2, y - height + 6, 6, height - 12);
      ctx.fillStyle = 'rgba(255,220,117,.29)';
      ctx.fillRect(x + lean, y - height, 2, 10);
      ctx.fillRect(x, y - 12, 4, 10);
    }
    for (var i = 0; i < 4; i++) {
      var progress = ((time * .18 + i * .247) % 1);
      var ex = pixel(25 + i * 13 + Math.sin(time + i) * 3);
      var ey = pixel(426 - progress * 62);
      ctx.fillStyle = 'rgba(255,191,93,' + (.20 * Math.sin(progress * Math.PI)) + ')';
      ctx.fillRect(ex, ey, 2, 2);
    }
    ctx.restore();
  };

  HearthAmbience.prototype.setPaused = function (paused) {
    this._paused = !!paused;
    this._sync();
  };
  HearthAmbience.prototype.pause = function () { this.setPaused(true); };
  HearthAmbience.prototype.resume = function () { this.setPaused(false); };
  HearthAmbience.prototype.getDiagnostics = function () {
    return {
      disposed: this._disposed,
      running: this._raf !== null,
      paused: this._paused,
      reducedMotion: this._gentle,
      hidden: document.hidden,
      frames: this._frames,
      time: this._time,
      rainDrops: this._drops.length,
      paint: {
        backingWidth: this.canvas.width,
        backingHeight: this.canvas.height,
        fullBufferPixels: this.canvas.width * this.canvas.height,
        clearPixelsPerFrame: this._clearPixels,
        dirtyRectangles: this._dirtyRects.length,
        lastRasterCalls: this._lastDrawCalls,
        rainDropsDrawnLastFrame: this._rainPainted,
        rainDropsCulledLastFrame: this._drops.length - this._rainPainted,
        cachedGlowStamps: Object.keys(this._glowStamps).length,
        glowCachePixels: this._cachePixels,
        glowCacheBytes: this._cachePixels * 4,
        gradientBuilds: this._gradientBuilds,
        steadyStateGradientBuilds: 0,
        lastDrawCommandMs: this._lastPaintCpuMs,
        averageDrawCommandMs: this._frames ? this._paintCpuMs / this._frames : 0
      },
      sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
      cover: { scale: this._scale, x: this._offsetX, y: this._offsetY },
      glass: GLASS.map(copyRect),
      lights: LIGHTS.map(function (light) { return { id: light.id, x: light.x, y: light.y, radius: light.radius }; })
    };
  };
  HearthAmbience.prototype.destroy = function () {
    if (this._disposed) return;
    this._disposed = true;
    if (this._raf !== null) global.cancelAnimationFrame(this._raf);
    this._raf = null;
    this._observer.disconnect();
    document.removeEventListener('visibilitychange', this._boundSync);
    global.removeEventListener('resize', this._boundResize);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas.width = this.canvas.height = 0;
    for (var radius in this._glowStamps) {
      this._glowStamps[radius].width = this._glowStamps[radius].height = 0;
    }
    this._glowStamps = {};
    this._cachePixels = 0;
    instances.delete(this.stage);
  };

  global.HearthAmbience = HearthAmbience;
}(typeof window !== 'undefined' ? window : globalThis));
