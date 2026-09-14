'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Code = require('../code.js');

function seeded(seed) { return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

test('generated codes are the right length and alphabet, never a vowel or confusable digit', () => {
  const random = seeded(1);
  for (let i = 0; i < 200; i++) {
    const code = Code.generate(random);
    assert.equal(code.length, Code.LENGTH);
    for (const ch of code) assert(Code.ALPHABET.includes(ch), `unexpected character ${ch}`);
    assert(!/[AEIOU01]/.test(code));
  }
});

test('normalize accepts anything a person might type and rejects the rest', () => {
  const code = Code.generate(seeded(2));
  const spaced = code.slice(0, 4) + '-' + code.slice(4);
  assert.equal(Code.normalize(spaced.toLowerCase()), code);
  assert.equal(Code.normalize('  ' + code + '  '), code);
  assert.equal(Code.normalize('AEIOU1'), null); // right length, wrong alphabet
  assert.equal(Code.normalize('BCDF'), null); // too short
  assert.equal(Code.normalize(''), null);
  assert.equal(Code.normalize(null), null);
  assert.equal(Code.normalize(42), null);
});

test('display splits the code for reading, and it round-trips through normalize', () => {
  const code = Code.generate(seeded(3));
  assert.equal(Code.display(code), code.slice(0, 4) + '-' + code.slice(4));
  assert.equal(Code.normalize(Code.display(code)), code);
});
