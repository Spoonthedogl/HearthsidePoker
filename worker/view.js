/* The one chokepoint every outbound message passes through. This is where the
 * trust boundary actually lives - nothing else in this room ever hands a
 * viewer's payload to another function to send.
 *
 * A server-side Table numbers seats the same way for everyone. Each viewer
 * instead sees a table shaped exactly like the single-player game already
 * on every platform: they are always local seat 0, and everyone else keeps
 * their same clockwise order out from there. That illusion is what lets the
 * existing client - which has only ever known "seat 0 is the human" - render
 * a networked table with no changes at all.
 *
 * HearthRoomView.viewFor(table, viewerSeat, options?) -> {snapshot, rotateEvent}
 *   viewerSeat: the server's real seat id for this viewer, or null for a
 *               spectator who owns no seat (sees no hole cards at all).
 *   snapshot:   table.snapshot({viewer:viewerSeat}), rotated into the
 *               viewer's local numbering. Never contains the deck, and never
 *               contains another seat's hole cards before a genuine reveal.
 *   rotateEvent(event) -> a shallow copy of one of table.events with every
 *               seat-id field rewritten into the same local numbering. Event
 *               data is otherwise untouched: no event type carries a hidden
 *               hole card (dealing is silent; a shown-down hand only ever
 *               appears once it is genuinely public), so nothing here needs
 *               to redact event contents - only renumber who they're about.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HearthRoomView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function rotateId(serverId, viewerSeat, seatCount) {
    if (serverId === null || serverId === undefined) return serverId;
    // A spectator holds no seat to rotate around; they see the real numbering.
    if (viewerSeat === null || viewerSeat === undefined) return serverId;
    return ((serverId - viewerSeat) % seatCount + seatCount) % seatCount;
  }

  function rotateIds(ids, viewerSeat, seatCount) {
    return (ids || []).map(function (id) { return rotateId(id, viewerSeat, seatCount); });
  }

  // Every seat-id-bearing field across every event/result shape poker.js
  // emits. Kept in one place so a new field only needs adding here.
  function rotateResult(result, viewerSeat, seatCount) {
    if (!result) return result;
    var out = Object.assign({}, result);
    if (Array.isArray(out.winners)) out.winners = out.winners.map(function (w) {
      return Object.assign({}, w, {id: rotateId(w.id, viewerSeat, seatCount)});
    });
    if (Array.isArray(out.pots)) out.pots = out.pots.map(function (p) {
      return Object.assign({}, p, {eligible: rotateIds(p.eligible, viewerSeat, seatCount), winners: rotateIds(p.winners, viewerSeat, seatCount)});
    });
    if (Array.isArray(out.bonus)) out.bonus = out.bonus.map(function (b) {
      return Object.assign({}, b, {playerId: rotateId(b.playerId, viewerSeat, seatCount)});
    });
    if (Array.isArray(out.showdown)) out.showdown = out.showdown.map(function (s) {
      return Object.assign({}, s, {id: rotateId(s.id, viewerSeat, seatCount)});
    });
    return out;
  }

  function rotateEvent(event, viewerSeat, seatCount) {
    var out = Object.assign({}, event);
    if ('playerId' in out) out.playerId = rotateId(out.playerId, viewerSeat, seatCount);
    if ('dealer' in out) out.dealer = rotateId(out.dealer, viewerSeat, seatCount);
    if (out.result) out.result = rotateResult(out.result, viewerSeat, seatCount);
    return out;
  }

  function rotateSnapshot(snapshot, viewerSeat, seatCount) {
    var rotated = new Array(seatCount);
    snapshot.players.forEach(function (p) {
      var local = rotateId(p.id, viewerSeat, seatCount);
      rotated[local] = Object.assign({}, p, {id: local});
    });
    return Object.assign({}, snapshot, {
      players: rotated,
      dealer: rotateId(snapshot.dealer, viewerSeat, seatCount),
      actor: rotateId(snapshot.actor, viewerSeat, seatCount),
      result: rotateResult(snapshot.result, viewerSeat, seatCount)
    });
  }

  function viewFor(table, viewerSeat, options) {
    options = options || {};
    var seatCount = table.players.length;
    var snap = table.snapshot({viewer: viewerSeat, revealAll: options.revealAll});
    return {
      snapshot: rotateSnapshot(snap, viewerSeat, seatCount),
      rotateEvent: function (event) { return rotateEvent(event, viewerSeat, seatCount); }
    };
  }

  return {rotateId: rotateId, viewFor: viewFor};
});
