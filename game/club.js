/* The Hearthside club fund. An evening is a fixed number of hands; whatever
 * you finish above your buy-ins goes into the fund, and the fund makes the
 * room warmer. Nothing here touches cards, betting or opponents: it only ever
 * receives a finished evening's chip result.
 *
 * HearthClub.fresh() -> new state. HearthClub.restore(saved) -> validated
 * state, falling back to fresh() for anything malformed, so a corrupt or
 * hand-edited save can never brick the room.
 * .catalogue lists every purchasable comfort in display order.
 * .owns(state,id) / .buy(state,id) -> {ok,state,error}; buying is pure and
 * returns a new state rather than mutating the old one.
 * .lights(state) -> {extra,boosts} for ambience.js: extra entries are whole
 * new light sources, boosts scale an existing light's strength/radius.
 * .catLiveliness(state) -> multiplier for the windowsill cat's rare poses.
 * Comforts are always atmosphere only. Nothing here gates a companion, a
 * table size or any part of the game behind the fund.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HearthClub = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EVENING_HANDS = 12;
  var VERSION = 1;
  // Everyone drops something in the tin for the fire, win or lose, so a rough
  // night still leaves the room slightly better than it was. A rebuy dents
  // your winnings without erasing the evening: measured play, not punishment.
  var KITTY = 40;
  var REBUY_COST = 250;

  // Light ids here must match ambience.js. Boosts multiply the painted glow
  // already in the room; extras add a new source beside it.
  var CATALOGUE = [
    {id: 'hearth', name: 'Bank the hearth', cost: 80,
      note: 'Build the fire up properly, so it throws real light across the table.',
      boosts: {fireplace: {strength: 1.45, radius: 1.2}}},
    {id: 'mantel', name: 'Trim the mantel candles', cost: 60,
      note: 'Fresh wicks on the pair above the fireplace.',
      boosts: {'mantel-candle-tall': {strength: 1.5}, 'mantel-candle-small': {strength: 1.5}}},
    {id: 'lanterns', name: 'Refill the lanterns', cost: 70,
      note: 'The two on the back wall have been running low all season.',
      boosts: {'back-lantern-left': {strength: 1.4}, 'back-lantern-right': {strength: 1.4}}},
    {id: 'near-candle', name: 'A candle for your side', cost: 90,
      note: 'One of your own, set down by your elbow.',
      extra: {id: 'club-near-candle', x: 1400, y: 832, radius: 43, strength: .058, flameY: 839, flameH: 16, phase: 3.7}},
    {id: 'reading-lamp', name: 'A reading lamp by the shelves', cost: 110,
      note: 'For Luna, really, but everyone benefits.',
      extra: {id: 'club-reading-lamp', x: 1338, y: 196, radius: 52, strength: .062, flameY: 205, flameH: 15, phase: 1.1}},
    {id: 'cushion', name: 'A proper cushion for the cat', cost: 120,
      note: 'Thicker, and in the good sunbeam. She notices.',
      liveliness: 1.6}
  ];

  var byId = {};
  CATALOGUE.forEach(function (item) { byId[item.id] = item; });

  function fresh() {
    return {version: VERSION, fund: 0, owned: [], evenings: 0, bestTakeHome: 0};
  }

  function counter(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 1e9 ? value : 0;
  }

  function restore(saved) {
    var state = fresh();
    if (!saved || typeof saved !== 'object' || saved.version !== VERSION) return state;
    state.fund = counter(saved.fund);
    state.evenings = counter(saved.evenings);
    state.bestTakeHome = counter(saved.bestTakeHome);
    if (Array.isArray(saved.owned)) {
      saved.owned.forEach(function (id) {
        if (byId[id] && state.owned.indexOf(id) < 0) state.owned.push(id);
      });
    }
    return state;
  }

  function owns(state, id) {
    return !!state && Array.isArray(state.owned) && state.owned.indexOf(id) >= 0;
  }

  // Your winnings are whatever you finish above the stack you sat down with,
  // less a part-cost for each time you bought back in. Never negative: a bad
  // evening earns nothing, it never takes the room backwards.
  function takeHome(finalStack, buyIns, startingStack) {
    var stake = startingStack || 500;
    var rebuys = Math.max(0, Math.max(1, buyIns || 1) - 1);
    return Math.max(0, Math.floor((finalStack || 0) - stake - rebuys * REBUY_COST));
  }

  // What the evening actually puts in the fund: the shared kitty plus your
  // winnings. The split is returned so the close-out can show both.
  function eveningTotal(finalStack, buyIns, startingStack) {
    var winnings = takeHome(finalStack, buyIns, startingStack);
    return {winnings: winnings, kitty: KITTY, total: winnings + KITTY};
  }

  function endEvening(state, earned) {
    var next = restore(state);
    var gain = counter(earned);
    next.fund += gain;
    next.evenings += 1;
    if (gain > next.bestTakeHome) next.bestTakeHome = gain;
    return next;
  }

  function buy(state, id) {
    var next = restore(state), item = byId[id];
    if (!item) return {ok: false, state: next, error: 'That is not on the shelf.'};
    if (owns(next, id)) return {ok: false, state: next, error: 'Already part of the room.'};
    if (next.fund < item.cost) return {ok: false, state: next, error: 'The fund will not cover it yet.'};
    next.fund -= item.cost;
    next.owned.push(id);
    return {ok: true, state: next, error: ''};
  }

  function lights(state) {
    var extra = [], boosts = {};
    CATALOGUE.forEach(function (item) {
      if (!owns(state, item.id)) return;
      if (item.extra) extra.push(Object.assign({}, item.extra));
      if (item.boosts) Object.keys(item.boosts).forEach(function (lightId) {
        var scale = item.boosts[lightId], current = boosts[lightId] || {strength: 1, radius: 1};
        boosts[lightId] = {strength: current.strength * (scale.strength || 1), radius: current.radius * (scale.radius || 1)};
      });
    });
    return {extra: extra, boosts: boosts};
  }

  function catLiveliness(state) {
    var multiplier = 1;
    CATALOGUE.forEach(function (item) {
      if (item.liveliness && owns(state, item.id)) multiplier *= item.liveliness;
    });
    return multiplier;
  }

  return {EVENING_HANDS: EVENING_HANDS, KITTY: KITTY, REBUY_COST: REBUY_COST, catalogue: CATALOGUE.slice(),
    fresh: fresh, restore: restore, owns: owns, buy: buy, takeHome: takeHome, eveningTotal: eveningTotal,
    endEvening: endEvening, lights: lights, catLiveliness: catLiveliness};
});
