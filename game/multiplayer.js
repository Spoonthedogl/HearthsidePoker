/* Optional online play: a thin client for the Cloudflare Worker in worker/.
 * Nothing here runs unless a player explicitly creates or joins a room -
 * single-player is completely unaffected by this file's presence.
 *
 * The server already does every card-hiding and seat-rotation decision (see
 * worker/view.js): a message this client receives is already shaped exactly
 * like the single-player game already knows how to read - the viewer is
 * always local seat 0, and every hidden hole card already reads null. This
 * client's only job is turning that into something app.js's existing
 * render()/applyPublicEvent() can consume unmodified, and turning a button
 * click into a message back to the server.
 *
 * HearthOnline.connect({server, room, name, token, onWelcome, onLobby,
 *   onError, onClose}) -> opens the socket and sends the first hello/create.
 * HearthOnline.table -> a RemoteTable (see below): everything app.js reads
 *   off a real Poker.Table, fed by the server instead of computed locally.
 *   It has no act()/stepAI()/deck - every mutation is server-authoritative.
 * HearthOnline.act(type, amount?) / .next() / .configure(cfg) / .start() /
 *   .leave() send the matching message; the server is the only validator.
 * HearthOnline.waitForEvents(t) -> a cancellable promise, in the same shape
 *   as app.js's own wait(ms,t): resolves true once new events/state arrive,
 *   or false if the version token t has been superseded meanwhile.
 * HearthOnline.disconnect() closes the socket without telling the server
 *   (used when the player backs out of the online screen entirely).
 */
(function (g) {
  'use strict';

  function defaultServer() {
    try { var override = localStorage.getItem('hearthside-server'); if (override) return override; } catch (e) {}
    return 'wss://hearthside-rooms.hearthside.workers.dev';
  }

  // Everything app.js reads off a Poker.Table, fed entirely by server
  // messages. table.events grows across a whole hand exactly like the real
  // engine's event log does, so app.js's existing replay loop can walk it
  // with its own persistent eventIndex cursor with no changes at all.
  function RemoteTable() {
    this.players = []; this.board = []; this.street = 'idle'; this.dealer = -1; this.actor = null;
    this.currentBet = 0; this.minRaise = 0; this.handNumber = 0; this.result = null; this.gameOver = false;
    this.smallBlind = 5; this.bigBlind = 10; this.startingStack = 500;
    // Room-level (not poker.js-level) framing for a fixed-length online
    // "game": which game this room is on, how many hands it runs, and which
    // hand of the current game this is (1-indexed, for a "HAND X OF Y"
    // display) - table.handNumber itself never resets across games.
    this.gamesPlayed = 1; this.handsPerGame = 7; this.gameHand = 1;
    this.events = []; this.names = ['You']; this.legal = null; this.turnMs = null;
  }
  RemoteTable.prototype.snapshot = function () {
    return {players: this.players, board: this.board, street: this.street, dealer: this.dealer, actor: this.actor,
      currentBet: this.currentBet, minRaise: this.minRaise, pot: this.players.reduce(function (n, p) { return n + p.totalBet; }, 0),
      handNumber: this.handNumber, result: this.result, gameOver: this.gameOver};
  };
  // The server is the only place that ever validates or applies an action;
  // this simply hands back what it already told this client for the seat
  // whose turn it currently is (blank for every other seat, same shape
  // Poker.Table.legalActions() returns when asked about a seat that isn't
  // the current actor).
  RemoteTable.prototype.legalActions = function () {
    return this.legal || {fold: false, check: false, call: 0, canRaise: false, minRaiseTo: 0, maxRaiseTo: 0, allIn: 0, allInCanRaise: false};
  };
  // A disconnect/reconnect mid-hand only ever triggers a room-level 'lobby'
  // broadcast (see worker/room.js's disconnected()/hello()), never a fresh
  // 'events' snapshot - so without this, an opponent's connected flag on
  // this.players would sit stale until whatever 'events' message happens to
  // come next (the following action, or even the next hand). msg.seats is
  // in the server's own absolute seat numbering (everyone gets the same
  // broadcast), so it has to be rotated the same way the server itself
  // rotates 'events' snapshots before it lines up with this.players.
  RemoteTable.prototype._applyPresence = function (seats, mySeat) {
    if (!seats || mySeat === null || mySeat === undefined || !this.players.length) return;
    var n = this.players.length, self = this;
    seats.forEach(function (s) {
      if (!s || s.kind !== 'human') return;
      var local = ((s.seat - mySeat) % n + n) % n;
      if (self.players[local]) self.players[local].connected = s.connected;
    });
  };
  RemoteTable.prototype._applyEventsMessage = function (msg) {
    if (msg.snapshot.handNumber !== this.handNumber) this.events = [];
    this.events = (msg.from === this.events.length) ? this.events.concat(msg.events) : msg.events.slice();
    this.players = msg.snapshot.players; this.board = msg.snapshot.board; this.street = msg.snapshot.street;
    this.dealer = msg.snapshot.dealer; this.actor = msg.snapshot.actor; this.currentBet = msg.snapshot.currentBet;
    this.minRaise = msg.snapshot.minRaise; this.handNumber = msg.snapshot.handNumber; this.result = msg.snapshot.result;
    this.gameOver = msg.snapshot.gameOver;
    if (msg.smallBlind !== undefined) this.smallBlind = msg.smallBlind;
    if (msg.bigBlind !== undefined) this.bigBlind = msg.bigBlind;
    if (msg.startingStack !== undefined) this.startingStack = msg.startingStack;
    if (msg.gamesPlayed !== undefined) this.gamesPlayed = msg.gamesPlayed;
    if (msg.handsPerGame !== undefined) this.handsPerGame = msg.handsPerGame;
    if (msg.gameHand !== undefined) this.gameHand = msg.gameHand;
    if (msg.names) this.names = msg.names;
    this.legal = msg.legal || null; this.turnMs = msg.turnMs === undefined ? null : msg.turnMs;
  };

  function Client() {
    this.ws = null; this.seat = null; this.token = null; this.owner = false; this.room = null;
    this.started = false; // true once the room has dealt its first hand (the first 'events' message)
    this.table = new RemoteTable();
    this._handlers = {};
    this._waiters = []; // {t, resolve}
  }
  Client.prototype.on = function (name, fn) { this._handlers[name] = fn; };
  Client.prototype._emit = function (name, data) { if (this._handlers[name]) this._handlers[name](data); };

  Client.prototype.connect = function (options) {
    var self = this;
    options = options || {};
    this.room = options.room;
    var server = options.server || defaultServer();
    this._connectServer = server; // remembered so a later reconnect() can reopen the same server/room
    var ws = new WebSocket(server + (server.indexOf('?') >= 0 ? '&' : '?') + 'room=' + encodeURIComponent(options.room));
    this.ws = ws;
    ws.addEventListener('open', function () {
      var create = !!options.create;
      ws.send(JSON.stringify(create
        ? {t: 'create', name: options.name, cfg: options.cfg, avatar: options.avatar}
        : {t: 'hello', name: options.name, token: options.token, avatar: options.avatar}));
    });
    ws.addEventListener('message', function (event) { self._onMessage(event.data); });
    // self.ws !== ws once disconnect()/a fresh connect() has already moved on -
    // a late close event from an abandoned socket must not re-fire 'close'.
    ws.addEventListener('close', function () { self._settleAll(false); if (self.ws === ws) self._emit('close'); });
    ws.addEventListener('error', function () { self._emit('error', {error: 'connection-failed'}); });
  };
  // Reopens a fresh socket to the same room using the seat's existing token -
  // the server's hello() reconnect path resends the full current state, so
  // this is also how a client resyncs after an unexpected drop.
  Client.prototype.reconnect = function () {
    if (!this.token || !this.room) return;
    this.connect({server: this._connectServer, room: this.room, token: this.token});
  };

  Client.prototype._onMessage = function (raw) {
    var msg; try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'error') { this._emit('error', msg); return; }
    if (msg.t === 'welcome') { this.seat = msg.seat; this.token = msg.token; this.owner = !!msg.owner; this._emit('welcome', msg); return; }
    // Once a hand is already underway, a 'lobby' message is purely a
    // presence update (see RemoteTable.prototype._applyPresence's doc
    // comment above) - fold it into the live table instead of treating it
    // as the pre-game roster screen app.js's own 'lobby' handler renders.
    if (msg.t === 'lobby') { if (this.started) this.table._applyPresence(msg.seats, this.seat); this._emit('lobby', msg); return; }
    if (msg.t === 'events') { this.started = true; this.table._applyEventsMessage(msg); this._settleAll(true); this._emit('events', msg); return; }
    // Not a poker.js event - a room-level notice sent alongside (just before)
    // the fresh game's own 'events' message, never folded into table.events.
    if (msg.t === 'game-over') { this._emit('game-over', msg); return; }
  };

  // Modeled on app.js's own wait(ms,t): resolves true when new state has
  // arrived, false if superseded by a newer generation `t` in the meantime
  // (a reset/leave/rejoin), so drive()'s cancellation pattern works
  // identically whether the wait was for a timer or for the network.
  Client.prototype.waitForEvents = function (t) {
    var self = this;
    return new Promise(function (resolve) { self._waiters.push({t: t, resolve: resolve}); });
  };
  Client.prototype._settleAll = function (value) {
    var waiters = this._waiters; this._waiters = [];
    waiters.forEach(function (w) { w.resolve(value); });
  };
  // A pending wait whose generation token has already moved on should not
  // block a fresh drive() loop from starting; call this when app.js bumps
  // its version counter for an online table (leaving/resetting).
  Client.prototype.cancelWaiters = function () { this._settleAll(false); };

  Client.prototype._send = function (msg) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); };
  Client.prototype.configure = function (cfg) { this._send({t: 'configure', token: this.token, cfg: cfg}); };
  Client.prototype.start = function () { this._send({t: 'start', token: this.token}); };
  Client.prototype.act = function (action, amount) { this._send({t: 'act', token: this.token, handNumber: this.table.handNumber, action: action, amount: amount}); };
  Client.prototype.next = function () { this._send({t: 'next', token: this.token}); };
  Client.prototype.leave = function () { this._send({t: 'leave', token: this.token}); };
  Client.prototype.disconnect = function () {
    if (this.ws) { var ws = this.ws; this.ws = null; ws.close(); }
    this.cancelWaiters();
    this.seat = null; this.token = null; this.owner = false; this.room = null; this.started = false; this.table = new RemoteTable();
  };

  g.HearthOnline = new Client();
  g.HearthOnline.RemoteTable = RemoteTable; // exposed for tests only
})(typeof window !== 'undefined' ? window : this);
