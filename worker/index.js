/* The only Cloudflare-specific file in this project. Everything that
 * actually plays the game lives in room.js (pure, Node-testable); this file
 * just turns real WebSocket traffic into calls on a Room and pumps its
 * outbound instructions back out to the right sockets. If you're looking for
 * the game logic or the trust boundary, they are not here.
 *
 * Deliberately NOT checked here: the request's Origin. The Windows build
 * loads the game from a file:// page, which sends "Origin: null" on the
 * WebSocket handshake - an allowlist would lock real players out. Access to
 * a room is the room code plus a per-player token, never the origin a
 * connection came from.
 *
 * One Durable Object instance per room (bound as ROOMS in wrangler.jsonc).
 * v1 uses the standard, non-hibernating WebSocket API: the live Table stays
 * in memory for as long as this instance does, and is written to storage at
 * hand boundaries only, so an eviction between hands loses nothing and one
 * mid-hand loses at most the current hand.
 */
'use strict';
var RoomModule = require('./room.js');
var GameRoom = RoomModule.Room;
var ROOM_EXPIRE_MS = RoomModule.ROOM_EXPIRE_MS;
var Code = require('../game/code.js');

var MAX_MESSAGE_CHARS = 4096;
var MAX_MESSAGES_PER_SECOND = 20;
var MAX_SOCKETS_PER_ROOM = 8;
var TICK_INTERVAL_MS = 3000;

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.game = null;
    this.sockets = new Map(); // seat number -> live WebSocket
    this.tokenBySocket = new WeakMap();
    this.rateBySocket = new WeakMap();
    var self = this;
    ctx.blockConcurrencyWhile(async function () {
      var saved = await ctx.storage.get('room');
      var options = {random: Math.random, now: function () { return Date.now(); }};
      self.game = saved ? GameRoom.fromSerialized(saved, options) : new GameRoom(options);
    });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Hearthside room', {status: 200});
    if (this.sockets.size >= MAX_SOCKETS_PER_ROOM) return new Response('room is full', {status: 403});
    var pair = new WebSocketPair(), client = pair[0], server = pair[1];
    server.accept();
    this._wire(server);
    return new Response(null, {status: 101, webSocket: client});
  }

  _wire(ws) {
    var self = this;
    ws.addEventListener('message', function (event) { self._onMessage(ws, event.data).catch(function (err) { console.error('room message error:', err && err.stack || err); }); });
    ws.addEventListener('close', function () { self._onClose(ws); });
    ws.addEventListener('error', function () { self._onClose(ws); });
  }

  _send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (err) { /* socket already gone */ } }

  _deliver(out) {
    var self = this;
    (out || []).forEach(function (item) {
      var socket = self.sockets.get(item.to);
      if (socket) self._send(socket, item.msg);
    });
  }

  _withinRate(ws) {
    var now = Date.now(), bucket = this.rateBySocket.get(ws);
    if (!bucket || now - bucket.windowStart > 1000) { bucket = {count: 0, windowStart: now}; this.rateBySocket.set(ws, bucket); }
    bucket.count++;
    return bucket.count <= MAX_MESSAGES_PER_SECOND;
  }

  async _onMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_CHARS || !this._withinRate(ws)) return;
    var msg; try { msg = JSON.parse(raw); } catch (err) { return; }
    if (!msg || typeof msg.t !== 'string') return;

    var now = Date.now(), room = this.game, result;
    switch (msg.t) {
      case 'create': result = room.create(msg.name, msg.cfg, now, msg.avatar); break;
      case 'hello': result = room.exists() ? room.hello(msg.token, msg.name, now, msg.avatar) : {ok: false, error: 'no-such-room'}; break;
      case 'configure': result = room.configure(msg.token, msg.cfg, now); break;
      case 'start': result = room.start(msg.token, now); break;
      case 'act': result = room.act(msg.token, msg, now); break;
      case 'next': result = room.next(msg.token, now); break;
      case 'leave': result = room.leave(msg.token, now); break;
      default: return;
    }
    if (!result) return;
    if (!result.ok) { this._send(ws, {t: 'error', error: result.error, message: result.message}); return; }

    if (result.seat !== undefined) {
      // Only hello/create ever return a fresh seat assignment - this is the
      // one moment a socket becomes "this seat" for every later message.
      this.sockets.set(result.seat, ws);
      this.tokenBySocket.set(ws, msg.token || result.token);
      this._send(ws, {t: 'welcome', seat: result.seat, token: result.token, owner: (msg.token || result.token) === room.ownerToken});
      await this._ensureAlarm();
    }
    this._deliver(result.out);
    // Persist after anything that actually changed the room, not just the
    // in-hand messages - a create/hello/configure that never gets persisted
    // is invisible to a fresh instance if this one is evicted before the
    // first hand starts, which turns into a confusing "owner-only" rejection
    // for a room its own creator just made.
    if (room.exists()) await this._persist();
  }

  _onClose(ws) {
    var token = this.tokenBySocket.get(ws);
    for (const [seat, socket] of this.sockets) if (socket === ws) this.sockets.delete(seat);
    if (!token) return;
    var result = this.game.disconnected(token, Date.now());
    if (result.ok) this._deliver(result.out);
    if (this.game.allDisconnected()) {
      var self = this;
      this.ctx.storage.setAlarm(Date.now() + ROOM_EXPIRE_MS).catch(function (err) { console.error('setAlarm failed:', err); });
    }
  }

  async _ensureAlarm() {
    var current = await this.ctx.storage.getAlarm();
    if (current === null) await this.ctx.storage.setAlarm(Date.now() + TICK_INTERVAL_MS);
  }

  async _persist() { await this.ctx.storage.put('room', this.game.serialize()); }

  // Fires on the turn-clock/between-hands schedule while anyone is
  // connected, and once more, ten minutes after the last socket closed, to
  // actually delete an abandoned room's storage.
  async alarm() {
    if (this.game.allDisconnected()) {
      if (this.game.exists()) await this.ctx.storage.deleteAll();
      return;
    }
    var out = this.game.tick(Date.now());
    this._deliver(out);
    if (out.length) await this._persist();
    await this.ctx.storage.setAlarm(Date.now() + TICK_INTERVAL_MS);
  }
}

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var code = Code.normalize(url.searchParams.get('room'));
    if (!code) return new Response('missing or invalid room code', {status: 400});
    var stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(request);
  }
};
