/* A private online room: seats, tokens, the turn clock, and one live
 * Poker.Table. This class has no Cloudflare API surface at all - no
 * WebSockets, no Durable Object storage - so it can be constructed and
 * driven directly from a plain Node test. A thin adapter (index.js) owns the
 * real sockets and pumps this class's outbound instructions to them.
 *
 * Every mutating method returns {ok:true, ..., out:[{to,msg}, ...]} or
 * {ok:false, error}. `out` entries are addressed by seat number; the caller
 * resolves that to a socket (or drops it, if that seat has none connected
 * right now - Room never needs to know).
 *
 * Every message a seat receives comes from HearthRoomView.viewFor(), which
 * is the only place hole cards are ever read for transmission. That keeps
 * the trust boundary in one small file instead of scattered through this one.
 *
 * Unclaimed seats are always played by the existing AI, exactly as a
 * single-player table plays companions - a two-friend room still looks and
 * feels like Hearthside. Online rooms deliberately do not use the 12-hand
 * "evening"/club-fund structure: they just deal hands, keeping single-
 * player's economy untouched by anything a friend's room could do. Blinds
 * still follow the chosen table's schedule, exactly as single-player does.
 */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports
    ? {Poker: require('../game/poker.js'), HearthTables: require('../game/tables.js'), HearthSession: require('../game/session.js'), HearthRoomView: require('./view.js')}
    : {Poker: root.Poker, HearthTables: root.HearthTables, HearthSession: root.HearthSession, HearthRoomView: root.HearthRoomView};
  var api = factory(deps.Poker, deps.HearthTables, deps.HearthSession, deps.HearthRoomView);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HearthRoom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Poker, HearthTables, HearthSession, HearthRoomView) {
  'use strict';

  var TURN_MS_CONNECTED = 60000;
  var TURN_MS_DISCONNECTED = 15000;
  var BETWEEN_HANDS_MS = 20000;
  var ROOM_EXPIRE_MS = 10 * 60 * 1000;
  var STARTING_STACK = 500;

  // Fallback seats when a table has more chairs than people. Mirrors
  // game/roster.js's companion list (name/asset only - no art here) so an
  // AI-filled seat shows the same sprite the client already knows how to
  // draw. Keep these two lists in sync if the roster ever changes.
  var FALLBACK_COMPANIONS = [
    {name: 'Juniper', avatar: 'juniper'}, {name: 'Luna', avatar: 'luma'}, {name: 'Moss', avatar: 'moss'},
    {name: 'Clipper', avatar: 'clipper'}, {name: 'Mur', avatar: 'mur'}, {name: 'Baron', avatar: 'baron'}
  ];

  function sanitizeName(name) {
    name = (typeof name === 'string' ? name : '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 12);
    return name || 'Guest';
  }

  // A human seat's chosen sprite - one of the same six companions single-
  // player already draws. Any value that isn't one of them (missing, typo'd,
  // an older client) is simply left unset, so the client's own by-name/index
  // fallback in roster.js picks something instead of trusting free-form input.
  var VALID_AVATARS = FALLBACK_COMPANIONS.map(function (c) { return c.avatar; });
  function sanitizeAvatar(avatar) {
    return VALID_AVATARS.indexOf(avatar) >= 0 ? avatar : null;
  }

  function sanitizeConfig(cfg, fallback) {
    cfg = cfg || {};
    var seatCount = Number.isInteger(cfg.seatCount) ? cfg.seatCount : fallback.seatCount;
    seatCount = Math.max(2, Math.min(7, seatCount));
    return {seatCount: seatCount, tableKind: HearthTables.find(cfg.tableKind).id,
      difficulty: Poker.DIFFICULTIES.indexOf(cfg.difficulty) >= 0 ? cfg.difficulty : 'standard'};
  }

  function randomToken(random) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    // Test-environment / no Web Crypto fallback: fine for local development,
    // never used once deployed (the Workers runtime always has crypto).
    var s = ''; for (var i = 0; i < 4; i++) s += Math.floor(random() * 1e9).toString(36);
    return s;
  }

  // Advance the table on its own until it's a human's turn, the hand ends,
  // or no hand is in progress. Mirrors app.js's drive() loop, but the server
  // has no pacing to apply - AI seats resolve instantly, one act() apiece.
  function driveAI(table) {
    while (table.actor !== null && !table.result && !table.humanSeats.has(table.actor)) table.stepAI();
  }

  function Room(options) {
    options = options || {};
    this.random = options.random || Math.random;
    this.now = options.now || (function () { return Date.now(); });
    this.phase = 'new'; // 'new' -> 'lobby' -> 'playing' -> 'closed'
    this.seatCount = 0; this.tableKind = 'steady'; this.difficulty = 'standard';
    this.seats = []; // index -> {token,name,connected} for a human seat, or null
    this.seatAvatar = []; // index -> companion avatar id for an AI-filled seat, or null
    this.tokenSeat = new Map();
    this.ownerToken = null;
    this.table = null;
    this.handsPlayed = 0; // feeds HearthTables.blinds(); online rooms never "close an evening"
    this.deadlineAt = null;
    this.handEndedAt = null;
    this.readySeats = new Set();
  }

  Room.prototype.exists = function () { return this.phase !== 'new'; };

  Room.prototype._seatFor = function (token) {
    var i = this.tokenSeat.get(token);
    return i === undefined ? null : i;
  };

  Room.prototype._assignCompanions = function () {
    this.seatAvatar = this.seats.map(function (seat, i) {
      return seat ? null : FALLBACK_COMPANIONS[i % FALLBACK_COMPANIONS.length].avatar;
    });
  };

  Room.prototype._names = function () {
    var self = this;
    return this.seats.map(function (seat, i) {
      return seat ? seat.name : FALLBACK_COMPANIONS[i % FALLBACK_COMPANIONS.length].name;
    });
  };

  // names(), like a snapshot, is only ever meaningful in one viewer's local
  // numbering - the client indexes it by table.players[i]/event.playerId,
  // both of which are already rotated by the time they reach it.
  Room.prototype._rotatedNames = function (viewerSeat) {
    var names = this._names(), seatCount = this.seatCount;
    var rotated = new Array(seatCount);
    for (var server = 0; server < seatCount; server++) {
      var local = viewerSeat === null || viewerSeat === undefined ? server : ((server - viewerSeat) % seatCount + seatCount) % seatCount;
      rotated[local] = names[server];
    }
    return rotated;
  };

  // The one place a snapshot is stitched with room-level (not poker.js-level)
  // display info - who's connected, and which companion sprite draws this
  // seat (an AI seat's assigned fallback, or a human seat's own chosen
  // avatar, if any) - after HearthRoomView has already done the only part
  // that matters for privacy.
  Room.prototype._decorate = function (snapshot, viewerSeat) {
    var self = this;
    snapshot.players.forEach(function (p, local) {
      var server = viewerSeat === null || viewerSeat === undefined ? local : (local + viewerSeat) % self.seatCount;
      var seat = self.seats[server];
      p.avatar = seat ? (seat.avatar || null) : self.seatAvatar[server];
      p.connected = seat ? !!seat.connected : true;
    });
    return snapshot;
  };

  Room.prototype._viewMessageFor = function (seat, fromEventId) {
    var table = this.table;
    var view = HearthRoomView.viewFor(table, seat);
    var msg = {t: 'events', from: fromEventId,
      events: table.events.slice(fromEventId).map(view.rotateEvent),
      snapshot: this._decorate(view.snapshot, seat), names: this._rotatedNames(seat),
      smallBlind: table.smallBlind, bigBlind: table.bigBlind, startingStack: table.startingStack};
    if (table.actor === seat) msg.legal = table.legalActions(seat);
    if (this.deadlineAt !== null && table.actor === seat) msg.turnMs = Math.max(0, this.deadlineAt - this.now());
    return msg;
  };

  Room.prototype._broadcastFrom = function (fromEventId) {
    var out = [];
    for (var seat = 0; seat < this.seatCount; seat++) {
      if (!this.seats[seat]) continue; // no one occupies this seat to send to
      out.push({to: seat, msg: this._viewMessageFor(seat, fromEventId)});
    }
    return out;
  };

  Room.prototype._lobbyMessage = function () {
    var self = this;
    return {t: 'lobby', owner: this.ownerToken, config: {seatCount: this.seatCount, tableKind: this.tableKind, difficulty: this.difficulty},
      seats: this.seats.map(function (seat, i) {
        return seat ? {seat: i, name: seat.name, connected: seat.connected, kind: 'human'} : {seat: i, name: FALLBACK_COMPANIONS[i % FALLBACK_COMPANIONS.length].name, kind: 'ai'};
      })};
  };

  Room.prototype._broadcastLobby = function (exceptSeat) {
    var out = [], msg = this._lobbyMessage();
    for (var seat = 0; seat < this.seatCount; seat++) if (this.seats[seat] && seat !== exceptSeat) out.push({to: seat, msg: msg});
    return out;
  };

  Room.prototype._armTurnClock = function (now) {
    var actor = this.table && this.table.actor;
    if (this.table && this.table.result) { this.handEndedAt = now; this.deadlineAt = null; return; }
    if (actor === null || actor === undefined || !this.table.humanSeats.has(actor)) { this.deadlineAt = null; return; }
    var seat = this.seats[actor];
    this.deadlineAt = now + (seat && seat.connected ? TURN_MS_CONNECTED : TURN_MS_DISCONNECTED);
  };

  // First message ever sent to a brand-new room: config comes from whoever
  // creates it, and they take seat 0.
  Room.prototype.create = function (name, cfg, now, avatar) {
    if (this.phase !== 'new') return {ok: false, error: 'already-created'};
    var conf = sanitizeConfig(cfg, {seatCount: 4});
    this.seatCount = conf.seatCount; this.tableKind = conf.tableKind; this.difficulty = conf.difficulty;
    this.seats = new Array(this.seatCount).fill(null);
    var token = randomToken(this.random);
    this.seats[0] = {token: token, name: sanitizeName(name), connected: true, avatar: sanitizeAvatar(avatar)};
    this.tokenSeat.set(token, 0);
    this.ownerToken = token;
    this.phase = 'lobby';
    this._assignCompanions();
    return {ok: true, seat: 0, token: token, out: [{to: 0, msg: this._lobbyMessage()}]};
  };

  // A later hello: either a brand-new join (no token yet) or a reconnect
  // (token matches a seat this room already knows).
  Room.prototype.hello = function (token, name, now, avatar) {
    if (this.phase === 'new') return {ok: false, error: 'no-such-room'};
    if (token && this.tokenSeat.has(token)) {
      var seat = this._seatFor(token);
      this.seats[seat].connected = true;
      if (this.table && this.table.actor === seat) this._armTurnClock(now);
      var out = this._broadcastLobby(seat);
      out.push({to: seat, msg: this.phase === 'playing' ? this._viewMessageFor(seat, 0) : this._lobbyMessage()});
      return {ok: true, seat: seat, token: token, out: out};
    }
    if (this.phase !== 'lobby') return {ok: false, error: 'room-already-started'};
    var free = this.seats.indexOf(null);
    if (free < 0) return {ok: false, error: 'room-full'};
    var newToken = randomToken(this.random);
    this.seats[free] = {token: newToken, name: sanitizeName(name), connected: true, avatar: sanitizeAvatar(avatar)};
    this.tokenSeat.set(newToken, free);
    this._assignCompanions();
    var joinOut = this._broadcastLobby(free);
    joinOut.push({to: free, msg: this._lobbyMessage()});
    return {ok: true, seat: free, token: newToken, out: joinOut};
  };

  Room.prototype.configure = function (token, cfg, now) {
    if (token !== this.ownerToken) return {ok: false, error: 'owner-only'};
    if (this.phase !== 'lobby') return {ok: false, error: 'already-started'};
    var occupied = this.seats.filter(Boolean).length;
    var conf = sanitizeConfig(cfg, this);
    if (conf.seatCount < occupied) return {ok: false, error: 'seats-in-use'};
    if (conf.seatCount !== this.seatCount) {
      var grown = this.seats.slice(0, conf.seatCount);
      while (grown.length < conf.seatCount) grown.push(null);
      this.seats = grown;
    }
    this.seatCount = conf.seatCount; this.tableKind = conf.tableKind; this.difficulty = conf.difficulty;
    this._assignCompanions();
    return {ok: true, out: this._broadcastLobby(null)};
  };

  Room.prototype.start = function (token, now) {
    if (token !== this.ownerToken) return {ok: false, error: 'owner-only'};
    if (this.phase !== 'lobby') return {ok: false, error: 'already-started'};
    var humanSeats = new Set();
    for (var i = 0; i < this.seatCount; i++) if (this.seats[i]) humanSeats.add(i);
    var blinds = HearthTables.blinds(this.tableKind, this.handsPlayed);
    this.table = new Poker.Table({names: this._names(), seatCount: this.seatCount, startingStack: STARTING_STACK,
      smallBlind: blinds.small, bigBlind: blinds.big, difficulty: this.difficulty, humanSeats: humanSeats, random: this.random});
    this.phase = 'playing';
    this.table.newHand();
    driveAI(this.table);
    this._armTurnClock(now);
    return {ok: true, out: this._broadcastFrom(0)};
  };

  Room.prototype.act = function (token, msg, now) {
    var seat = this._seatFor(token);
    if (seat === null) return {ok: false, error: 'unknown-token'};
    if (this.phase !== 'playing') return {ok: false, error: 'not-playing'};
    var table = this.table;
    if (msg.handNumber !== table.handNumber) return {ok: false, error: 'stale-action'};
    if (seat !== table.actor) return {ok: false, error: 'not-your-turn'};
    // events.length, not eventId: newHand() clears the events array but
    // never resets the ever-increasing eventId counter, so eventId is not a
    // valid index into the (short, per-hand) events array from hand 2 on.
    var fromEvent = table.events.length;
    try { table.act(seat, msg.action, msg.amount); }
    catch (err) { return {ok: false, error: 'illegal-action', message: err.message}; }
    driveAI(table);
    this._armTurnClock(now);
    return {ok: true, out: this._broadcastFrom(fromEvent)};
  };

  Room.prototype._maybeDealNext = function (now) {
    if (!this.table || !this.table.result) return [];
    var connectedHumans = this.seats.filter(function (s) { return s && s.connected; });
    var allReady = connectedHumans.length > 0 && connectedHumans.every(function (s) { return this.readySeats.has(this.tokenSeat.get(s.token)); }, this);
    var timedOut = this.handEndedAt !== null && now - this.handEndedAt >= BETWEEN_HANDS_MS;
    if (!allReady && !timedOut) return [];
    this.readySeats.clear();
    this.handsPlayed++;
    var blinds = HearthTables.blinds(this.tableKind, this.handsPlayed);
    this.table.smallBlind = blinds.small; this.table.bigBlind = blinds.big;
    // Online has no buy-in economy to fall back on the way single-player's
    // own newHand() does (it rebuys a busted seat before ever calling this) -
    // if fewer than two seats still hold chips, newHand() correctly refuses
    // and sets table.gameOver, but previously that refusal went completely
    // unhandled here: the same already-shown hand got silently rebroadcast
    // and readySeats cleared again, so "Ready for the next hand" looked
    // clickable forever without anything ever actually happening.
    if (!this.table.newHand()) return this._broadcastFrom(this.table.events.length);
    driveAI(this.table);
    this._armTurnClock(now);
    return this._broadcastFrom(0);
  };

  Room.prototype.next = function (token, now) {
    var seat = this._seatFor(token);
    if (seat === null) return {ok: false, error: 'unknown-token'};
    if (this.phase !== 'playing' || !this.table.result) return {ok: false, error: 'hand-in-progress'};
    if (this.table.gameOver) return {ok: false, error: 'game-over'};
    this.readySeats.add(seat);
    return {ok: true, out: this._maybeDealNext(now)};
  };

  // The client reconnects entirely through hello() (a fresh socket has no
  // context until it identifies itself), so there is no separate "connected"
  // event - only this one, for the socket actually closing.
  Room.prototype.leave = function (token, now) { return this.disconnected(token, now); };

  Room.prototype.disconnected = function (token, now) {
    var seat = this._seatFor(token);
    if (seat === null) return {ok: false, error: 'unknown-token'};
    this.seats[seat].connected = false;
    if (this.table && this.table.actor === seat) this._armTurnClock(now);
    return {ok: true, out: this._broadcastLobby(null)};
  };

  Room.prototype.allDisconnected = function () {
    return this.seats.every(function (s) { return !s || !s.connected; });
  };

  Room.prototype.tick = function (now) {
    if (this.phase !== 'playing' || !this.table) return [];
    if (this.table.result) return this._maybeDealNext(now);
    if (this.deadlineAt !== null && now >= this.deadlineAt) {
      var actor = this.table.actor, legal = this.table.legalActions(actor), fromEvent = this.table.events.length;
      try { this.table.act(actor, legal.check ? 'check' : 'fold'); } catch (e) { /* the seat's own legalActions just computed this; should never throw */ }
      driveAI(this.table);
      this._armTurnClock(now);
      return this._broadcastFrom(fromEvent);
    }
    return [];
  };

  // A room's private, trusted persistence format - for the Durable Object's
  // own storage only, never sent to a client (it necessarily carries the
  // live deck and every hole card, exactly like a single-player save).
  // Written at hand boundaries so an unexpected restart loses at most the
  // current hand. HearthSession.pack/unpack already validate and round-trip
  // a Table; the one thing they don't know about is humanSeats (single-
  // player never needs it), so that's reattached here from this room's own
  // seat list, which IS part of this format.
  // HearthSession.pack/unpack validate a "ui" object describing how far a
  // paused local animation has caught up to the true table state. The
  // server has no animation to pause partway through - it always acts
  // instantly - so this ui is simply "fully caught up", satisfying that
  // validation without claiming anything the server doesn't know.
  function fullyCaughtUpUI(table) {
    return {eventIndex: table.events.length, visibleBoard: table.board.map(function (c) { return Object.assign({}, c); }),
      visibleSeats: table.players.map(function (p) { return {stack: p.stack, bet: p.bet, folded: p.folded, allIn: p.allIn}; }),
      visiblePot: table.pot, visibleStreet: table.street, revealed: !!table.result};
  }

  Room.prototype.serialize = function () {
    return {
      phase: this.phase, seatCount: this.seatCount, tableKind: this.tableKind, difficulty: this.difficulty,
      seats: this.seats.map(function (s) { return s ? {token: s.token, name: s.name, avatar: s.avatar} : null; }),
      seatAvatar: this.seatAvatar, ownerToken: this.ownerToken, handsPlayed: this.handsPlayed,
      tablePack: this.table ? HearthSession.pack(this.table, fullyCaughtUpUI(this.table)) : null
    };
  };

  Room.fromSerialized = function (data, options) {
    var room = new Room(options);
    room.phase = data.phase; room.seatCount = data.seatCount; room.tableKind = data.tableKind; room.difficulty = data.difficulty;
    // Every seat starts marked disconnected: a fresh process has no sockets
    // yet, and each seat's own next hello() will mark it connected again.
    room.seats = data.seats.map(function (s) { return s ? {token: s.token, name: s.name, connected: false, avatar: s.avatar || null} : null; });
    room.seatAvatar = data.seatAvatar; room.ownerToken = data.ownerToken; room.handsPlayed = data.handsPlayed;
    room.seats.forEach(function (s, i) { if (s) room.tokenSeat.set(s.token, i); });
    if (data.tablePack) {
      var table = HearthSession.unpack(data.tablePack).table;
      var humanSeats = new Set(); room.seats.forEach(function (s, i) { if (s) humanSeats.add(i); });
      table.humanSeats = humanSeats;
      room.table = table;
      room._armTurnClock(options && options.now ? options.now() : Date.now());
    }
    return room;
  };

  return {Room: Room, TURN_MS_CONNECTED: TURN_MS_CONNECTED, TURN_MS_DISCONNECTED: TURN_MS_DISCONNECTED,
    BETWEEN_HANDS_MS: BETWEEN_HANDS_MS, ROOM_EXPIRE_MS: ROOM_EXPIRE_MS};
});
