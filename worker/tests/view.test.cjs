'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Poker = require('../../game/poker.js');
const View = require('../view.js');

function seeded(seed) { return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

test('viewFor rotates the acting seat and dealer, and puts the viewer at local seat 0', () => {
  const t = new Poker.Table({random: seeded(5)});
  t.newHand();
  const realActor = t.actor, realDealer = t.dealer;
  for (let viewer = 0; viewer < t.players.length; viewer++) {
    const view = View.viewFor(t, viewer);
    assert.equal(view.snapshot.actor, (realActor - viewer + 4) % 4);
    assert.equal(view.snapshot.dealer, (realDealer - viewer + 4) % 4);
    // the viewer's own hole cards are always readable at local seat 0
    assert.deepEqual(view.snapshot.players[0].hole, t.players[viewer].hole);
    // every other local seat is hidden
    for (let local = 1; local < t.players.length; local++) assert.deepEqual(view.snapshot.players[local].hole, [null, null]);
  }
});

test('rotation preserves clockwise seating order from the viewer outward', () => {
  const t = new Poker.Table({random: seeded(6), seatCount: 5});
  t.newHand();
  for (let viewer = 0; viewer < 5; viewer++) {
    const view = View.viewFor(t, viewer);
    for (let step = 0; step < 5; step++) {
      const local = step, server = (viewer + step) % 5;
      assert.equal(view.snapshot.players[local].stack, t.players[server].stack);
    }
  }
});

test('rotateEvent renumbers playerId and dealer without touching card data', () => {
  const t = new Poker.Table({random: seeded(7)});
  t.newHand();
  t.act(t.actor, t.legalActions().check ? 'check' : 'call');
  const view = View.viewFor(t, 2);
  const rotated = t.events.map(view.rotateEvent);
  rotated.forEach((event, i) => {
    const original = t.events[i];
    if ('playerId' in original) assert.equal(event.playerId, (original.playerId - 2 + 4) % 4);
    if ('dealer' in original) assert.equal(event.dealer, (original.dealer - 2 + 4) % 4);
    if (original.cards) assert.deepEqual(event.cards, original.cards);
  });
});

test('a fold-win result rotates winners/pots without ever adding hole cards', () => {
  const t = new Poker.Table({random: seeded(8)});
  t.newHand();
  const others = [0, 1, 2, 3].filter((id) => id !== t.actor);
  while (t.result === null) {
    const acting = t.actor;
    if (others.length && acting === others[0]) { t.act(acting, 'fold'); others.shift(); }
    else t.act(acting, t.legalActions().check ? 'check' : 'call');
  }
  assert.equal(t.result.reason, 'fold');
  for (let viewer = 0; viewer < 4; viewer++) {
    const view = View.viewFor(t, viewer);
    assert.deepEqual(view.snapshot.result.showdown, []);
    view.snapshot.result.winners.forEach((w) => assert.equal(w.hand, null));
    // winners/pots ids are rotated the same way as everything else
    const rawWinnerIds = t.result.winners.map((w) => w.id);
    const gotWinnerIds = view.snapshot.result.winners.map((w) => w.id);
    assert.deepEqual(gotWinnerIds, rawWinnerIds.map((id) => (id - viewer + 4) % 4));
  }
});

test('spectator (viewer:null) sees no hole cards and the real, unrotated seat numbers', () => {
  const t = new Poker.Table({random: seeded(9)});
  t.newHand();
  const view = View.viewFor(t, null);
  view.snapshot.players.forEach((p, i) => { assert.equal(p.id, i); assert.deepEqual(p.hole, [null, null]); });
  assert.equal(view.snapshot.actor, t.actor);
});
