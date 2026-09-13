'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Tables = require('../tables.js');
const Club = require('../club.js');

const schedule = id => Array.from({length: Club.EVENING_HANDS}, (_, hand) => Tables.blinds(id, hand));

test('the steady table is the game as it has always been', () => {
  assert.equal(Tables.tables[0].id, 'steady', 'and it is the first choice offered');
  schedule('steady').forEach(b => assert.deepEqual(b, {small: 5, big: 10}));
});

test('rising blinds climb every four hands and finish at 15 / 30', () => {
  const s = schedule('rising');
  s.slice(0, 4).forEach(b => assert.deepEqual(b, {small: 5, big: 10}));
  s.slice(4, 8).forEach(b => assert.deepEqual(b, {small: 10, big: 20}));
  s.slice(8, 12).forEach(b => assert.deepEqual(b, {small: 15, big: 30}));
});

test('the high table plays 10 / 20 all evening', () => {
  schedule('high').forEach(b => assert.deepEqual(b, {small: 10, big: 20}));
});

test('an unknown or missing table falls back to steady rather than no blinds', () => {
  assert.deepEqual(Tables.blinds('a-pony', 3), {small: 5, big: 10});
  assert.deepEqual(Tables.blinds(undefined, undefined), {small: 5, big: 10});
  assert.equal(Tables.find('nonsense').id, 'steady');
});

test('every table is playable: whole chips, blinds that never fall, and a stack of at least ten big blinds', () => {
  const ids = new Set();
  for (const table of Tables.tables) {
    assert(!ids.has(table.id)); ids.add(table.id);
    assert(table.name && table.note);
    let previous = 0;
    for (const b of schedule(table.id)) {
      assert(Number.isInteger(b.small) && Number.isInteger(b.big) && b.small > 0 && b.small <= b.big);
      assert(b.big >= previous, `${table.id}: blinds must not fall mid-evening`);
      assert(b.big * 10 <= 500, `${table.id}: a fresh stack must start with at least ten big blinds`);
      previous = b.big;
    }
  }
});

test('the list handed out cannot be used to rewrite the tables', () => {
  Tables.tables[1].levels[0][2] = 999;
  Tables.find('rising').levels[0][2] = 999;
  assert.deepEqual(Tables.blinds('rising', 0), {small: 5, big: 10});
});
