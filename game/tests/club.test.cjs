'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Club = require('../club.js');

test('a fresh club starts empty and an evening is a fixed number of hands', () => {
  const state = Club.fresh();
  assert.deepEqual(state, {version: 1, fund: 0, owned: [], evenings: 0, bestTakeHome: 0});
  assert(Number.isInteger(Club.EVENING_HANDS) && Club.EVENING_HANDS > 0);
});

test('winnings are what you finish above your stack, less a part-cost per rebuy', () => {
  assert.equal(Club.takeHome(740, 1, 500), 240);
  assert.equal(Club.takeHome(500, 1, 500), 0);
  assert.equal(Club.takeHome(120, 1, 500), 0, 'a losing evening simply earns nothing');
  assert.equal(Club.takeHome(900, 2, 500), 150, 'a rebuy dents the night without erasing it');
  assert.equal(Club.takeHome(1300, 2, 500), 550);
  assert.equal(Club.takeHome(600, 2, 500), 0, 'never negative, however many rebuys');
});

test('every evening adds the kitty, so the room always creeps forward', () => {
  const blank = Club.eveningTotal(200, 1, 500);
  assert.equal(blank.winnings, 0);
  assert.equal(blank.total, Club.KITTY, 'a losing night still puts the kitty in');
  assert(blank.total > 0, 'no evening is ever worth literally nothing');

  const good = Club.eveningTotal(800, 1, 500);
  assert.equal(good.winnings, 300);
  assert.equal(good.total, 300 + Club.KITTY);
  assert(good.total > blank.total * 3, 'a good night is worth meaningfully more');
});

test('finishing an evening adds to the fund and records the best night', () => {
  let state = Club.endEvening(Club.fresh(), 240);
  assert.equal(state.fund, 240);
  assert.equal(state.evenings, 1);
  assert.equal(state.bestTakeHome, 240);
  state = Club.endEvening(state, 90);
  assert.equal(state.fund, 330);
  assert.equal(state.evenings, 2);
  assert.equal(state.bestTakeHome, 240, 'a quieter night does not lower the best');
});

test('buying is pure, charges once, and refuses what the fund cannot cover', () => {
  const item = Club.catalogue[0];
  const rich = Club.endEvening(Club.fresh(), item.cost + 5);
  const bought = Club.buy(rich, item.id);
  assert(bought.ok);
  assert.equal(bought.state.fund, 5);
  assert(Club.owns(bought.state, item.id));
  assert.equal(rich.fund, item.cost + 5, 'the original state is untouched');
  assert(!Club.owns(rich, item.id));

  const again = Club.buy(bought.state, item.id);
  assert(!again.ok);
  assert.equal(again.state.fund, 5, 'a repeat purchase costs nothing');

  const broke = Club.buy(Club.fresh(), item.id);
  assert(!broke.ok);
  assert.equal(broke.state.fund, 0);

  const nonsense = Club.buy(rich, 'a-pony');
  assert(!nonsense.ok);
  assert.equal(nonsense.state.fund, item.cost + 5);
});

test('corrupt, hostile or hand-edited saves fall back to something playable', () => {
  assert.deepEqual(Club.restore(null), Club.fresh());
  assert.deepEqual(Club.restore({version: 99, fund: 500}), Club.fresh());
  assert.deepEqual(Club.restore('nope'), Club.fresh());
  const messy = Club.restore({version: 1, fund: -50, evenings: 1.5, bestTakeHome: NaN,
    owned: ['hearth', 'hearth', 'not-a-thing', 42, null]});
  assert.equal(messy.fund, 0);
  assert.equal(messy.evenings, 0);
  assert.equal(messy.bestTakeHome, 0);
  assert.deepEqual(messy.owned, ['hearth'], 'unknown and duplicate comforts are dropped');
});

test('comforts translate into light changes only for what has been bought', () => {
  const empty = Club.lights(Club.fresh());
  assert.deepEqual(empty.extra, []);
  assert.deepEqual(empty.boosts, {});

  let state = Club.fresh();
  state.owned = ['hearth', 'near-candle'];
  const lit = Club.lights(state);
  assert.equal(lit.extra.length, 1);
  assert.equal(lit.extra[0].id, 'club-near-candle');
  assert(lit.boosts.fireplace.strength > 1 && lit.boosts.fireplace.radius > 1);
  assert.equal(lit.boosts['mantel-candle-tall'], undefined);
});

test('every catalogue entry is atmosphere with a cost and a visible effect', () => {
  const ids = new Set();
  for (const item of Club.catalogue) {
    assert(typeof item.id === 'string' && !ids.has(item.id), 'ids are unique');
    ids.add(item.id);
    assert(typeof item.name === 'string' && item.name.length);
    assert(typeof item.note === 'string' && item.note.length);
    assert(Number.isInteger(item.cost) && item.cost > 0);
    assert(item.boosts || item.extra || item.liveliness, 'a comfort must actually change the room');
  }
});

test('the cushion makes the cat livelier, and only once bought', () => {
  assert.equal(Club.catLiveliness(Club.fresh()), 1);
  const state = Club.fresh();
  state.owned = ['cushion'];
  assert(Club.catLiveliness(state) > 1);
});

test('the ledger reads the club back without storing anything new', () => {
  let state = Club.fresh();
  assert.deepEqual(Club.ledger(state), {evenings: 0, bestNight: 0, comforts: 0, comfortsTotal: Club.catalogue.length});
  state = Club.endEvening(state, 150);
  state = Club.endEvening(state, 90);
  state = Club.buy(state, 'mantel').state;
  const ledger = Club.ledger(state);
  assert.equal(ledger.evenings, 2);
  assert.equal(ledger.bestNight, 150, 'a quieter second night does not lower the best');
  assert.equal(ledger.comforts, 1);
  assert.deepEqual(Object.keys(state).sort(), ['bestTakeHome', 'evenings', 'fund', 'owned', 'version'], 'the saved shape is exactly what it was');
});
