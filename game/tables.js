/* The kind of evening you sit down to. A table is only a blind schedule over
 * the twelve hands of an evening: the stack, the kitty and the club fund are the
 * same at every table, so choosing one changes the pace of play and nothing
 * about what the room costs.
 *
 * HearthTables.tables lists them in display order. HearthTables.find(id) falls
 * back to the steady table for anything unknown, so an old or edited save can
 * never leave the evening without blinds. HearthTables.blinds(id, handsPlayed)
 * -> {small, big} for the next hand, where handsPlayed counts this evening's
 * finished hands from 0.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HearthTables = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Each level is [first hand it applies to, small blind, big blind]. Blinds
  // only ever climb through an evening, and never past a tenth of a fresh stack.
  var TABLES = [
    {id: 'steady', name: 'Steady table', note: 'Blinds stay at 5 / 10 all evening.', levels: [[0, 5, 10]]},
    {id: 'rising', name: 'Rising blinds', note: 'Blinds climb every four hands as the fire burns down, from 5 / 10 to 15 / 30.', levels: [[0, 5, 10], [4, 10, 20], [8, 15, 30]]},
    {id: 'high', name: 'High stakes', note: 'Blinds of 10 / 20 all evening. Bigger pots, quicker swings.', levels: [[0, 10, 20]]}
  ];

  function copy(table) {
    return {id: table.id, name: table.name, note: table.note, levels: table.levels.map(function (l) { return l.slice(); })};
  }

  function find(id) {
    for (var i = 0; i < TABLES.length; i++) if (TABLES[i].id === id) return TABLES[i];
    return TABLES[0];
  }

  function blinds(id, handsPlayed) {
    var levels = find(id).levels, level = levels[0], played = Math.max(0, Math.floor(Number(handsPlayed) || 0));
    for (var i = 0; i < levels.length; i++) if (played >= levels[i][0]) level = levels[i];
    return {small: level[1], big: level[2]};
  }

  return {tables: TABLES.map(copy), find: function (id) { return copy(find(id)); }, blinds: blinds};
});
