'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../poker.js');
const cards = text => text.split(/\s+/).filter(Boolean).map(s => ({rank: ({T:10,J:11,Q:12,K:13,A:14})[s[0]] || Number(s[0]), suit:s[1]}));
const hand = text => P.evaluate(cards(text));
const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const chips = table => table.players.reduce((n,p) => n + p.stack, table.pot);

test('deck is 52 distinct standard cards and shuffle preserves them', () => {
  const deck = P.makeDeck(), shuffled = P.shuffledDeck(seeded(99));
  assert.equal(deck.length, 52); assert.equal(new Set(deck.map(P.cardKey)).size, 52);
  assert.deepEqual(new Set(shuffled.map(P.cardKey)), new Set(deck.map(P.cardKey)));
  assert.notDeepEqual(shuffled, deck);
});

test('all nine hand categories and royal naming', () => {
  const examples = ['As Qd 9c 6h 3s', 'As Ad 9c 6h 3s', 'As Ad 9c 9h 3s', 'As Ad Ac 6h 3s', '9s 8d 7c 6h 5s', 'As Js 9s 6s 3s', 'As Ad Ac 6h 6s', 'As Ad Ac Ah 3s', '9s 8s 7s 6s 5s'];
  examples.forEach((h, category) => { assert.equal(hand(h).category, category, h); assert.equal(hand(h).bestCards.length, 5); });
  assert.equal(hand('As Ks Qs Js Ts 3h 2d').name, 'Royal Flush');
});

test('ace-low straights and straight flushes use five-high, no wrapping', () => {
  assert.deepEqual(hand('As 2d 3h 4c 5s Kh Qs').tiebreak, [5]);
  assert.deepEqual(hand('As 2s 3s 4s 5s Kh Qs').tiebreak, [5]);
  assert.equal(hand('As 2d 3h 4c 5s 6h 7d').tiebreak[0], 7);
  assert.equal(hand('Qs Kh As 2h 3s').category, 0);
  assert(P.compare(hand('2s 3d 4h 5c 6s'), hand('As 2d 3h 4c 5s')) > 0);
});

test('seven cards select correct two trips, three pairs, flush, and kicker', () => {
  assert.deepEqual(hand('As Ah Ac Ks Kh Kc 2s').tiebreak, [14, 13]);
  assert.deepEqual(hand('As Ah Ks Kh Qs Qh 2s').tiebreak, [14, 13, 12]);
  assert.deepEqual(hand('As Ks Js 9s 6s 3s 2s').tiebreak, [14, 13, 11, 9, 6]);
  assert.deepEqual(hand('9s 9h 9d 9c As Kd 2h').tiebreak, [9, 14]);
  assert.deepEqual(hand('8s 8h 8d As Ks Qd 2h').tiebreak, [8, 14, 13]);
});

test('suits never break ties, board can play, partial hands are useful', () => {
  assert.equal(P.compare(hand('As Kd Qc Jh Ts'), hand('Ah Ks Qd Jc Th')), 0);
  const board = cards('As Ks Qs Js Ts');
  assert.equal(P.compare(P.evaluate([...cards('2d 3c'), ...board]), P.evaluate([...cards('Ah Ad'), ...board])), 0);
  assert.deepEqual(hand('As Ah').tiebreak, [14]);
  assert.equal(hand('As Ah').category, 1);
  assert.equal(hand('As Qh').category, 0);
  assert.equal(P.evaluate([]).bestCards.length, 0);
  assert.throws(() => hand('As As'), /Duplicate/);
  assert.throws(() => P.evaluate([{rank:1,suit:'s'}]), /Invalid/);
});

// Independent five-card reference: frequency signature and arithmetic runs.
function referenceFive(cs) {
  const ranks = cs.map(c => c.rank).sort((a,b) => b-a);
  const freq = {};
  ranks.forEach(r => freq[r] = (freq[r] || 0)+1);
  const groups = Object.keys(freq).map(Number).sort((a,b) => freq[b]-freq[a] || b-a);
  const signature = groups.map(r => freq[r]).join('');
  const flush = cs.every(c => c.suit === cs[0].suit);
  const straight = new Set(ranks).size === 5 && ranks[0]-ranks[4] === 4 ? ranks[0] : ranks.join(',') === '14,5,4,3,2' ? 5 : 0;
  if (flush && straight) return {category:8,tiebreak:[straight]};
  if (signature === '41') return {category:7,tiebreak:groups};
  if (signature === '32') return {category:6,tiebreak:groups};
  if (flush) return {category:5,tiebreak:ranks};
  if (straight) return {category:4,tiebreak:[straight]};
  return {category:({'311':3,'221':2,'2111':1})[signature] || 0,tiebreak:groups};
}
test('20,000 seeded seven-card evaluations match independent exhaustive best-of-21', () => {
  const random = seeded(479);
  for (let t=0;t<20000;t++) {
    const cs = P.shuffledDeck(random).slice(0,7);
    let best = {category:-1,tiebreak:[]};
    for(let a=0;a<3;a++) for(let b=a+1;b<4;b++) for(let c=b+1;c<5;c++) for(let d=c+1;d<6;d++) for(let e=d+1;e<7;e++) {
      const candidate = referenceFive([cs[a],cs[b],cs[c],cs[d],cs[e]]);
      if(P.compare(candidate,best)>0) best=candidate;
    }
    const actual=P.evaluate(cs);
    assert.equal(P.compare(actual,best),0,cs.map(P.cardKey).join(' '));
    assert.equal(P.compare(referenceFive(actual.bestCards),best),0);
  }
});

test('guide: exact turn flush outs and total probability', () => {
  const guide = P.analyzeVisible(cards('As Ks'),cards('Qs 7s 2d 9h'));
  assert.equal(guide.exact,true); assert.equal(guide.totalRunouts,46);
  assert.equal(guide.rows[5].outs.length,9);
  assert.equal(guide.rows[5].probability,9/46);
  assert(Math.abs(guide.rows.reduce((sum,r)=>sum+r.probability,0)-1)<1e-12);
  assert(!guide.improvingOuts.includes('14s'));
  assert.equal(guide.rows[4].probability,0);
});

test('guide: exact flop enumerates all 1,081 visible runouts and backdoor categories', () => {
  const guide=P.analyzeVisible(cards('As Ks'),cards('Qs 7d 2h'));
  assert.equal(guide.totalRunouts,1081); assert.equal(guide.exact,true);
  assert(guide.rows[5].probability>0); // Backdoor spades.
  assert.equal(guide.rows[5].outs.length,0); // Cannot make the flush on the next card alone.
  assert(guide.rows[8].probability>0); // Js + Ts royal backdoor.
  assert.equal(guide.rows[8].probability,1/1081);
  assert(guide.explanation.includes('not win odds'));
});

test('guide river is certain; preflop is labelled sampled, never falsely impossible', () => {
  const river=P.analyzeVisible(cards('2d 3c'),cards('As Ks Qs Js Ts'));
  assert.equal(river.totalRunouts,1); assert.equal(river.rows[8].probability,1);
  assert.equal(river.improvingOuts.length,0);
  const pre=P.analyzeVisible(cards('As Ah'),[],{samples:800,random:seeded(5)});
  assert.equal(pre.exact,false); assert.equal(pre.totalRunouts,800);
  assert(pre.sampleLabel.startsWith('Estimate'));
  assert.equal(pre.rows[0].possible,false);
  assert(pre.rows.slice(1).every(r=>r.possible===true));
  assert.equal(pre.rows[0].probability,0);
  const unpaired=P.analyzeVisible(cards('As Kh'),[],{samples:100,random:()=>0.5});
  assert(unpaired.rows.every(r=>r.possible===true));
  assert(unpaired.rows.some(r=>r.observed===0&&r.possible));
});

test('guide examples match their category and distinguish visible cards from complete hypothetical runouts', () => {
  const cases = [
    ['As Ks',''], ['9h 9c',''], ['7d 2h',''],
    ['As Ks','Qs 7d 2h'], ['As Ah','Ad 7d 2h'],
    ['As Ks','Qs 7s 2d 9h'], ['2d 3c','As Ks Qs Js Ts']
  ];
  for (const [holeText,boardText] of cases) {
    const hole=cards(holeText),board=cards(boardText),known=[...hole,...board];
    const visibleKeys=new Set(known.map(P.cardKey));
    const guide=P.analyzeVisible(hole,board,{samples:2400,random:seeded(84)});
    for (const row of guide.rows) {
      if(row.observed===0) {assert.equal(row.example,null);continue;}
      const ex=row.example,completed=[...known,...ex.futureBoard];
      assert.equal(ex.futureBoard.length,5-board.length);
      assert.equal(ex.bestCards.length,5);
      assert.equal(new Set(completed.map(P.cardKey)).size,7);
      assert.equal(P.evaluate(completed).category,row.category);
      assert.equal(P.evaluate(ex.bestCards).category,row.category);
      assert.equal(P.compare(P.evaluate(ex.bestCards),P.evaluate(completed)),0);
      assert(ex.futureBoard.every(c=>!visibleKeys.has(P.cardKey(c))));
      const bestKeys=new Set(ex.bestCards.map(P.cardKey));
      assert.deepEqual(ex.usedHoleKeys,hole.filter(c=>bestKeys.has(P.cardKey(c))).map(P.cardKey));
      assert.deepEqual(ex.usedBoardKeys,board.filter(c=>bestKeys.has(P.cardKey(c))).map(P.cardKey));
      assert.deepEqual(ex.neededCards,ex.futureBoard.filter(c=>bestKeys.has(P.cardKey(c))));
    }
  }
  const royal=P.analyzeVisible(cards('As Ks'),cards('Qs 7d 2h')).rows[8].example;
  assert.deepEqual(new Set(royal.neededCards.map(P.cardKey)),new Set(['10s','11s']));
  assert.deepEqual(royal.usedHoleKeys,['14s','13s']);
  assert.deepEqual(royal.usedBoardKeys,['12s']);
});

test('initial blinds, turn order, illegal actions are atomic', () => {
  const table=new P.Table({random:seeded(100)}); table.newHand();
  assert.equal(table.dealer,0); assert.equal(table.actor,3); assert.equal(table.pot,15);
  assert.equal(table.players[1].bet,5); assert.equal(table.players[2].bet,10);
  const before=JSON.stringify(table.snapshot({revealAll:true}));
  assert.throws(()=>table.act(0,'fold'),/turn/);
  assert.throws(()=>table.act(3,'check'),/check/);
  assert.throws(()=>table.act(3,'raise',15),/minimum/);
  assert.throws(()=>table.act(3,'raise',501),/Invalid/);
  assert.throws(()=>table.act(3,'raise',20.5),/Invalid/);
  assert.equal(JSON.stringify(table.snapshot({revealAll:true})),before);
  assert.equal(chips(table),2000);
});

test('big blind retains option, street order and dealer rotation are correct', () => {
  const t=new P.Table({random:seeded(8)}); t.newHand();
  t.act(3,'call');t.act(0,'call');t.act(1,'call');
  assert.equal(t.actor,2);assert.equal(t.street,'preflop');assert(t.legalActions().check);
  t.act(2,'check');assert.equal(t.street,'flop');assert.equal(t.board.length,3);assert.equal(t.actor,1);
  while(!t.result) t.act(t.actor,t.legalActions().check?'check':'call');
  assert.equal(t.board.length,5);assert.equal(chips(t),2000);assert.equal(t.pot,0);
  t.newHand();assert.equal(t.dealer,1);assert.equal(t.actor,0);
});

test('heads-up dealer posts small blind, acts first preflop and last postflop', () => {
  const t=new P.Table({random:seeded(2)}); t.players[1].stack=0;t.players[3].stack=0;t.newHand();
  assert.equal(t.dealer,0);assert.equal(t.players[0].bet,5);assert.equal(t.players[2].bet,10);assert.equal(t.actor,0);
  t.act(0,'call');t.act(2,'check');assert.equal(t.actor,2);
});

test('fold victory pays contributions and does not reveal unshown hands', () => {
  const t=new P.Table({random:seeded(3)});t.newHand();
  t.act(3,'fold');t.act(0,'fold');t.act(1,'fold');
  assert.equal(t.result.reason,'fold');assert.equal(t.result.totalPot,15);
  assert.deepEqual(t.result.winners.map(w=>w.id),[2]);assert.equal(t.players[2].stack,505);
  assert.equal(t.result.winners[0].hand,null);
  assert.deepEqual(t.snapshot().players[2].hole,[null,null]);assert.equal(chips(t),2000);
});

test('short all-in does not reopen a previous raise or call', () => {
  const t=new P.Table({random:seeded(4)});t.players[1].stack=35;t.newHand();
  t.act(3,'raise',30);t.act(0,'call');t.act(1,'allin');t.act(2,'call');
  assert.equal(t.actor,3);assert.equal(t.currentBet,35);assert.equal(t.minRaise,20);
  assert.equal(t.legalActions().canRaise,false);assert.equal(t.legalActions().call,5);
  assert.throws(()=>t.act(3,'allin'),/reopened/);assert.throws(()=>t.act(3,'raise',55),/available/);
  t.act(3,'call');assert.equal(t.actor,0);assert.equal(t.legalActions().canRaise,false);
  t.act(0,'call');assert.equal(t.street,'flop');
});

test('cumulative short all-ins reopen action once they total a full raise', () => {
  const t=new P.Table({random:seeded(5)});t.players[1].stack=40;t.players[2].stack=50;t.newHand();
  t.act(3,'raise',30);t.act(0,'call');t.act(1,'allin');t.act(2,'allin');
  assert.equal(t.actor,3);assert.equal(t.currentBet,50);assert.equal(t.minRaise,20);
  assert.equal(t.legalActions().canRaise,true);assert.equal(t.legalActions().minRaiseTo,70);
  t.act(3,'raise',70);assert.equal(t.legalActions(0).canRaise,true);
});

test('a check is not reopened by an opening all-in smaller than the minimum bet', () => {
  const t=new P.Table({random:seeded(6)});t.players[0].stack=15;t.newHand();
  while(t.street==='preflop') t.act(t.actor,t.legalActions().check?'check':'call');
  t.act(1,'check');t.act(2,'check');t.act(3,'check');t.act(0,'allin');
  assert.equal(t.actor,1);assert.equal(t.currentBet,5);assert.equal(t.legalActions().canRaise,false);
  assert.equal(t.legalActions().call,5);
});

test('short stack can call all-in, complete automatic runout conserves chips', () => {
  const t=new P.Table({random:seeded(7)});t.players[0].stack=30;t.players[1].stack=50;t.players[2].stack=100;
  const total=chips(t);t.newHand();t.act(3,'allin');
  assert.equal(t.legalActions().call,30);t.act(0,'call');t.act(1,'call');t.act(2,'call');
  assert(t.result);assert.equal(t.board.length,5);assert.equal(chips(t),total);
  assert.equal(t.result.pots.length,4);assert(t.result.pots[3].uncalled);
  assert.equal(t.result.winners.find(w=>w.id===3).returnedAmount,400);
});

test('lone remaining stack has call/fold only and cannot bet into a dry side pot', () => {
  const t=new P.Table({random:seeded(8)});t.players[0].stack=20;t.players[1].stack=20;t.players[2].stack=20;t.newHand();
  t.act(3,'call');t.act(0,'allin');t.act(1,'call');t.act(2,'call');
  assert.equal(t.actor,3);assert.equal(t.legalActions().canRaise,false);assert.equal(t.legalActions().allIn,false);
  t.act(3,'call');assert(t.result);assert.equal(t.board.length,5);
});

test('heads-up short big blind needs no unmatched call from the small blind', () => {
  const t=new P.Table({random:seeded(19)});t.players[1].stack=3;t.players[2].stack=0;t.players[3].stack=0;
  t.newHand();assert(t.result);assert.equal(t.board.length,5);
  assert.equal(t.result.totalPot,8);assert.equal(chips(t),503);
});

function payoutFixture(contributions, holes, board, folded=[]) {
  const t=new P.Table({random:seeded(10)});t.newHand();t.board=cards(board);
  t.players.forEach((p,i)=>Object.assign(p,{hole:cards(holes[i]),totalBet:contributions[i],bet:contributions[i],stack:500-contributions[i],folded:folded.includes(i)}));
  t._award('showdown');return t;
}
test('main and side pots have independent eligible winners and uncalled returns', () => {
  const t=payoutFixture([50,100,200,200],['As Ah','Ks Kh','Qs Qh','Js Jh'],'2s 3d 4c 8h 9s');
  assert.deepEqual(t.result.pots.map(p=>p.amount),[200,150,200]);
  assert.deepEqual(t.result.pots.map(p=>p.winners),[[0],[1],[2]]);
  assert.deepEqual(t.players.map(p=>p.stack),[650,550,500,300]);assert.equal(chips(t),2000);
});
test('folded hands cannot win, but their contributions stay in each pot', () => {
  const t=payoutFixture([50,100,200,200],['As Ah','Ks Kh','Qs Qh','Js Jh'],'2s 3d 4c 8h 9s',[0,2]);
  assert.deepEqual(t.result.pots.map(p=>p.winners),[[1],[1],[3]]);assert.equal(chips(t),2000);
});
test('tied pot odd chips go clockwise starting left of dealer', () => {
  const t=payoutFixture([11,11,11,0],['2d 3c','4d 5c','6d 7c','8d 9c'],'As Ks Qs Js Ts',[2,3]);
  assert.equal(t.dealer,0);assert.equal(t.result.totalPot,33);
  assert.deepEqual(t.result.winners.map(w=>[w.id,w.amount]),[[1,17],[0,16]]);assert.equal(chips(t),2000);
});

test('fair AI cannot depend on real hidden hole cards or deck order', () => {
  const t=new P.Table({random:seeded(220)});t.newHand();assert.equal(t.actor,3);
  t.random=seeded(111);const first=t.chooseAIAction();
  // Change all unavailable data while preserving the acting seat's information.
  t.players[0].hole=cards('As Ah');t.players[1].hole=cards('Ks Kh');t.players[2].hole=cards('Qs Qh');
  t.deck.reverse();t.random=seeded(111);
  assert.deepEqual(t.chooseAIAction(),first);
});

test('400 seeded random-action hands terminate, preserve chips, and keep cards unique', () => {
  let actions=0;
  for(let seed=1;seed<=20;seed++) {
    const random=seeded(seed);let t=new P.Table({random});
    for(let h=0;h<20;h++) {
      if(t.gameOver) t=new P.Table({random});
      assert(t.newHand());
      let safety=0;
      while(!t.result) {
        assert.equal(chips(t),2000);
        assert(t.players.every(p=>Number.isInteger(p.stack)&&p.stack>=0));
        assert(++safety<200,'hand failed to terminate');
        const legal=t.legalActions(), roll=random();
        if(legal.canRaise && roll<0.10) t.act(t.actor,'allin');
        else if(legal.canRaise && legal.maxRaiseTo>=legal.minRaiseTo && roll<0.24) {
          const n=legal.minRaiseTo+Math.floor(random()*(legal.maxRaiseTo-legal.minRaiseTo+1));t.act(t.actor,'raise',n);
        } else if(!legal.check && roll<0.39) t.act(t.actor,'fold');
        else t.act(t.actor,legal.check?'check':'call');
        actions++;
      }
      assert.equal(chips(t),2000);
      const dealt=[...t.board,...t.players.flatMap(p=>p.hole)];
      assert.equal(new Set(dealt.map(P.cardKey)).size,dealt.length);
      assert.equal(t.result.winners.reduce((n,w)=>n+w.amount,0),t.result.totalPot);
    }
  }
  assert(actions>1000);
});

test('real AI steps remain legal through 30 seeded games', () => {
  for(let seed=1;seed<=30;seed++) {
    const t=new P.Table({random:seeded(seed*41)});t.newHand();let safety=0;
    while(!t.result) {
      assert(++safety<200);
      if(t.actor===0) t.act(0,t.legalActions().check?'check':'call');
      else t.stepAI();
    }
    assert.equal(chips(t),2000);
  }
});
