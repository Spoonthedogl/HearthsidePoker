'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Room, TURN_MS_CONNECTED, TURN_MS_DISCONNECTED, BETWEEN_HANDS_MS} = require('../room.js');
const Poker = require('../../game/poker.js');

const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// Everything a message's recipient is entitled to see a card from. `to` in
// an {to,msg} pair is a SERVER seat - only a routing address for index.js to
// resolve to a socket - never a local index: rotation means local seat 0 is
// always the recipient's own hand, regardless of which server seat "to"
// names, so that (plus a genuine showdown reveal) is what "allowed" means.
function cardKeysVisibleTo(msg) {
  const keys = new Set();
  const add = (c) => { if (c) keys.add(c.rank + c.suit); };
  (msg.snapshot.players[0].hole || []).forEach(add);
  if (msg.snapshot.result && msg.snapshot.result.showdown) msg.snapshot.result.showdown.forEach((s) => (s.hole || []).forEach(add));
  return keys;
}
function everyCardKeyIn(msg) {
  const keys = new Set();
  const add = (c) => { if (c) keys.add(c.rank + c.suit); };
  msg.snapshot.players.forEach((p) => (p.hole || []).forEach(add));
  if (msg.snapshot.result && msg.snapshot.result.showdown) msg.snapshot.result.showdown.forEach((s) => (s.hole || []).forEach(add));
  return keys;
}

function outFor(res, seat) { return res.out.filter((o) => o.to === seat).map((o) => o.msg); }

test('create assigns the creator seat 0 and ownership; a room only creates once', () => {
  const room = new Room({random: seeded(1)});
  const created = room.create('Alice', {seatCount: 3}, 0);
  assert.equal(created.ok, true);
  assert.equal(created.seat, 0);
  assert.equal(room.ownerToken, created.token);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.create('Bob', {}, 0).ok, false);
});

test('hello joins the next free seat, or reconnects an existing token to its own seat', () => {
  const room = new Room({random: seeded(2)});
  const owner = room.create('Alice', {seatCount: 3}, 0);
  const bob = room.hello(null, 'Bob', 0);
  assert.equal(bob.ok, true); assert.equal(bob.seat, 1);
  const reconnect = room.hello(owner.token, 'Alice again', 0);
  assert.equal(reconnect.ok, true); assert.equal(reconnect.seat, 0);
  const carol = room.hello(null, 'Carol', 0);
  assert.equal(carol.seat, 2);
  const room4 = room.hello(null, 'Dave', 0);
  assert.equal(room4.ok, false); assert.equal(room4.error, 'room-full');
});

test('a valid chosen avatar is reported for a human seat; an unknown one is dropped, not trusted verbatim', () => {
  const room = new Room({random: seeded(2.5)});
  const owner = room.create('Alice', {seatCount: 3}, 0, 'clipper');
  const bob = room.hello(null, 'Bob', 0, 'not-a-real-companion');
  const carol = room.hello(null, 'Carol', 0); // no avatar chosen at all
  const started = room.start(owner.token, 0);
  const view = outFor(started, 0)[0]; // Alice's own view: seats 1/2 are Bob/Carol, locally 1/2
  assert.equal(view.snapshot.players[1].avatar, null, 'an invalid avatar must not reach the client as-is');
  assert.equal(view.snapshot.players[2].avatar, null, 'no chosen avatar is also reported as null, not a made-up one');
  const bobView = outFor(started, 1)[0]; // Bob is viewer 1: Alice (server seat 0) is local seat 2 for him
  assert.equal(bobView.snapshot.players[2].avatar, 'clipper', 'a valid chosen avatar is reported to every other seat too');
});

test('a room name is capped at 12 characters, matching the client-side limit', () => {
  const room = new Room({random: seeded(2.6)});
  const owner = room.create('A Rather Long Name Indeed', {seatCount: 2}, 0);
  assert.equal(owner.ok, true);
  const lobby = room._lobbyMessage();
  assert.equal(lobby.seats[0].name.length <= 12, true);
  assert.equal(lobby.seats[0].name, 'A Rather Lon');
});

test('hello refuses a brand-new join once the room has started', () => {
  const room = new Room({random: seeded(3)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  room.hello(null, 'Bob', 0);
  room.start(owner.token, 0);
  const late = room.hello(null, 'Eve', 0);
  assert.equal(late.ok, false); assert.equal(late.error, 'room-already-started');
});

test('only the owner may configure or start; configure refuses shrinking below occupied seats', () => {
  const room = new Room({random: seeded(4)});
  const owner = room.create('Alice', {seatCount: 4}, 0);
  const bob = room.hello(null, 'Bob', 0);
  room.hello(null, 'Carol', 0);
  assert.equal(room.configure(bob.token, {seatCount: 3}, 0).ok, false);
  assert.equal(room.configure('nonsense-token', {seatCount: 3}, 0).error, 'owner-only');
  assert.equal(room.configure(owner.token, {seatCount: 2}, 0).ok, false); // 3 seats occupied
  assert.equal(room.configure(owner.token, {seatCount: 5}, 0).ok, true);
  assert.equal(room.start(bob.token, 0).ok, false);
});

test('start deals immediately and fills every unclaimed seat with AI', () => {
  const room = new Room({random: seeded(5)});
  const owner = room.create('Alice', {seatCount: 4}, 0);
  const started = room.start(owner.token, 0);
  assert.equal(started.ok, true);
  assert.equal(room.phase, 'playing');
  assert.equal(room.table.handNumber, 1);
  assert.deepEqual([...room.table.humanSeats], [0]);
});

test('act rejects a wrong-seat token, an unknown token, a stale hand number, and an illegal action', () => {
  const room = new Room({random: seeded(6)});
  const owner = room.create('Alice', {seatCount: 4}, 0);
  const bob = room.hello(null, 'Bob', 0);
  room.start(owner.token, 0);
  const actorSeat = room.table.actor; // always 0 or 1: the only two human seats
  const actorToken = actorSeat === 0 ? owner.token : bob.token;
  const otherToken = actorSeat === 0 ? bob.token : owner.token;
  const before = JSON.stringify(room.table.snapshot({revealAll: true}));
  assert.equal(room.act(otherToken, {handNumber: room.table.handNumber, action: 'fold'}, 0).ok, false);
  assert.equal(room.act('not-a-real-token', {handNumber: room.table.handNumber, action: 'fold'}, 0).ok, false);
  assert.equal(room.act(actorToken, {handNumber: room.table.handNumber + 1, action: 'fold'}, 0).ok, false);
  assert.equal(room.act(actorToken, {handNumber: room.table.handNumber, action: 'nonsense'}, 0).ok, false);
  assert.equal(JSON.stringify(room.table.snapshot({revealAll: true})), before);
});

test('the outbound message carries blinds/starting stack, and names rotated to match the viewer\'s own numbering', () => {
  const room = new Room({random: seeded(40)});
  const owner = room.create('Alice', {seatCount: 3}, 0);
  const bob = room.hello(null, 'Bob', 0);
  const started = room.start(owner.token, 0);
  for (const {to, msg} of started.out) {
    assert.equal(msg.smallBlind, room.table.smallBlind);
    assert.equal(msg.bigBlind, room.table.bigBlind);
    assert.equal(msg.startingStack, room.table.startingStack);
    // seat `to`'s own name must appear at local index 0, matching their own hole cards
    const expectedOwnName = to === 0 ? 'Alice' : to === 1 ? 'Bob' : room._names()[to];
    assert.equal(msg.names[0], expectedOwnName);
    assert.equal(msg.names.length, 3);
  }
});

test('a legal action from the acting human advances the table and broadcasts to every seated player', () => {
  const room = new Room({random: seeded(7)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  const bob = room.hello(null, 'Bob', 0);
  room.start(owner.token, 0);
  const actorToken = room.table.actor === 0 ? owner.token : bob.token;
  const legal = room.table.legalActions(room.table.actor);
  const res = room.act(actorToken, {handNumber: 1, action: legal.check ? 'check' : 'call'}, 0);
  assert.equal(res.ok, true);
  const seats = new Set(res.out.map((o) => o.to));
  assert.deepEqual(seats, new Set([0, 1]));
});

test('turn clock expiry auto-checks or folds, never leaving the table stuck', () => {
  const room = new Room({random: seeded(8)});
  const owner = room.create('Alice', {seatCount: 3}, 0);
  room.hello(null, 'Bob', 0);
  room.hello(null, 'Carol', 0);
  room.start(owner.token, 0);
  let now = 0, guard = 0;
  while (!room.table.result && guard++ < 200) {
    now += TURN_MS_CONNECTED + 1;
    room.tick(now);
  }
  assert(room.table.result, 'hand must resolve on its own from turn-clock timeouts alone');
});

test('a disconnected seat gets the short grace period, not the full one', () => {
  const room = new Room({random: seeded(9)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  const bob = room.hello(null, 'Bob', 0);
  room.start(owner.token, 0);
  const humanToken = room.table.actor === 0 ? owner.token : bob.token;
  room.disconnected(humanToken, 0);
  assert.equal(room.deadlineAt, TURN_MS_DISCONNECTED);
});

test('reconnecting re-arms the full turn clock and resumes the same seat', () => {
  const room = new Room({random: seeded(10)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  const bob = room.hello(null, 'Bob', 0);
  room.start(owner.token, 0);
  const humanToken = room.table.actor === 0 ? owner.token : bob.token;
  room.disconnected(humanToken, 1000);
  const back = room.hello(humanToken, 'Alice', 2000);
  assert.equal(back.ok, true);
  assert.equal(room.deadlineAt, 2000 + TURN_MS_CONNECTED);
});

test('next only deals once every connected human is ready, or the between-hands grace elapses', () => {
  const room = new Room({random: seeded(11)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  const bob = room.hello(null, 'Bob', 0);
  room.start(owner.token, 0);
  while (!room.table.result) {
    const actorToken = room.table.actor === 0 ? owner.token : bob.token;
    const legal = room.table.legalActions(room.table.actor);
    room.act(actorToken, {handNumber: room.table.handNumber, action: legal.check ? 'check' : legal.call ? 'call' : 'fold'}, 0);
  }
  const handAfterFirst = room.table.handNumber;
  const onlyOne = room.next(owner.token, 100);
  assert.equal(room.table.handNumber, handAfterFirst, 'must not deal until every connected human is ready');
  room.next(bob.token, 200);
  assert.equal(room.table.handNumber, handAfterFirst + 1, 'deals the moment the last connected human is ready');
});

test('the between-hands grace period deals even if someone never clicks ready', () => {
  const room = new Room({random: seeded(12)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  const bob = room.hello(null, 'Bob', 0);
  room.start(owner.token, 0);
  while (!room.table.result) {
    const actorToken = room.table.actor === 0 ? owner.token : bob.token;
    const legal = room.table.legalActions(room.table.actor);
    room.act(actorToken, {handNumber: room.table.handNumber, action: legal.check ? 'check' : legal.call ? 'call' : 'fold'}, 0);
  }
  const handAfterFirst = room.table.handNumber;
  room.next(owner.token, 0); // Bob never sends next
  room.tick(BETWEEN_HANDS_MS - 1);
  assert.equal(room.table.handNumber, handAfterFirst);
  room.tick(BETWEEN_HANDS_MS + 1);
  assert.equal(room.table.handNumber, handAfterFirst + 1);
});

test('blinds still progress hand over hand by the chosen table schedule', () => {
  const room = new Room({random: seeded(13)});
  const owner = room.create('Alice', {seatCount: 2, tableKind: 'rising'}, 0);
  room.start(owner.token, 0);
  assert.deepEqual({small: room.table.smallBlind, big: room.table.bigBlind}, {small: 5, big: 10});
  for (let hand = 0; hand < 4; hand++) {
    while (!room.table.result) {
      const legal = room.table.legalActions(room.table.actor);
      room.act(owner.token, {handNumber: room.table.handNumber, action: legal.check ? 'check' : legal.call ? 'call' : 'fold'}, 0);
    }
    room.next(owner.token, 0);
  }
  assert.deepEqual({small: room.table.smallBlind, big: room.table.bigBlind}, {small: 10, big: 20});
});

// The highest-value test: script full sessions with a mix of human and AI
// seats, capture every single outbound payload addressed to every human
// seat, and assert that no payload ever contains a card key that seat is
// not entitled to see - not another seat's hole cards before a genuine
// reveal, and never the deck (which this wire format has no field for at
// all). Runs across many seeds and both a fold-out and a showdown-heavy mix.
test('redaction fuzz: no payload to any seat ever contains a card it is not entitled to see', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const room = new Room({random: seeded(seed)});
    const seatCount = 2 + (seed % 5); // 2..6, mixes human/AI counts
    const humanCount = 1 + (seed % Math.min(seatCount, 4));
    const owner = room.create('Player0', {seatCount, difficulty: ['gentle', 'standard', 'sharp'][seed % 3]}, 0);
    const tokens = [owner.token];
    for (let i = 1; i < humanCount; i++) tokens.push(room.hello(null, 'Player' + i, 0).token);
    const started = room.start(owner.token, seed * 1000);
    const allOut = [...started.out];

    let now = seed * 1000, guard = 0;
    for (let hand = 0; hand < 3 && guard < 500; hand++) {
      while (!room.table.result && guard++ < 500) {
        const actor = room.table.actor;
        if (room.table.humanSeats.has(actor)) {
          const token = tokens[actor];
          const legal = room.table.legalActions(actor);
          const action = legal.check ? 'check' : legal.call && (seed + guard) % 3 !== 0 ? 'call' : legal.fold ? 'fold' : 'allin';
          const res = room.act(token, {handNumber: room.table.handNumber, action}, now);
          if (res.ok) allOut.push(...res.out);
        } else {
          now += 1; allOut.push(...room.tick(now)); // shouldn't normally fire for an AI actor, but harmless
        }
      }
      if (!room.table.result) break;
      for (const token of tokens) { const r = room.next(token, now); allOut.push(...(r.out || [])); }
    }

    // Every message this seed ever produced, grouped by the local seat it
    // was addressed to (the wire format has no notion of "server seat" at
    // all once a message leaves _viewMessageFor, by design).
    for (const {to, msg} of allOut) {
      if (!msg.snapshot) continue;
      const allowed = cardKeysVisibleTo(msg);
      const present = everyCardKeyIn(msg);
      for (const key of present) {
        assert(allowed.has(key), `seed ${seed}: seat ${to} received card ${key} it was not entitled to see`);
      }
      assert.equal(msg.snapshot.deck, undefined, `seed ${seed}: a snapshot must never carry the deck`);
    }
  }
});

test('serialize/fromSerialized survives a mid-hand restart with humanSeats, stacks, and the turn clock intact', () => {
  const room = new Room({random: seeded(30)});
  const owner = room.create('Alice', {seatCount: 3, tableKind: 'rising'}, 0);
  const bob = room.hello(null, 'Bob', 0);
  room.start(owner.token, 1000);
  const actorToken = room.table.actor === 0 ? owner.token : (room.table.actor === 1 ? bob.token : null);
  if (actorToken) room.act(actorToken, {handNumber: 1, action: room.table.legalActions(room.table.actor).check ? 'check' : 'call'}, 1000);

  const saved = JSON.parse(JSON.stringify(room.serialize()));
  const restored = Room.fromSerialized(saved, {random: seeded(31), now: () => 5000});

  assert.equal(restored.phase, 'playing');
  assert.equal(restored.seatCount, 3);
  assert.equal(restored.tableKind, 'rising');
  assert.deepEqual([...restored.table.humanSeats].sort(), [0, 1]);
  assert.equal(restored.table.handNumber, room.table.handNumber);
  assert.deepEqual(restored.table.players.map((p) => p.stack), room.table.players.map((p) => p.stack));
  assert.deepEqual(restored.table.players.map((p) => p.hole), room.table.players.map((p) => p.hole));
  // reconnecting after a restart resolves through the normal hello() path
  const reconnect = restored.hello(owner.token, 'Alice', 5000);
  assert.equal(reconnect.ok, true); assert.equal(reconnect.seat, 0);
  // the game is still fully playable post-restore
  let guard = 0;
  while (!restored.table.result && guard++ < 200) restored.tick(6000 + guard * TURN_MS_CONNECTED);
  assert(restored.table.result, 'a restored room must still be able to finish its hand');
});

test('a room never started (still in the lobby) serializes and restores with no table at all', () => {
  const room = new Room({random: seeded(32)});
  room.create('Alice', {seatCount: 4}, 0);
  room.hello(null, 'Bob', 0);
  const restored = Room.fromSerialized(JSON.parse(JSON.stringify(room.serialize())), {random: seeded(33)});
  assert.equal(restored.phase, 'lobby');
  assert.equal(restored.table, null);
  assert.equal(restored.seats.filter(Boolean).length, 2);
});

test('a showdown genuinely reveals every live hand to every seat, exactly once betting is closed', () => {
  const room = new Room({random: seeded(21)});
  const owner = room.create('Alice', {seatCount: 2}, 0);
  const bob = room.hello(null, 'Bob', 0);
  room.start(owner.token, 0);
  let res;
  while (!room.table.result) {
    const actorToken = room.table.actor === 0 ? owner.token : bob.token;
    const legal = room.table.legalActions(room.table.actor);
    res = room.act(actorToken, {handNumber: room.table.handNumber, action: legal.check ? 'check' : 'call'}, 0);
  }
  if (room.table.result.reason === 'showdown') {
    for (const {to, msg} of res.out) {
      assert.equal(msg.snapshot.result.showdown.length, 2);
      msg.snapshot.result.showdown.forEach((s) => assert.equal(s.hole.length, 2));
    }
  }
});
