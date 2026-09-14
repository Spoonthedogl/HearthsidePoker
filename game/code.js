/* Private-room codes. Short enough to read aloud or type on a phone: no
 * vowels (so nothing spells an accidental word) and no easily-confused
 * characters (0/O, 1/I/L), so a spoken or handwritten code never silently
 * turns into a different real code.
 *
 * HearthRoomCode.generate(random?) -> a fresh 6-character code.
 * HearthRoomCode.normalize(input) -> the canonical code from anything a
 * person might type or paste (mixed case, spaces, a display hyphen), or
 * null if it can't possibly be a real code.
 * HearthRoomCode.display(code) -> "BCDF-GH", the on-screen form.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HearthRoomCode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';
  var LENGTH = 6;

  function generate(random) {
    random = random || Math.random;
    var code = '';
    for (var i = 0; i < LENGTH; i++) code += ALPHABET[Math.floor(random() * ALPHABET.length)];
    return code;
  }

  function normalize(input) {
    if (typeof input !== 'string') return null;
    var code = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== LENGTH) return null;
    for (var i = 0; i < code.length; i++) if (ALPHABET.indexOf(code[i]) < 0) return null;
    return code;
  }

  function display(code) {
    return code.slice(0, 4) + '-' + code.slice(4);
  }

  return {ALPHABET: ALPHABET, LENGTH: LENGTH, generate: generate, normalize: normalize, display: display};
});
