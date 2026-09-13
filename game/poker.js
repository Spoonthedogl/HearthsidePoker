/* Hearthside Poker — original, dependency-free Texas Hold'em rules.
 * UMD: browser global Poker, or require('./poker.js').
 * Cards: {rank: 2..14, suit: 's'|'h'|'d'|'c'}; cardKey: e.g. '14s'.
 * evaluate(0..7 cards): {category:0..8,name,tiebreak,bestCards}; compare(a,b).
 * analyzeVisible(hole,board,{samples:2400,random?}): current evaluation,
 * bestCardKeys, rows (category/name/probability/possible/current/outs/example),
 * improvingOuts, exact, totalRunouts, sampleLabel. Probabilities describe the
 * strongest FINAL hand category, not winning odds. Only supplied public and
 * own cards are excluded: neither other hands nor a real deck are consulted.
 * Flop/turn/river are exhaustive. Preflop samples unseen community runouts.
 * Outs are next cards that immediately improve the current HAND CATEGORY.
 * Each observed row.example is {bestCards,futureBoard,neededCards,
 * usedHoleKeys,usedBoardKeys}. futureBoard is a complete hypothetical runout;
 * neededCards contains only its cards used in that example's best five.
 * usedBoardKeys references already-visible board cards, not future cards.
 * An example is null when no final hand in that category was observed.
 *
 * new Table({random?,startingStack:500,smallBlind:5,bigBlind:10,names?})
 * .newHand() starts a hand (false if fewer than two funded seats).
 * .players: id/name/stack/hole/folded/allIn/bet/totalBet/lastAction.
 * .board, .street, .dealer, .actor, .currentBet, .minRaise, .pot,
 * .handNumber, .events, .result, .gameOver are readable.
 * .legalActions(id=actor): {fold,check,call,canRaise,minRaiseTo,maxRaiseTo,
 *                         allIn,allInCanRaise}.
 * .act(id,'fold'|'check'|'call'|'raise'|'allin',raiseTo?) performs ONE action.
 * A raise amount is the TOTAL bet on this street, not an increment.
 * .stepAI() performs one current AI action; id 0 is always human.
 * .chooseAIAction() returns {type,amount?}, using own/public info only.
 * .snapshot({revealAll:false}) hides opponents until their showdown reveal.
 * Streets advance automatically once betting closes. All-in runouts finish
 * automatically. UI can animate newly appended .events in order. Each event
 * has monotonically increasing id/type/handNumber/street. Result has
 * {reason,totalPot,winners:[{id,amount,wonAmount,returnedAmount,hand}],pots,
 * showdown,board}. amount includes any uncalled return; wonAmount excludes
 * that return. hand is null for wins by folding, which reveal no hole cards.
 * Settlement clears live contributions (.pot becomes 0); result.totalPot
 * preserves the just-finished pot. Stacks + live pot are always conserved.
 * No real money, network, external assets, or dependencies.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Poker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUITS = ['s', 'h', 'd', 'c'];
  const CATEGORY_NAMES = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];
  const RANK_NAMES = {11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace'};
  const cardKey = c => String(c.rank) + c.suit;
  function makeDeck() {
    const cards = [];
    for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) cards.push({rank, suit});
    return cards;
  }
  function shuffle(cards, random = Math.random) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(random() * (i + 1)));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }
  const shuffledDeck = random => shuffle(makeDeck(), random);
  function validateCards(cards, max = 7) {
    if (!Array.isArray(cards) || cards.length > max) throw new Error('Expected at most ' + max + ' cards.');
    const seen = new Set();
    for (const c of cards) {
      if (!c || !Number.isInteger(c.rank) || c.rank < 2 || c.rank > 14 || !SUITS.includes(c.suit)) throw new Error('Invalid card.');
      const key = cardKey(c);
      if (seen.has(key)) throw new Error('Duplicate card: ' + key);
      seen.add(key);
    }
  }
  function compare(a, b) {
    if (a.category !== b.category) return Math.sign(a.category - b.category);
    for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
      const delta = (a.tiebreak[i] || 0) - (b.tiebreak[i] || 0);
      if (delta) return Math.sign(delta);
    }
    return 0;
  }
  function straightCards(sorted) {
    const ranks = new Map();
    for (const c of sorted) if (!ranks.has(c.rank)) ranks.set(c.rank, c);
    if (ranks.has(14)) ranks.set(1, ranks.get(14));
    for (let high = 14; high >= 5; high--) {
      const result = [];
      for (let r = high; r > high - 5; r--) {
        if (!ranks.has(r)) break;
        result.push(ranks.get(r));
      }
      if (result.length === 5) return {high, cards: result};
    }
    return null;
  }
  function evaluateUnchecked(cards) {
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    const byRank = new Map(), bySuit = new Map();
    for (const c of sorted) {
      if (!byRank.has(c.rank)) byRank.set(c.rank, []);
      if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
      byRank.get(c.rank).push(c); bySuit.get(c.suit).push(c);
    }
    const groups = [...byRank.values()].sort((a, b) => b.length - a.length || b[0].rank - a[0].rank);
    const flush = [...bySuit.values()].find(group => group.length >= 5);
    function result(category, tiebreak, bestCards) {
      return {category, name: category === 8 && tiebreak[0] === 14 ? 'Royal Flush' : CATEGORY_NAMES[category], tiebreak, bestCards};
    }
    if (flush) {
      const straightFlush = straightCards(flush);
      if (straightFlush) return result(8, [straightFlush.high], straightFlush.cards);
    }
    const four = groups.find(g => g.length === 4);
    if (four) {
      const kickers = sorted.filter(c => c.rank !== four[0].rank).slice(0, 1);
      return result(7, [four[0].rank, ...kickers.map(c => c.rank)], [...four, ...kickers]);
    }
    const trips = groups.filter(g => g.length >= 3).sort((a, b) => b[0].rank - a[0].rank);
    const pairForFull = trips.length && groups.filter(g => g.length >= 2 && g[0].rank !== trips[0][0].rank).sort((a, b) => b[0].rank - a[0].rank)[0];
    if (pairForFull) return result(6, [trips[0][0].rank, pairForFull[0].rank], [...trips[0].slice(0, 3), ...pairForFull.slice(0, 2)]);
    if (flush) return result(5, flush.slice(0, 5).map(c => c.rank), flush.slice(0, 5));
    const straight = straightCards(sorted);
    if (straight) return result(4, [straight.high], straight.cards);
    if (trips.length) {
      const kickers = sorted.filter(c => c.rank !== trips[0][0].rank).slice(0, 2);
      return result(3, [trips[0][0].rank, ...kickers.map(c => c.rank)], [...trips[0], ...kickers]);
    }
    const pairs = groups.filter(g => g.length === 2).sort((a, b) => b[0].rank - a[0].rank);
    if (pairs.length >= 2) {
      const pairRanks = [pairs[0][0].rank, pairs[1][0].rank];
      const kicker = sorted.filter(c => !pairRanks.includes(c.rank)).slice(0, 1);
      return result(2, [...pairRanks, ...kicker.map(c => c.rank)], [...pairs[0], ...pairs[1], ...kicker]);
    }
    if (pairs.length) {
      const kickers = sorted.filter(c => c.rank !== pairs[0][0].rank).slice(0, 3);
      return result(1, [pairs[0][0].rank, ...kickers.map(c => c.rank)], [...pairs[0], ...kickers]);
    }
    return result(0, sorted.slice(0, 5).map(c => c.rank), sorted.slice(0, 5));
  }
  function evaluate(cards) { validateCards(cards); return evaluateUnchecked(cards); }

  // Incremental form shared by the synchronous API and the responsive local-
  // file fallback. step(n) performs at most n runouts; its result is available
  // only once done. Splitting work never changes runout order or random calls.
  function createVisibleAnalysis(hole, board, options = {}) {
    if (!Array.isArray(hole) || hole.length !== 2) throw new Error('The guide needs your two hole cards.');
    if (!Array.isArray(board) || ![0, 3, 4, 5].includes(board.length)) throw new Error('Board must contain 0, 3, 4, or 5 cards.');
    const known = [...hole, ...board]; validateCards(known);
    const knownKeys = new Set(known.map(cardKey));
    const unseen = makeDeck().filter(c => !knownKeys.has(cardKey(c)));
    const current = evaluateUnchecked(known), counts = Array(9).fill(0), examples = Array(9).fill(null);
    const outs = Array.from({length: 9}, () => []);
    if (board.length < 5) for (const card of unseen) {
      const next = evaluateUnchecked([...known, card]);
      if (next.category > current.category) outs[next.category].push(cardKey(card));
    }
    let totalRunouts = 0;
    const record = cards => {
      const final = evaluateUnchecked(cards);
      counts[final.category]++; totalRunouts++;
      if (!examples[final.category]) {
        const bestKeys = new Set(final.bestCards.map(cardKey));
        const futureBoard = cards.slice(known.length).map(c => ({...c}));
        examples[final.category] = {
          bestCards: final.bestCards.map(c => ({...c})), futureBoard,
          neededCards: futureBoard.filter(c => bestKeys.has(cardKey(c))).map(c => ({...c})),
          usedHoleKeys: hole.filter(c => bestKeys.has(cardKey(c))).map(cardKey),
          usedBoardKeys: board.filter(c => bestKeys.has(cardKey(c))).map(cardKey)
        };
      }
    };
    const exact = board.length >= 3;
    const expectedRunouts = board.length === 5 ? 1 : board.length === 4 ? unseen.length : board.length === 3 ? unseen.length * (unseen.length - 1) / 2 : Math.max(100, Math.min(100000, Math.floor(Number(options.samples) || 2400)));
    const random = options.random || Math.random;
    let first = 0, second = 1, result = null;
    function finish() { return {
      current, bestCardKeys: current.bestCards.map(cardKey), exact, totalRunouts,
      sampleLabel: exact ? 'Exact · ' + totalRunouts.toLocaleString('en-GB') + ' visible-information runouts' : 'Estimate · ' + totalRunouts.toLocaleString('en-GB') + ' sampled runouts',
      // Preflop every final category is constructible except high card with a
      // pocket pair. A zero sample count must never imply an impossible draw.
      rows: CATEGORY_NAMES.map((name, category) => ({category, name, probability: counts[category] / totalRunouts, observed: counts[category], possible: exact ? counts[category] > 0 : category >= current.category, current: category === current.category, outs: outs[category], example: examples[category]})),
      improvingOuts: outs.flat(),
      explanation: 'Final best-five-card category from your cards and the board. These are not win odds. Unseen cards are equally possible; opponents’ cards and the actual deck are never used.',
      outsExplanation: 'Outs are unseen next cards that immediately improve your hand category. They are not guaranteed winning cards. Runner-runner outcomes appear in final probabilities.'
    }; }
    return {
      get done() { return result !== null; },
      get result() { return result; },
      get completedRunouts() { return totalRunouts; },
      expectedRunouts,
      step(limit = 128) {
        limit = Math.max(1, Math.floor(Number(limit) || 128));
        for (let n = 0; n < limit && totalRunouts < expectedRunouts; n++) {
          if (board.length === 5) record(known);
          else if (board.length === 4) record([...known, unseen[first++]]);
          else if (board.length === 3) {
            record([...known, unseen[first], unseen[second++]]);
            if (second >= unseen.length) { first++; second = first + 1; }
          } else {
            const pool = [...unseen], runout = [];
            for (let count = 0; count < 5; count++) {
              const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
              runout.push(pool[index]); pool[index] = pool[pool.length - 1]; pool.pop();
            }
            record([...known, ...runout]);
          }
        }
        if (!result && totalRunouts === expectedRunouts) result = finish();
        return {done: result !== null, completedRunouts: totalRunouts, result};
      }
    };
  }
  function analyzeVisible(hole, board, options = {}) {
    const task = createVisibleAnalysis(hole, board, options);
    while (!task.done) task.step(Infinity);
    return task.result;
  }

  // This helper accepts an information-limited view, deliberately never Table.
  function chooseFairAction(view, random = Math.random) {
    const legal = view.legal;
    const known = [...view.hole, ...view.board];
    const excluded = new Set(known.map(cardKey));
    const deck = makeDeck().filter(c => !excluded.has(cardKey(c)));
    const rivals = Math.max(1, Math.min(6, view.opponents || 1));
    let equity = 0;
    const trials = 64;
    for (let trial = 0; trial < trials; trial++) {
      const pool = [...deck];
      // Partial Fisher-Yates: simulated cards never inspect the real deck.
      const draw = () => { const i = Math.min(pool.length - 1, Math.floor(random() * pool.length)); const c = pool[i]; pool[i] = pool[pool.length - 1]; pool.pop(); return c; };
      const community = [...view.board];
      while (community.length < 5) community.push(draw());
      const hero = evaluateUnchecked([...view.hole, ...community]);
      let ties = 1, beaten = false;
      for (let rival = 0; rival < rivals; rival++) {
        const other = evaluateUnchecked([draw(), draw(), ...community]);
        const cmp = compare(hero, other);
        if (cmp < 0) beaten = true;
        if (cmp === 0) ties++;
      }
      if (!beaten) equity += 1 / ties;
    }
    equity /= trials;
    const noise = (random() - 0.5) * 0.08;
    const price = legal.call / Math.max(1, view.pot + legal.call);
    const styles={Juniper:{bias:.015,raise:1.18,size:1.0},Luna:{bias:-.025,raise:.78,size:.9},Moss:{bias:.025,raise:.65,size:.85},Clipper:{bias:-.045,raise:.9,size:1.12},Mur:{bias:.045,raise:.82,size:.85},Baron:{bias:.03,raise:.72,size:1.0}};
    const style=styles[view.style]||{bias:0,raise:1,size:1};
    const value = equity + noise + style.bias;
    const street = view.street || (view.board.length === 0 ? 'preflop' : view.board.length === 3 ? 'flop' : view.board.length === 4 ? 'turn' : 'river');
    const early = street === 'preflop' || street === 'flop';
    const bigBlind = view.bigBlind || 10;
    const ownBet = Number.isFinite(view.bet) ? view.bet : 0;
    const stack = Number.isFinite(view.stack) ? view.stack : legal.maxRaiseTo - ownBet;
    const raises = view.streetRaiseCount || 0, ownRaises = view.ownRaiseCount || 0;
    const roundChips = n => Math.round(n / 5) * 5;
    // One opening wager on early streets; on later streets allow a single
    // strong re-raise, with each AI seat raising at most once. These counts
    // describe public betting, never private cards or the real deck.
    if (legal.canRaise && ownRaises === 0 && raises < (early ? 1 : 2)) {
      let desired = 0, budget = 0, probability = 0;
      if (street === 'preflop') {
        const threshold = rivals === 1 ? 0.58 : rivals === 2 ? 0.43 : 0.34;
        probability = value > threshold + 0.14 ? 0.70 : value > threshold ? 0.34 : 0;
        desired = roundChips(bigBlind * (view.pot > bigBlind * 3 ? 3 : 2.5));
        budget = Math.min(bigBlind * 4, ownBet + Math.floor(stack * 0.15));
      } else if (street === 'flop') {
        const threshold = 1 / (rivals + 1) + 0.12;
        probability = value > Math.max(0.65, threshold) ? 0.70 : value > threshold ? 0.38 : 0;
        desired = Math.max(bigBlind, roundChips(view.pot * (value > 0.70 ? 0.35 : 0.28)));
        budget = ownBet + Math.floor(stack * 0.18);
      } else {
        if (raises === 0) probability = value > 0.72 ? 0.78 : value > 0.48 ? 0.42 : 0;
        else probability = value > (street === 'river' ? 0.84 : 0.88) ? 0.42 : 0;
        desired = view.currentBet + Math.max(view.minRaise, roundChips(view.pot * (street === 'river' ? 0.50 : 0.38)));
        budget = ownBet + Math.floor(stack * (street === 'river' ? 0.55 : 0.38));
      }
      if (probability > 0 && random() < probability * style.raise) {
        const made = evaluateUnchecked(known);
        // Later strong value can commit a short stack. Early bets never turn
        // into proactive jams just because a size was clipped to the stack.
        const canJam = !early && value > 0.90 && made.category >= 2 && stack <= view.pot * 0.8;
        if (canJam && desired >= legal.maxRaiseTo) return {type: 'allin'};
        const maximum = Math.min(budget, legal.maxRaiseTo - 1);
        // If even the minimum raise is outside the budget, call/check/fold;
        // do not lift an intended small bet into an unaffordable minimum.
        if (maximum >= legal.minRaiseTo) {
          const amount = Math.min(maximum, Math.max(legal.minRaiseTo, roundChips(desired*style.size)));
          return {type: 'raise', amount};
        }
      }
    }
    if (legal.check) return {type: 'check'};
    const expensiveEarlyCall = early && legal.call > bigBlind * 3 && legal.call > stack * 0.25;
    const threshold = Math.max(price + 0.025, expensiveEarlyCall ? (street === 'preflop' ? 0.53 : 0.62) : 0);
    // Small calls, including genuine short-stack all-in calls, remain legal
    // and available. Expensive early calls require stronger visible evidence.
    if (value > threshold || legal.call <= bigBlind && value > 0.12 || !expensiveEarlyCall && random() < 0.035) return {type: 'call'};
    return {type: 'fold'};
  }

  class Table {
    constructor(options = {}) {
      this.random = options.random || Math.random;
      this.smallBlind = options.smallBlind || 5;
      this.bigBlind = options.bigBlind || 10;
      const startingStack = options.startingStack === undefined ? 500 : options.startingStack;
      if (![startingStack, this.smallBlind, this.bigBlind].every(n => Number.isInteger(n) && n > 0) || this.smallBlind > this.bigBlind) throw new Error('Stacks and blinds must be positive whole chips, small blind no bigger than big blind.');
      this.startingStack = startingStack;
      const names = options.names || ['You', 'Maple', 'Juniper', 'Mochi'];
      const count=options.seatCount||names.length;
      if(!Number.isInteger(count)||count<2||count>7)throw Error('Choose between two and seven seats.');
      this.players = Array.from({length: count}, (_, id) => ({id, name: names[id] || 'Player ' + (id + 1), stack: startingStack, hole: [], folded: false, allIn: false, bet: 0, totalBet: 0, lastAction: '', actedRound: false, lastActionBet: 0, lastRaiseAtAction: this.bigBlind}));
      this.dealer = -1; this.actor = null; this.street = 'idle'; this.board = [];
      this.currentBet = 0; this.minRaise = this.bigBlind; this.handNumber = 0;
      this.events = []; this.eventId = 0; this.result = null; this.gameOver = false;
      this.pending = new Set(); this.deck = [];
    }
    get pot() { return this.players.reduce((sum, p) => sum + p.totalBet, 0); }
    _event(type, data = {}) { const event = {id: ++this.eventId, type, handNumber: this.handNumber, street: this.street, ...data}; this.events.push(event); return event; }
    _next(from, predicate) { for (let n = 1; n <= this.players.length; n++) { const id = (from + n + this.players.length) % this.players.length; if (predicate(this.players[id])) return id; } return null; }
    _live() { return this.players.filter(p => p.hole.length && !p.folded); }
    _canAct(p) { return p.hole.length && !p.folded && !p.allIn && p.stack > 0; }
    _take(p, amount) { const paid = Math.min(p.stack, amount); p.stack -= paid; p.bet += paid; p.totalBet += paid; p.allIn = p.stack === 0; return paid; }
    _deal() { if (!this.deck.length) throw new Error('Deck exhausted.'); return this.deck.pop(); }
    _blind(id, amount, label) { const paid = this._take(this.players[id], amount); this.players[id].lastAction = label + ' ' + paid; this._event('blind', {playerId: id, amount: paid, label}); }
    newHand() {
      if (!['idle', 'showdown'].includes(this.street)) throw new Error('Finish the current hand first.');
      const funded = this.players.filter(p => p.stack > 0);
      if (funded.length < 2) { this.gameOver = true; this.actor = null; return false; }
      this.gameOver = false; this.handNumber++; this.result = null; this.board = [];
      this.street = 'preflop'; this.currentBet = this.bigBlind; this.minRaise = this.bigBlind;
      this.dealer = this._next(this.dealer, p => p.stack > 0);
      this.deck = shuffledDeck(this.random);
      for (const p of this.players) Object.assign(p, {hole: [], folded: p.stack <= 0, allIn: false, bet: 0, totalBet: 0, lastAction: p.stack <= 0 ? 'Resting' : '', actedRound: false, lastActionBet: 0, lastRaiseAtAction: this.bigBlind});
      for (let round = 0; round < 2; round++) {
        let seat = this.dealer;
        for (let i = 0; i < funded.length; i++) { seat = this._next(seat, p => p.stack > 0); this.players[seat].hole.push(this._deal()); }
      }
      this._event('hand-start', {dealer: this.dealer});
      const sb = funded.length === 2 ? this.dealer : this._next(this.dealer, p => p.hole.length);
      const bb = this._next(sb, p => p.hole.length);
      this._blind(sb, this.smallBlind, 'Small blind'); this._blind(bb, this.bigBlind, 'Big blind');
      this.pending = new Set(this.players.filter(p => this._canAct(p)).map(p => p.id));
      this.actor = this._next(bb, p => this.pending.has(p.id));
      this._settleFlow(bb);
      return true;
    }
    legalActions(id = this.actor) {
      const p = this.players[id];
      const blank = {fold: false, check: false, call: 0, canRaise: false, minRaiseTo: 0, maxRaiseTo: 0, allIn: false, allInCanRaise: false};
      if (!p || id !== this.actor || !this._canAct(p) || this.result) return blank;
      const owed = Math.max(0, this.currentBet - p.bet);
      const maxRaiseTo = p.bet + p.stack;
      // Cumulative short all-ins reopen raising when they total a full raise.
      const reopened = !p.actedRound || this.currentBet - p.lastActionBet >= p.lastRaiseAtAction;
      const opponentsWithChips = this._live().some(other => other.id !== id && other.stack > 0);
      const canRaise = reopened && opponentsWithChips && maxRaiseTo > this.currentBet;
      return {fold: true, check: owed === 0, call: Math.min(p.stack, owed), canRaise,
        minRaiseTo: this.currentBet + this.minRaise, maxRaiseTo,
        allIn: maxRaiseTo <= this.currentBet || canRaise, allInCanRaise: canRaise};
    }
    act(id, type, amount) {
      if (id !== this.actor || this.actor === null || this.result) throw new Error('It is not that player’s turn.');
      const p = this.players[id], legal = this.legalActions(id);
      type = String(type).toLowerCase().replace('-', '');
      if (!['fold', 'check', 'call', 'raise', 'allin'].includes(type)) throw new Error('Unknown action.');
      if (type === 'check' && !legal.check) throw new Error('Cannot check while facing a bet.');
      if (type === 'call' && legal.check) throw new Error('Nothing to call; check instead.');
      if (type === 'allin' && !legal.allIn) throw new Error('Betting has not reopened for an all-in raise.');
      let target = null;
      if (type === 'raise') {
        if (!legal.canRaise) throw new Error('Raising is not available.');
        if (!Number.isInteger(amount) || amount > legal.maxRaiseTo || amount <= this.currentBet) throw new Error('Invalid raise total.');
        if (amount < legal.minRaiseTo && amount !== legal.maxRaiseTo) throw new Error('Raise is below the minimum.');
        target = amount;
      } else if (type === 'allin') target = legal.maxRaiseTo;
      const before = p.bet;
      let fullRaise = false;
      if (type === 'fold') { p.folded = true; p.lastAction = 'Fold'; }
      else if (type === 'check') p.lastAction = 'Check';
      else if (type === 'call') { this._take(p, legal.call); p.lastAction = p.allIn ? 'All in · ' + p.bet : 'Call ' + (p.bet - before); }
      else {
        this._take(p, target - p.bet);
        if (p.bet > this.currentBet) {
          const increment = p.bet - this.currentBet;
          fullRaise = increment >= this.minRaise;
          if (fullRaise) this.minRaise = increment;
          this.currentBet = p.bet;
          p.lastAction = p.allIn ? 'All in · ' + p.bet : 'Raise to ' + p.bet;
        } else p.lastAction = 'All in · ' + p.bet;
      }
      p.actedRound = true; p.lastActionBet = this.currentBet; p.lastRaiseAtAction = this.minRaise;
      this.pending.delete(id);
      if (fullRaise) this.pending = new Set(this.players.filter(other => other.id !== id && this._canAct(other)).map(other => other.id));
      else for (const other of this.players) if (other.id !== id && this._canAct(other) && other.bet < this.currentBet) this.pending.add(other.id);
      this._event('action', {playerId: id, action: type, amount: p.bet - before, raiseTo: target, fullRaise, text: p.lastAction});
      this._settleFlow(id);
      return this;
    }
    _settleFlow(after) {
      const live = this._live();
      if (live.length === 1) { this._award('fold'); return; }
      for (const id of [...this.pending]) if (!this._canAct(this.players[id])) this.pending.delete(id);
      const actors = live.filter(p => this._canAct(p));
      // With only one stack left, a short blind is owed only its actual wager;
      // the nominal full bring-in cannot create money in an empty side pot.
      if (actors.length === 1) this.currentBet = Math.max(...live.map(p => p.bet));
      // A lone stack may call or fold an outstanding wager, never bet into a dry side pot.
      if (actors.length <= 1 && (!actors.length || actors[0].bet >= this.currentBet)) this.pending.clear();
      if (this.pending.size) { this.actor = this._next(after, p => this.pending.has(p.id)); return; }
      if (this.street === 'river') { this._award('showdown'); return; }
      this._advanceStreet();
    }
    _advanceStreet() {
      for (const p of this.players) { p.bet = 0; p.actedRound = false; p.lastActionBet = 0; p.lastRaiseAtAction = this.bigBlind; if (!p.folded && !p.allIn) p.lastAction = ''; }
      this.currentBet = 0; this.minRaise = this.bigBlind;
      this._deal(); // Burn, never exposed to advice or AI.
      const count = this.street === 'preflop' ? 3 : 1;
      this.street = this.street === 'preflop' ? 'flop' : this.street === 'flop' ? 'turn' : 'river';
      const cards = [];
      for (let i = 0; i < count; i++) { const card = this._deal(); this.board.push(card); cards.push(card); }
      this._event('street', {cards: cards.map(c => ({...c})), board: this.board.map(c => ({...c}))});
      this.pending = new Set(this.players.filter(p => this._canAct(p)).map(p => p.id));
      this.actor = this._next(this.dealer, p => this.pending.has(p.id));
      this._settleFlow(this.dealer);
    }
    _award(reason) {
      const totalPot = this.pot;
      const live = this._live();
      const hands = new Map(live.map(p => [p.id, evaluateUnchecked([...p.hole, ...this.board])]));
      const winnings = new Map(), returns = new Map(), pots = [];
      const levels = [...new Set(this.players.map(p => p.totalBet).filter(n => n > 0))].sort((a, b) => a - b);
      let previous = 0;
      for (const level of levels) {
        const contributors = this.players.filter(p => p.totalBet >= level);
        const amount = (level - previous) * contributors.length; previous = level;
        let eligible = contributors.filter(p => !p.folded);
        if (reason === 'fold') eligible = live;
        if (!eligible.length) throw new Error('Invalid side pot: no eligible winner.');
        let best = hands.get(eligible[0].id);
        for (const p of eligible) if (compare(hands.get(p.id), best) > 0) best = hands.get(p.id);
        const winners = eligible.filter(p => compare(hands.get(p.id), best) === 0).sort((a, b) => ((a.id - this.dealer + this.players.length - 1) % this.players.length) - ((b.id - this.dealer + this.players.length - 1) % this.players.length));
        const share = Math.floor(amount / winners.length), remainder = amount % winners.length;
        winners.forEach((p, index) => {
          const payout = share + (index < remainder ? 1 : 0);
          winnings.set(p.id, (winnings.get(p.id) || 0) + payout);
          if (contributors.length === 1) returns.set(p.id, (returns.get(p.id) || 0) + payout);
        });
        pots.push({amount, eligible: eligible.map(p => p.id), winners: winners.map(p => p.id), uncalled: contributors.length === 1});
      }
      for (const [id, amount] of winnings) this.players[id].stack += amount;
      this.street = 'showdown'; this.actor = null; this.pending.clear();
      this.result = {reason, totalPot, winners: [...winnings].map(([id, amount]) => ({id, amount, wonAmount: amount - (returns.get(id) || 0), returnedAmount: returns.get(id) || 0, hand: reason === 'showdown' ? hands.get(id) : null})), pots,
        showdown: reason === 'showdown' ? live.map(p => ({id: p.id, hole: p.hole.map(c => ({...c})), hand: hands.get(p.id)})) : [], board: this.board.map(c => ({...c}))};
      for (const p of this.players) { p.bet = 0; p.totalBet = 0; }
      this.gameOver = this.players.filter(p => p.stack > 0).length < 2;
      this._event('result', {result: this.result});
    }
    chooseAIAction() {
      if (this.actor === null || this.actor === 0) throw new Error('No AI is currently acting.');
      const p = this.players[this.actor];
      let highestBet = this.street === 'preflop' ? this.bigBlind : 0, streetRaiseCount = 0, ownRaiseCount = 0;
      for (const event of this.events) {
        if (event.handNumber !== this.handNumber || event.street !== this.street || event.type !== 'action') continue;
        if (event.raiseTo > highestBet) {
          highestBet = event.raiseTo; streetRaiseCount++;
          if (event.playerId === p.id) ownRaiseCount++;
        }
      }
      return chooseFairAction({hole: p.hole.map(c => ({...c})), board: this.board.map(c => ({...c})), legal: this.legalActions(),
        pot: this.pot, opponents: this._live().length - 1, currentBet: this.currentBet, minRaise: this.minRaise, bigBlind: this.bigBlind,
        style:p.name, street: this.street, stack: p.stack, bet: p.bet, streetRaiseCount, ownRaiseCount}, this.random);
    }
    stepAI() { const id = this.actor, decision = this.chooseAIAction(); this.act(id, decision.type, decision.amount); return {playerId: id, ...decision}; }
    snapshot(options = {}) {
      const revealed = new Set(this.result ? this.result.showdown.map(p => p.id) : []);
      return {players: this.players.map(p => ({id: p.id, name: p.name, stack: p.stack, hole: p.id === 0 || options.revealAll || revealed.has(p.id) ? p.hole.map(c => ({...c})) : p.hole.map(() => null), folded: p.folded, allIn: p.allIn, bet: p.bet, totalBet: p.totalBet, lastAction: p.lastAction})),
        board: this.board.map(c => ({...c})), street: this.street, dealer: this.dealer, actor: this.actor, currentBet: this.currentBet, minRaise: this.minRaise, pot: this.pot, handNumber: this.handNumber, result: this.result, gameOver: this.gameOver};
    }
  }
  return {SUITS, CATEGORY_NAMES, RANK_NAMES, cardKey, makeDeck, shuffledDeck, evaluate, compare, analyzeVisible, createVisibleAnalysis, chooseFairAction, Table};
});
