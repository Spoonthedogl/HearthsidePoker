'use strict';
// A phone's audio device, modelled pessimistically: it starts suspended, it only
// resumes inside a touch, and a resume asked for outside one never settles.
const test = require('node:test');
const assert = require('node:assert/strict');

function param() { return {value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {}}; }
function node() {
  return {connect() {}, disconnect() {}, start() {}, stop() {}, type: '', buffer: null, loop: false,
    gain: param(), frequency: param(), Q: param(), detune: param(), pan: param(), playbackRate: param(),
    threshold: param(), knee: param(), ratio: param(), attack: param(), release: param()};
}

function phone({startsRunning = false} = {}) {
  const engine = {gesture: false, suspends: 0, resumes: 0, ticks: 0, listeners: {}};
  class Context {
    constructor() { this.state = startsRunning ? 'running' : 'suspended'; this.sampleRate = 8000; this.currentTime = 0; this.destination = node(); engine.context = this; }
    suspend() { engine.suspends++; this.state = 'suspended'; return Promise.resolve(); }
    resume() {
      engine.resumes++;
      if (engine.gesture || this.state === 'running') { this.state = 'running'; return Promise.resolve(); }
      return new Promise(() => {});
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() { return node(); }
    createConvolver() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBiquadFilter() { return node(); }
    createStereoPanner() { return node(); }
    createOscillator() { return node(); }
    createBufferSource() { const n = node(); n.start = () => { if (engine.gesture) engine.ticks++; }; return n; }
    createBuffer(channels, length, rate) {
      const data = Array.from({length: channels}, () => new Float32Array(length));
      return {length, sampleRate: rate, numberOfChannels: channels, getChannelData: i => data[i]};
    }
  }
  const document = {
    hidden: false,
    addEventListener(type, fn) { (engine.listeners[type] = engine.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { engine.listeners[type] = (engine.listeners[type] || []).filter(f => f !== fn); }
  };
  globalThis.AudioContext = Context;
  globalThis.document = document;
  // A tap: the platform delivers the event, and the page may call in while it is still inside it.
  engine.tap = (inside, type = 'touchend') => {
    engine.gesture = true;
    try { (engine.listeners[type] || []).forEach(fn => fn({type})); if (inside) inside(); }
    finally { engine.gesture = false; }
  };
  return engine;
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
require('../audio.js');
const HearthAudio = globalThis.HearthAudio;

test('a tap still wakes the sound after a bet asked for it outside a touch', async () => {
  const engine = phone(), audio = new HearthAudio();
  try {
    audio.prepare(); await settle();
    // A companion calls before the player has touched anything that asks for sound.
    audio.play('chips');
    await settle();
    assert.equal(engine.context.state, 'suspended', 'nothing can start without a touch');
    // The player taps a button; app.js calls init() from inside that click.
    engine.tap(() => audio.init(), 'click');
    await settle();
    assert.equal(engine.context.state, 'running', 'the tap has to reach resume(), not wait on the stale request');
    assert.equal(audio._activated, true, 'and the table has to actually start playing');
  } finally { audio.destroy(); }
});

test('a context the phone already suspended is not suspended again', async () => {
  const engine = phone(), audio = new HearthAudio();
  try {
    audio.prepare(); await settle();
    assert.equal(engine.suspends, 0, 'a redundant suspend() can land after the first tap and switch sound back off');
  } finally { audio.destroy(); }

  const desk = phone({startsRunning: true}), host = new HearthAudio();
  try {
    host.prepare(); await settle();
    assert.equal(desk.suspends, 1, 'where the platform starts it running, loading still stays silent');
  } finally { host.destroy(); }
});

test('sound comes back after a phone call without any button asking for it', async () => {
  const engine = phone(), audio = new HearthAudio();
  try {
    audio.prepare(); await settle();
    engine.tap(() => audio.init(), 'click'); await settle();
    assert.equal(audio._activated, true);
    engine.context.state = 'interrupted';
    // Any touch on the page will do - the felt, a card, the rain.
    engine.tap(null, 'touchend');
    await settle();
    assert.equal(engine.context.state, 'running');
  } finally { audio.destroy(); }
});

test('touching the page before taking a seat unlocks the device but plays nothing yet', async () => {
  const engine = phone(), audio = new HearthAudio();
  try {
    audio.prepare(); await settle();
    engine.tap(null, 'touchend'); await settle();
    assert.equal(engine.context.state, 'running', 'the device is unlocked while the finger is down');
    assert(engine.ticks >= 1, 'older iOS only wakes for a source started inside the touch');
    assert.equal(audio._activated, false, 'music and rain still wait for the player to engage');
  } finally { audio.destroy(); }
});

test('iPhones are told this is playback, so the silent switch does not mute the table', async (t) => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const session = {type: 'auto'};
  try { Object.defineProperty(globalThis, 'navigator', {value: {audioSession: session}, configurable: true, writable: true}); }
  catch (error) { t.skip('this Node will not let navigator be replaced'); return; }
  phone();
  const audio = new HearthAudio();
  try {
    audio.prepare(); await settle();
    assert.equal(session.type, 'playback');
  } finally {
    audio.destroy();
    if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator;
  }
});

test('destroying the sound stops listening for taps', async () => {
  const engine = phone(), audio = new HearthAudio();
  audio.prepare(); await settle();
  audio.destroy();
  const left = Object.values(engine.listeners).reduce((n, list) => n + list.length, 0);
  assert.equal(left, 0);
});
