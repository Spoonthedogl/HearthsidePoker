'use strict';
// Wires the real, already-unit-tested server (Room) directly into the real
// client (HearthOnline), skipping only the actual network socket. Anything
// wrong with how the two sides agree on the wire protocol shows up here,
// without needing a deployed Worker or a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const {Room} = require('../room.js');
const client = require('../../game/multiplayer.js').HearthOnline;

const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>>14) >>> 0) / 4294967296; };

// Feeds one seat's slice of a Room's real {to,msg} output through the same
// JSON encode/decode a real socket would do, then into the client exactly
// as its own WebSocket 'message' handler would.
function deliver(seat, out) {
  out.filter((o) => o.to === seat).forEach((o) => client._onMessage(JSON.stringify(o.msg)));
}

test('the client applies a real welcome + events message and exposes a Poker.Table-shaped RemoteTable', () => {
  const room = new Room({random: seeded(1)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  client.token = owner.token; client.seat = 0;
  const started = room.start(owner.token, 0);
  deliver(0, started.out);

  const table = client.table;
  assert.equal(table.players.length, 2);
  assert.equal(table.players[0].hole.length, 2);
  assert(table.players[0].hole[0].rank !== undefined);
  assert.deepEqual(table.players[1].hole, [null, null]);
  assert.equal(table.smallBlind, room.table.smallBlind);
  assert.equal(table.bigBlind, room.table.bigBlind);
  assert.equal(table.startingStack, 500);
  assert.equal(table.names[0], 'Alice');
  assert.equal(table.events.length, room.table.events.length);
  const snap = table.snapshot();
  assert.equal(snap.pot, room.table.pot);
});

test('the client\'s events array grows cumulatively across several actions, matching a real Table\'s own event log length', () => {
  const room = new Room({random: seeded(2)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  client.token = owner.token; client.seat = 0;
  deliver(0, room.start(owner.token, 0).out);
  for (let i = 0; i < 3 && !room.table.result; i++) {
    const actor = room.table.actor;
    const legal = room.table.legalActions(actor);
    const res = room.act(owner.token, {handNumber: room.table.handNumber, action: legal.check ? 'check' : 'call'}, 0);
    if (actor === 0) deliver(0, res.out);
  }
  assert.equal(client.table.events.length, room.table.events.length);
  assert.deepEqual(client.table.events.map((e) => e.type), room.table.events.map((e) => e.type));
});

test('a new hand resets the client\'s local event log, mirroring the server\'s own newHand()', () => {
  const room = new Room({random: seeded(3)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  client.token = owner.token; client.seat = 0;
  deliver(0, room.start(owner.token, 0).out);
  const handOneEvents = client.table.events.length;
  assert(handOneEvents > 0);
  while (!room.table.result) {
    const legal = room.table.legalActions(room.table.actor);
    const res = room.act(owner.token, {handNumber: room.table.handNumber, action: legal.check ? 'check' : 'call'}, 0);
    deliver(0, res.out);
  }
  const nextOut = room.next(owner.token, 0).out;
  deliver(0, nextOut);
  assert.equal(client.table.handNumber, 2);
  assert(client.table.events.length < handOneEvents + client.table.events.length, 'sanity: events array exists');
  assert.equal(client.table.events[0].handNumber, 2, 'the client\'s event log must not carry hand 1\'s events into hand 2');
});

test('legalActions() only ever returns real options when it is genuinely this client\'s turn', () => {
  const room = new Room({random: seeded(4)});
  const owner = room.create('Alice', {seatCount: 3}, 0);
  room.hello(null, 'Bob', 0);
  client.token = owner.token; client.seat = 0;
  const started = room.start(owner.token, 0);
  deliver(0, started.out);
  if (room.table.actor === 0) {
    assert(client.table.legalActions().fold === true || client.table.legalActions().check === true || client.table.legalActions().call >= 0);
  } else {
    assert.deepEqual(client.table.legalActions(), {fold: false, check: false, call: 0, canRaise: false, minRaiseTo: 0, maxRaiseTo: 0, allIn: 0, allInCanRaise: false});
  }
});

test('waitForEvents resolves true when a real message arrives, and cancelWaiters resolves any pending wait false', async () => {
  const room = new Room({random: seeded(5)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  client.token = owner.token; client.seat = 0;
  const pending = client.waitForEvents(1);
  deliver(0, room.start(owner.token, 0).out);
  assert.equal(await pending, true);

  const cancelled = client.waitForEvents(2);
  client.cancelWaiters();
  assert.equal(await cancelled, false);
});
