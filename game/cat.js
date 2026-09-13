/* Hearthside's windowsill cat. Original animation direction; no game-state access.
 * UMD: window.HearthCatDirector or require('./cat.js').
 * new HearthCatDirector({random?,onFrame?}); tick(elapsedMs,{hidden,paused,gentle});
 * getState() => {action:'sleep'|'stretch'|'groom'|'watch',frame:0..7,nextCheckMs}.
 * onFrame(frameNumber,state) runs when the frame or action changes. Render the
 * initial getState() yourself. play(action) is a deterministic QA hook only.
 * No timers or DOM listeners are owned here. Supply frame deltas, not timestamps.
 * Deltas are capped at 250ms; a stalled browser never rushes through old poses.
 * Hidden/modal time freezes the pose. Gentle motion returns to sleep and freezes
 * the clock. The first resumed tick consumes no time from a suspended interval.
 *
 * cat-states.png: 1774x887, four columns by two rows (443.5px square cells).
 * Frames: 0 sleep, 1 stretch start, 2 full stretch, 3 paw up, 4 lick paw,
 *         5 turn toward window, 6 watch window, 7 curl back to sleep.
 * CSS background-size:400% 200%; x:0/33.333333/66.666667/100%; y:0/100%.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HearthCatDirector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ACTIONS = ['stretch', 'groom', 'watch'];
  var SEQUENCES = {
    spin: [[3,3500],[7,800]],
    stretch: [[0, 300], [1, 800], [2, 3000], [1, 650], [7, 850]],
    groom: [[0, 250], [3, 700], [4, 800], [3, 350], [4, 800],
      [3, 350], [4, 850], [3, 500], [7, 900]],
    watch: [[0, 300], [5, 950], [6, 4200], [5, 750], [7, 800]]
  };

  function HearthCatDirector(options) {
    options = options || {};
    this._random = typeof options.random === 'function' ? options.random : Math.random;
    this._onFrame = typeof options.onFrame === 'function' ? options.onFrame : function () {};
    this._action = 'sleep';
    this._frame = 0;
    this._step = 0;
    this._stepLeft = 0;
    this._lastAction = null;
    this._suspended = false;
    this._gentle = false;
    this._nextCheck = this._range(35000, 65000);
  }

  HearthCatDirector.prototype._draw = function () {
    var value = Number(this._random());
    return isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0.5;
  };
  HearthCatDirector.prototype._range = function (low, high) {
    return low + Math.floor(this._draw() * (high - low));
  };
  HearthCatDirector.prototype.getState = function () {
    return {action: this._action, frame: this._frame, nextCheckMs: this._nextCheck};
  };
  HearthCatDirector.prototype._notify = function () {
    this._onFrame(this._frame, this.getState());
  };
  HearthCatDirector.prototype._sleep = function () {
    var changed = this._action !== 'sleep' || this._frame !== 0;
    this._action = 'sleep';
    this._frame = 0;
    this._step = 0;
    this._stepLeft = 0;
    if (changed) this._notify();
  };
  HearthCatDirector.prototype._start = function (action) {
    this._action = action;
    this._lastAction = action;
    this._step = 0;
    this._frame = SEQUENCES[action][0][0];
    this._stepLeft = SEQUENCES[action][0][1];
    this._nextCheck = this._range(20000, 35000);
    this._notify();
  };

  // Test/preview hook: the production UI should let the quiet scheduler choose.
  HearthCatDirector.prototype.play = function (action) {
    if (this._suspended || this._gentle || !Object.prototype.hasOwnProperty.call(SEQUENCES,action)) return false;
    this._start(action);
    return true;
  };

  HearthCatDirector.prototype.tick = function (elapsedMs, context) {
    context = context || {};
    var wasSuspended = this._suspended;
    this._gentle = !!context.gentle;
    this._suspended = !!context.hidden || !!context.paused || this._gentle;
    if (this._gentle) this._sleep();
    if (this._suspended || wasSuspended) return this.getState();

    var elapsed = Number(elapsedMs);
    if (!isFinite(elapsed) || elapsed <= 0) return this.getState();
    elapsed = Math.min(250, elapsed);

    if (this._action !== 'sleep') {
      var sequence = SEQUENCES[this._action];
      this._stepLeft -= elapsed;
      if (this._stepLeft <= 0) {
        // Every pose lasts at least 250ms, so at most one transition is due.
        this._step++;
        if (this._step >= sequence.length) this._sleep();
        else {
          this._stepLeft += sequence[this._step][1];
          this._frame = sequence[this._step][0];
          this._notify();
        }
      }
      return this.getState();
    }

    this._nextCheck = Math.max(0, this._nextCheck - elapsed);
    if (this._nextCheck === 0) {
      if (this._draw() < 0.22) {
        var candidates = [];
        for (var i = 0; i < ACTIONS.length; i++) {
          if (ACTIONS[i] !== this._lastAction) candidates.push(ACTIONS[i]);
        }
        var roll=this._draw();
        this._start(roll<.01 ? 'spin' : candidates[Math.min(candidates.length-1,Math.floor((roll-.01)/.99*candidates.length))]);
      } else this._nextCheck = this._range(20000, 35000);
    }
    return this.getState();
  };

  return HearthCatDirector;
});
