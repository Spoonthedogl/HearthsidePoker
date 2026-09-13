/* Hearthside Poker — original procedural sound. No samples, network or dependencies.
 * Classic script, compatible with Unreal's Chromium Web Browser widget.
 * Exposes window.HearthAudio; see ../SOUND_DESIGN.md for the public API.
 * prepare() silently creates/suspends the device and builds original buffers
 * during loading. init() resumes from a user gesture and starts playback once.
 */
(function (global) {
  'use strict';

  var FLOOR = 0.0001;
  var LIMIT = 128;
  var BPM = 76;
  var TRACKS = [
    {name:'Windowlight',bpm:76,beats:[3,6],brush:true,chords:[[41,[57,60,64,67],[72,76,79,76]],[38,[53,57,60,64],[69,72,76,72]],[46,[57,60,62,65],[69,74,77,74]],[36,[55,58,62,69],[70,74,79,77]]]},
    {name:'Cedar Steps',bpm:68,beats:[2,5,7],brush:false,chords:[[48,[55,59,62,64],[76,74,71,67]],[45,[55,60,64,67],[72,71,69,64]],[41,[53,57,60,64],[69,72,76,72]],[43,[55,59,62,69],[74,71,69,67]]]},
    {name:'Rain on the Roof',bpm:72,beats:[1,4,7],brush:true,chords:[[38,[53,57,60,64],[77,76,72,69]],[43,[53,57,59,64],[74,71,69,64]],[48,[55,59,62,64],[72,67,71,76]],[45,[55,59,60,64],[76,72,71,69]]]},
    {name:'Last Ember',bpm:62,beats:[3,7],brush:false,chords:[[46,[53,57,60,62],[74,72,69,65]],[41,[53,57,60,67],[72,69,67,65]],[43,[53,58,62,65],[70,74,77,74]],[48,[55,58,62,65],[74,70,67,65]]]}
  ];
  function clamp(value, low, high) {
    value = Number(value);
    return isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
  }
  function midi(note) { return 440 * Math.pow(2, (note - 69) / 12); }

  function HearthAudio(options) {
    options = options || {};
    this._master = options.master == null ? 0.72 : clamp(options.master, 0, 1);
    this._music = options.music == null ? 0.19 : clamp(options.music, 0, 1);
    this._ambience = options.ambience == null ? 0.16 : clamp(options.ambience, 0, 1);
    this._muted = !!options.muted;
    this._seed = 918271;
    this._sources = [];
    this._loops = [];
    this._last = {};
    this._context = null;
    this._timer = null;
    this._hidden = false;
    this._disposed = false;
    this._musicStep = 0;
    this._nextStep = 0;
    this._nextCrackle = 0;
    this._visibility = null;
    this._preparePromise = null;
    this._activationPromise = null;
    this._prepared = false;
    this._preparing = false;
    this._activated = false;
    this._pendingEffects = [];
    this.available = !!(global.AudioContext || global.webkitAudioContext);
  }

  HearthAudio.prototype._random = function () {
    this._seed = (1664525 * this._seed + 1013904223) >>> 0;
    return this._seed / 4294967296;
  };
  HearthAudio.prototype._vary = function (amount) {
    return 1 + (this._random() * 2 - 1) * amount;
  };

  // Call during loading. No sources, music, ambience or scheduler start here.
  // Device creation is synchronous; the promise confirms its silent suspension.
  HearthAudio.prototype.prepare = function () {
    var self = this;
    if (this._disposed || !this.available) return Promise.resolve(false);
    if (this._preparePromise) return this._preparePromise;
    this._preparing = true;
    try {
      var Context = global.AudioContext || global.webkitAudioContext;
      this._context = new Context();
      // Suspend immediately, even where embedded Chromium allows autoplay.
      // The graph has no sources yet, so a pending suspension stays inaudible.
      var suspended = this._context.suspend ? this._context.suspend() : null;
      this._buildGraph();
      this._makeNoise();
      this._makeRoom();
      if (global.document && global.document.addEventListener) {
        this._visibility = function () { self._setHidden(!!global.document.hidden); };
        global.document.addEventListener('visibilitychange', this._visibility);
        this._hidden = !!global.document.hidden;
        if (this._hidden) this._masterNode.gain.value = 0;
      }
      this._preparePromise = Promise.resolve(suspended).then(function () {
        self._preparing = false;
        self._prepared = !self._disposed && !!self._context && self._context.state !== 'closed';
        return self._prepared;
      }, function () {
        self._preparing = false;
        self._prepared = false;
        return false;
      });
    } catch (error) {
      // If graph construction fails, closing the device may reject its pending
      // suspension too. Observe that abandoned promise to avoid an unhandled
      // rejection while returning the original safe preparation failure.
      if (suspended && suspended.then) suspended.then(null, function () {});
      this.available = false;
      this._preparing = false;
      if (this._context && this._context.close) this._context.close();
      this._context = null;
      this._preparePromise = Promise.resolve(false);
    }
    return this._preparePromise;
  };

  HearthAudio.prototype._activate = function () {
    if (this._disposed || this._hidden || !this._prepared || !this._context || this._context.state !== 'running') return false;
    if (!this._activated) {
      var self = this;
      this._activated = true;
      this._startAmbience();
      this._nextStep = this._context.currentTime + 0.25;
      this._nextCrackle = this._context.currentTime + 1.5;
      this._timer = global.setInterval(function () { self._schedule(); }, 100);
      // At most eight events can wait for the first activation; there is no
      // unbounded queue and no deferred sound after disposal or failed resume.
      var effects = this._pendingEffects;
      this._pendingEffects = [];
      for (var i = 0; i < effects.length; i++) this.play(effects[i].name, effects[i].options);
    }
    this._schedule();
    return true;
  };

  // Call directly from a pointer/key gesture. The promise is safe to ignore.
  HearthAudio.prototype.init = function () {
    var self = this;
    if (this._disposed || !this.available) return Promise.resolve(false);
    var prepared = this.prepare();
    if (!this._context || this._hidden) return Promise.resolve(false);
    if (this._activated && this._context.state === 'running') return Promise.resolve(true);
    if (this._activationPromise) return this._activationPromise;
    var resumed;
    try {
      // Always request resume inside this gesture, even if a warmup suspend is
      // pending and the context still reports running. Never await it first.
      resumed = this._context.resume();
    } catch (error) { return Promise.resolve(false); }
    this._activationPromise = Promise.all([prepared, Promise.resolve(resumed)]).then(function (results) {
      if (!results[0] || self._disposed || self._hidden || !self._context) return false;
      // A platform may acknowledge resume before its earlier suspend settles.
      // The gesture resume above has already unlocked the device; finish that
      // race before allowing any source or scheduler to start.
      if (self._context.state !== 'running') {
        return Promise.resolve(self._context.resume()).then(function () { return self._activate(); });
      }
      return self._activate();
    }).then(function (active) {
      self._activationPromise = null;
      if (!active) self._pendingEffects = [];
      return !!active;
    }, function () {
      self._activationPromise = null;
      self._pendingEffects = [];
      return false;
    });
    return this._activationPromise;
  };

  HearthAudio.prototype._buildGraph = function () {
    var c = this._context;
    this._fxBus = c.createGain();
    this._musicBus = c.createGain();
    this._ambientBus = c.createGain();
    this._mix = c.createGain();
    this._masterNode = c.createGain();
    this._roomInput = c.createGain();
    this._roomOutput = c.createGain();
    this._room = c.createConvolver();
    this._compressor = c.createDynamicsCompressor();
    this._limiter = c.createDynamicsCompressor();
    this._highpass = c.createBiquadFilter();
    this._highpass.type = 'highpass';
    this._highpass.frequency.value = 32;
    this._highpass.Q.value = 0.5;
    this._fxBus.gain.value = 0.88;
    this._musicBus.gain.value = this._music;
    this._ambientBus.gain.value = this._ambience;
    this._masterNode.gain.value = this._muted ? 0 : this._master;
    this._roomInput.gain.value = 0.24;
    this._roomOutput.gain.value = 0.28;
    this._compressor.threshold.value = -19;
    this._compressor.knee.value = 18;
    this._compressor.ratio.value = 3;
    this._compressor.attack.value = 0.008;
    this._compressor.release.value = 0.23;
    this._limiter.threshold.value = -4;
    this._limiter.knee.value = 0;
    this._limiter.ratio.value = 20;
    this._limiter.attack.value = 0.002;
    this._limiter.release.value = 0.13;
    this._fxBus.connect(this._mix);
    this._musicBus.connect(this._mix);
    this._ambientBus.connect(this._mix);
    this._fxBus.connect(this._roomInput);
    this._musicBus.connect(this._roomInput);
    this._roomInput.connect(this._room);
    this._room.connect(this._roomOutput);
    this._roomOutput.connect(this._mix);
    this._mix.connect(this._highpass);
    this._highpass.connect(this._compressor);
    this._compressor.connect(this._masterNode);
    this._masterNode.connect(this._limiter);
    this._limiter.connect(c.destination);
  };

  HearthAudio.prototype._makeNoise = function () {
    var c = this._context, length = c.sampleRate * 3;
    this._white = c.createBuffer(1, length, c.sampleRate);
    this._brown = c.createBuffer(1, length, c.sampleRate);
    var w = this._white.getChannelData(0), b = this._brown.getChannelData(0), last = 0;
    for (var i = 0; i < length; i++) {
      w[i] = this._random() * 2 - 1;
      last = (last + 0.025 * w[i]) / 1.025;
      b[i] = last * 4.3;
    }
    // A short linear crossfade makes both ends meet for quiet ambience loops.
    var fade = Math.floor(c.sampleRate * 0.08);
    for (var n = 0; n < fade; n++) {
      var blend = n / fade;
      w[length - fade + n] = w[length - fade + n] * (1 - blend) + w[n] * blend;
      b[length - fade + n] = b[length - fade + n] * (1 - blend) + b[n] * blend;
    }
  };

  HearthAudio.prototype._makeRoom = function () {
    var c = this._context, length = Math.floor(c.sampleRate * 1.35);
    var impulse = c.createBuffer(2, length, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var data = impulse.getChannelData(ch), smooth = 0;
      for (var i = 0; i < length; i++) {
        smooth = smooth * 0.63 + (this._random() * 2 - 1) * 0.37;
        var time = i / c.sampleRate;
        var attack = Math.min(1, time / 0.012);
        data[i] = smooth * Math.exp(-time * 5.7) * attack * 0.44;
      }
      // Three tiny early room reflections: felted timber, not a cavern.
      [0.019, 0.037, 0.061].forEach(function (delay, index) {
        data[Math.floor((delay + ch * 0.003) * c.sampleRate)] += 0.22 / (index + 1);
      });
    }
    this._room.buffer = impulse;
  };

  HearthAudio.prototype._route = function (gain, pan, bus) {
    var panner = null;
    if (this._context.createStereoPanner) {
      panner = this._context.createStereoPanner();
      panner.pan.value = clamp(pan == null ? 0 : pan, -1, 1);
      gain.connect(panner);
      panner.connect(bus || this._fxBus);
    } else gain.connect(bus || this._fxBus);
    return panner;
  };

  HearthAudio.prototype._track = function (source, nodes) {
    var self = this;
    this._sources.push(source);
    source.onended = function () {
      var index = self._sources.indexOf(source);
      if (index !== -1) self._sources.splice(index, 1);
      source.disconnect();
      nodes.forEach(function (node) { if (node) node.disconnect(); });
      source.onended = null;
    };
  };

  HearthAudio.prototype._tone = function (frequency, time, duration, volume, pan, bus, options) {
    if (this._sources.length >= LIMIT || volume <= 0) return;
    options = options || {};
    var c = this._context, source = c.createOscillator(), gain = c.createGain();
    var attack = Math.min(options.attack || 0.004, duration * 0.3);
    time = Math.max(c.currentTime, time);
    source.type = options.type || 'sine';
    source.frequency.setValueAtTime(Math.max(20, frequency), time);
    if (options.endFrequency) source.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), time + duration * 0.8);
    if (options.detune) source.detune.value = options.detune;
    gain.gain.setValueAtTime(FLOOR, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(FLOOR, volume), time + attack);
    gain.gain.exponentialRampToValueAtTime(FLOOR, time + duration);
    source.connect(gain);
    var panner = this._route(gain, pan, bus);
    this._track(source, [gain, panner]);
    source.start(time);
    source.stop(time + duration + 0.02);
  };

  HearthAudio.prototype._noise = function (time, duration, volume, cutoff, pan, bus, options) {
    if (this._sources.length >= LIMIT || volume <= 0) return;
    options = options || {};
    var c = this._context, source = c.createBufferSource();
    var filter = c.createBiquadFilter(), gain = c.createGain();
    time = Math.max(c.currentTime, time);
    source.buffer = options.brown ? this._brown : this._white;
    filter.type = options.type || 'bandpass';
    filter.frequency.setValueAtTime(cutoff, time);
    filter.Q.value = options.q == null ? 0.6 : options.q;
    if (options.endCutoff) filter.frequency.exponentialRampToValueAtTime(options.endCutoff, time + duration);
    var attack = Math.min(options.attack || 0.003, duration * 0.4);
    gain.gain.setValueAtTime(FLOOR, time);
    gain.gain.linearRampToValueAtTime(volume, time + attack);
    gain.gain.exponentialRampToValueAtTime(FLOOR, time + duration);
    source.connect(filter);
    filter.connect(gain);
    var panner = this._route(gain, pan, bus);
    this._track(source, [filter, gain, panner]);
    source.start(time, this._random() * 1.4);
    source.stop(time + duration + 0.02);
  };

  HearthAudio.prototype._wood = function (time, volume, pan, pitch, bus) {
    pitch = pitch || 1;
    this._tone(285 * pitch, time, 0.09, 0.18 * volume, pan, bus, { endFrequency: 151 * pitch });
    this._tone(670 * pitch, time, 0.036, 0.085 * volume, pan, bus, { type: 'triangle', endFrequency: 490 * pitch });
    this._noise(time, 0.025, 0.11 * volume, 1300, pan, bus, { q: 0.8 });
  };

  HearthAudio.prototype._chip = function (time, volume, pan, pitch, bus) {
    pitch = (pitch || 1) * this._vary(0.04);
    this._tone(1260 * pitch, time, 0.17, 0.091 * volume, pan, bus);
    this._tone(2125 * pitch, time, 0.075, 0.059 * volume, pan, bus);
    this._tone(3160 * pitch, time, 0.031, 0.026 * volume, pan, bus);
    this._tone(195 * pitch, time, 0.07, 0.086 * volume, pan, bus, { endFrequency: 124 * pitch });
    this._noise(time, 0.018, 0.066 * volume, 4800, pan, bus, { q: 0.3 });
  };

  HearthAudio.prototype._key = function (note, time, volume, pan, bus, duration) {
    var f = midi(note), length = duration || 1.55;
    this._tone(f, time, length, 0.16 * volume, pan, bus, { type: 'triangle', attack: 0.009 });
    this._tone(f * 2.003, time, length * 0.39, 0.046 * volume, pan, bus, { attack: 0.003 });
    this._tone(f * 6.99, time, 0.12, 0.006 * volume, pan, bus);
  };

  HearthAudio.prototype._startAmbience = function () {
    var c = this._context, self = this;
    [
      { buffer: this._brown, cutoff: 260, volume: 0.12, pan: -0.4, speed: 0.83 },
      { buffer: this._white, cutoff: 1100, volume: 0.025, pan: 0.5, speed: 0.97 }
    ].forEach(function (setting) {
      var source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
      source.buffer = setting.buffer;
      source.loop = true;
      // The crossfaded tail rejoins the first 80 ms without a hard edge.
      source.loopStart = 0.08;
      source.loopEnd = 3;
      source.playbackRate.value = setting.speed;
      filter.type = 'lowpass';
      filter.frequency.value = setting.cutoff;
      filter.Q.value = 0.55;
      gain.gain.setValueAtTime(FLOOR, c.currentTime);
      gain.gain.linearRampToValueAtTime(setting.volume, c.currentTime + 2.5);
      source.connect(filter);
      filter.connect(gain);
      var pan = self._route(gain, setting.pan, self._ambientBus);
      self._loops.push({ source: source, nodes: [filter, gain, pan] });
      source.start();
    });
  };

  HearthAudio.tracks = TRACKS.map(function(t){return t.name;});
  HearthAudio.prototype.setTrack = function(value) { this._selectedTrack = value==='auto' ? -1 : Math.max(0,Math.min(3,Number(value)||0)); this._musicStep=0; };
  HearthAudio.prototype._trackAt = function(step) { return TRACKS[this._selectedTrack>=0 ? this._selectedTrack : Math.floor(step/256)%TRACKS.length]; };
  HearthAudio.prototype._musicBeat = function (step, time) {
    var bar = Math.floor(step / 8), local = step % 8;
    var track=this._trackAt(step), progression=track.chords.map(function(c){return {bass:c[0],notes:c[1],melody:c[2]};});
    // A four-beat rest separates compositions; phrase endings leave space for tails.
    if(step%256>=248)return;
    var chord = progression[bar % 4], self = this, cycle = Math.floor(bar / 4);
    if (local === 0) {
      chord.notes.forEach(function (note, index) {
        self._key(note, time + index * 0.022, 0.44 * self._vary(0.07), -0.32 + index * 0.2, self._musicBus, 2.2);
      });
      this._tone(midi(chord.bass), time, 1.35, 0.16, -0.12, this._musicBus, { attack: 0.025 });
      this._tone(midi(chord.bass + 12), time, 0.65, 0.027, -0.12, this._musicBus, { type: 'triangle', attack: 0.018 });
    }
    if (local === 4) this._tone(midi(chord.bass + (bar % 2 ? 7 : 12)), time, 0.9, 0.1, 0.13, this._musicBus, { attack: 0.02 });
    if (track.beats.indexOf(local)>=0 && (bar % 2 === 0 || local === track.beats[track.beats.length-1])) {
      var index = (cycle + bar + (local === 6 ? 1 : 0)) % chord.melody.length;
      this._key(chord.melody[index], time + (local === 3 ? 0.035 : 0), 0.2, 0.28, this._musicBus, 1.2);
    }
    if (track.brush && (local === 2 || local === 6)) {
      this._noise(time, 0.18, 0.042, 2100, -0.2, this._musicBus, { attack: 0.035, endCutoff: 1200 });
      this._noise(time + 0.014, 0.09, 0.012, 5200, 0.2, this._musicBus);
    }
  };

  HearthAudio.prototype._schedule = function () {
    var c = this._context;
    if (!c || !this._activated || c.state !== 'running' || this._hidden || this._disposed) return;
    var now = c.currentTime, stepLength = 60 / this._trackAt(this._musicStep).bpm / 2;
    // Never queue a burst of notes after a stalled window or suspended context.
    if (this._nextStep < now - stepLength) this._nextStep = now + 0.1;
    var count = 0;
    while (this._nextStep < now + 0.22 && count++ < 4) {
      if (!this._muted && this._master > 0 && this._music > 0) this._musicBeat(this._musicStep, this._nextStep);
      this._musicStep = (this._musicStep + 1) % 1024;
      this._nextStep += stepLength;
      stepLength=60 / this._trackAt(this._musicStep).bpm / 2;
    }
    if (now > this._nextCrackle) {
      if (!this._muted && this._master > 0 && this._ambience > 0) {
        var pan = -0.65 + this._random() * 0.4;
        this._noise(now + 0.01, 0.07, 0.042, 1150, pan, this._ambientBus, { brown: true });
        if (this._random() > 0.5) this._noise(now + 0.046, 0.026, 0.022, 2700, pan, this._ambientBus);
      }
      this._nextCrackle = now + 1.2 + this._random() * 3.8;
    }
  };

  // play(name, { volume: 0..1.5, pan: -1..1, pitch: 0.5..2, intensity: 0..1, count: 1..9, delay: 0..1 })
  HearthAudio.prototype.play = function (name, options) {
    options = options || {};
    this.init();
    if (!this._context || this._disposed || this._muted || this._hidden || this._master <= 0) return;
    if (!this._activated) {
      if (this._activationPromise && this._pendingEffects.length < 8) {
        var pendingOptions = {};
        for (var key in options) if (Object.prototype.hasOwnProperty.call(options, key)) pendingOptions[key] = options[key];
        this._pendingEffects.push({ name: name, options: pendingOptions });
      }
      return;
    }
    var now = this._context.currentTime;
    var throttle = name === 'hover' ? 0.075 : (name === 'turn' ? 0.35 : 0.025);
    if (this._last[name] != null && now - this._last[name] < throttle) return;
    this._last[name] = now;
    var time = now + 0.006 + clamp(options.delay || 0, 0, 1);
    var volume = (options.volume == null ? 1 : clamp(options.volume, 0, 1.5)) * this._vary(0.055);
    var pan = clamp(options.pan || 0, -1, 1);
    var pitch = (options.pitch == null ? 1 : clamp(options.pitch, 0.5, 2)) * this._vary(0.022);
    var intensity = options.intensity == null ? 0.5 : clamp(options.intensity, 0, 1);
    var self = this, i;
    switch (name) {
      case 'npc_juniper':
        [0,.085,.18].forEach(function(d,i){self._tone(680-i*65,time+d,.075,.05*volume,pan,null,{type:'triangle',endFrequency:420-i*35,attack:.012});self._noise(time+d,.055,.02*volume,1700,pan,null,{attack:.012});});break;
      case 'npc_luma':
        [0,.09,.19].forEach(function(d,i){self._noise(time+d,.12,(i===1?.045:.03)*volume,1900,pan,null,{attack:.04,endCutoff:850});});break;
      case 'npc_moss':
        [0,.075,.15].forEach(function(d,i){self._tone(180-i*15,time+d,.095,.07*volume,pan,null,{type:'triangle',endFrequency:105,attack:.018});self._tone(360-i*30,time+d,.08,.022*volume,pan,null,{endFrequency:210,attack:.02});});break;
      case 'npc_clipper':
        this._noise(time,.26,.055*volume,420,pan,null,{brown:true,attack:.06,endCutoff:180});this._tone(92,time+.025,.23,.055*volume,pan,null,{type:'triangle',endFrequency:65,attack:.06});this._wood(time+.23,.1*volume,pan,.6);break;
      case 'npc_mur':
        [0,.12,.25].forEach(function(d,i){self._tone(470+i*140,time+d,.13,.065*volume,pan,null,{endFrequency:970+i*180,attack:.025});});break;
      case 'npc_baron':
        this._tone(165,time,.19,.07*volume,pan,null,{type:'triangle',endFrequency:105,attack:.025});this._tone(330,time+.01,.16,.03*volume,pan,null,{endFrequency:210,attack:.025});this._noise(time+.02,.2,.055*volume,850,pan,null,{attack:.035,endCutoff:280});break;
      case 'catSpin':
        [420,720,540,720,540,420,720,540,720,540].forEach(function(f,i){self._tone(f,time+i*.22,.18,.08*volume,0,null,{type:'triangle',attack:.035});self._tone(f*2,time+i*.22,.16,.018*volume,0,null,{attack:.03});});break;
      case 'teaStir':
        for(i=0;i<3;i++){this._tone((2100+i*90)*pitch,time+i*.22,.25,.023*volume,pan,null,{attack:.008});this._tone(3250*pitch,time+i*.22,.14,.008*volume,pan);}
        this._noise(time,.65,.016*volume,650,pan,null,{attack:.13,endCutoff:450});break;
      case 'teaSip':
        this._noise(time,.24,.12*volume,1300,pan,null,{attack:.055,endCutoff:620});
        this._noise(time+.06,.16,.045*volume,450,pan,null,{brown:true,attack:.025,endCutoff:850});
        this._tone(680,time+.19,.085,.022*volume,pan,null,{attack:.018});
        this._tone(1900,time+.36,.17,.018*volume,pan,null,{attack:.006});break;
      case 'hover':
        this._noise(time, 0.035, 0.026 * volume, 1000, pan);
        this._tone(770 * pitch, time, 0.035, 0.014 * volume, pan);
        break;
      case 'click':
        this._wood(time, 0.53 * volume, pan, pitch);
        break;
      case 'deal':
        this._noise(time, 0.15, 0.2 * volume, 1450, pan, null, { attack: 0.018, endCutoff: 3400 });
        this._noise(time + 0.08, 0.055, 0.068 * volume, 2700, pan);
        this._wood(time + 0.105, 0.27 * volume, pan, 1.5 * pitch);
        break;
      case 'flip':
        this._noise(time, 0.075, 0.17 * volume, 2400, pan, null, { attack: 0.01, endCutoff: 4900 });
        this._noise(time + 0.063, 0.06, 0.1 * volume, 1450, pan);
        this._wood(time + 0.095, 0.25 * volume, pan, 1.9 * pitch);
        this._tone(980 * pitch, time + 0.093, 0.16, 0.022 * volume, pan);
        break;
      case 'chips':
      case 'raise':
        var chips = Math.round(clamp(options.count == null ? (name === 'raise' ? 5 : 3) : options.count, 1, 9));
        for (i = 0; i < chips; i++) {
          this._chip(time + i * 0.043 + this._random() * 0.014, volume * (0.7 + i / chips * 0.22), pan + (this._random() - 0.5) * 0.12, pitch * (1 + i * 0.018));
        }
        this._noise(time, 0.21, 0.042 * volume, 800, pan, null, { brown: true, attack: 0.04 });
        if (name === 'raise') {
          this._key(65, time + 0.035, 0.36 * volume, pan, null, 0.68);
          this._key(72, time + 0.11, 0.29 * volume, pan, null, 0.8);
        }
        break;
      case 'fold':
        this._noise(time, 0.25, 0.17 * volume, 2600, pan, null, { attack: 0.045, endCutoff: 420 });
        this._wood(time + 0.16, 0.3 * volume, pan, 0.78 * pitch);
        break;
      case 'check':
        this._wood(time, 0.58 * volume, pan, 0.88 * pitch);
        this._wood(time + 0.105, 0.47 * volume, pan, 0.98 * pitch);
        break;
      case 'turn':
        this._key(72, time, 0.42 * volume, pan, null, 0.62);
        this._key(77, time + 0.12, 0.3 * volume, pan, null, 0.85);
        break;
      case 'guideOpen':
        this._noise(time, 0.21, 0.12 * volume, 600, pan, null, { attack: 0.035, endCutoff: 2800 });
        this._key(72, time + 0.015, 0.37 * volume, -0.12, null, 0.62);
        this._key(76, time + 0.075, 0.28 * volume, 0.12, null, 0.72);
        break;
      case 'guideClose':
        this._noise(time, 0.15, 0.088 * volume, 1700, pan, null, { attack: 0.025, endCutoff: 500 });
        this._key(69, time, 0.26 * volume, 0.12, null, 0.45);
        this._key(65, time + 0.07, 0.25 * volume, -0.12, null, 0.55);
        break;
      case 'shuffle':
        for (i = 0; i < 8; i++) {
          this._noise(time + i * 0.049, 0.055, volume * (0.105 + this._random() * 0.035), 1800 + this._random() * 1200, i % 2 ? -0.18 : 0.18);
        }
        this._wood(time + 0.47, 0.5 * volume, 0, 1.2 * pitch);
        break;
      case 'win':
        var notes = intensity > 0.7 ? [65, 69, 72, 76, 79, 84] : [65, 69, 72, 76, 79];
        notes.forEach(function (note, index) {
          var at = time + index * 0.093;
          self._key(note, at, volume * (0.73 - index * 0.047), -0.42 + index * 0.15, null, 1.5);
          if (index % 2 === 0) self._chip(at + 0.027, 0.39 * volume, -0.3 + index * 0.12, 0.8 + index * 0.07);
        });
        [53, 60, 64, 69].forEach(function (note, index) {
          self._key(note, time + 0.46 + index * 0.02, 0.45 * volume, -0.22 + index * 0.15, null, 2.1);
        });
        this._noise(time + 0.1, 0.85, 0.06 * volume, 3200, 0, null, { attack: 0.24, endCutoff: 900 });
        break;
      case 'lose':
        this._key(64, time, 0.33 * volume, -0.12, null, 0.88);
        this._key(60, time + 0.18, 0.32 * volume, 0.12, null, 1.35);
        this._key(55, time + 0.2, 0.21 * volume, 0, null, 1.6);
        this._noise(time, 0.28, 0.062 * volume, 700, pan, null, { brown: true, attack: 0.045 });
        break;
    }
  };

  HearthAudio.prototype._ramp = function (node, value, seconds) {
    if (!node || !this._context || this._disposed) return;
    var time = this._context.currentTime;
    node.gain.cancelScheduledValues(time);
    node.gain.setTargetAtTime(value, time, seconds || 0.045);
  };
  HearthAudio.prototype.setMaster = function (value) {
    this._master = clamp(value, 0, 1);
    this._ramp(this._masterNode, this._muted || this._hidden ? 0 : this._master);
    return this._master;
  };
  HearthAudio.prototype.setMusic = function (value) {
    this._music = clamp(value, 0, 1);
    this._ramp(this._musicBus, this._music, 0.12);
    return this._music;
  };
  HearthAudio.prototype.setAmbience = function (value) {
    this._ambience = clamp(value, 0, 1);
    this._ramp(this._ambientBus, this._ambience, 0.16);
    return this._ambience;
  };
  HearthAudio.prototype.setMuted = function (muted) {
    this._muted = !!muted;
    this._ramp(this._masterNode, this._muted || this._hidden ? 0 : this._master, 0.025);
    return this._muted;
  };
  HearthAudio.prototype.mute = function (muted) {
    return this.setMuted(arguments.length ? muted : !this._muted);
  };
  HearthAudio.prototype.toggleMute = function () { return this.setMuted(!this._muted); };
  HearthAudio.prototype.getMaster = function () { return this._master; };
  HearthAudio.prototype.getMusic = function () { return this._music; };
  HearthAudio.prototype.getAmbience = function () { return this._ambience; };
  HearthAudio.prototype.isMuted = function () { return this._muted; };
  HearthAudio.prototype.getSettings = function () {
    return { master: this._master, music: this._music, ambience: this._ambience, muted: this._muted };
  };
  Object.defineProperties(HearthAudio.prototype, {
    master: { get: function () { return this._master; }, set: function (v) { this.setMaster(v); } },
    music: { get: function () { return this._music; }, set: function (v) { this.setMusic(v); } },
    ambience: { get: function () { return this._ambience; }, set: function (v) { this.setAmbience(v); } },
    muted: { get: function () { return this._muted; }, set: function (v) { this.setMuted(v); } }
  });

  HearthAudio.prototype._setHidden = function (hidden) {
    this._hidden = hidden;
    this._ramp(this._masterNode, hidden || this._muted ? 0 : this._master, 0.025);
    // Background tabs stay silent and the scheduler makes no new sound nodes.
    // Keeping context ownership avoids a resume rejection on older embedded CEF.
    if (!hidden && this._context && this._activated) {
      this._nextStep = this._context.currentTime + 0.15;
      this.init();
    }
  };

  HearthAudio.prototype.destroy = function () {
    if (this._disposed) return;
    this._disposed = true;
    this._pendingEffects = [];
    if (this._timer != null) global.clearInterval(this._timer);
    if (this._visibility && global.document) global.document.removeEventListener('visibilitychange', this._visibility);
    this._sources.slice().forEach(function (source) { try { source.stop(); } catch (error) { /* Already stopped. */ } });
    this._loops.forEach(function (loop) {
      try { loop.source.stop(); } catch (error) { /* Already stopped. */ }
      loop.source.disconnect();
      loop.nodes.forEach(function (node) { if (node) node.disconnect(); });
    });
    this._loops.length = 0;
    if (this._context && this._context.close) this._context.close();
  };

  global.HearthAudio = HearthAudio;
}(typeof window !== 'undefined' ? window : globalThis));
