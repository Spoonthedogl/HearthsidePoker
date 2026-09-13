'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Poker=require('../poker.js');
const {seeded,runScenario}=require('./ai-simulation.cjs');
const cards=text=>text.split(' ').filter(Boolean).map(s=>({rank:({T:10,J:11,Q:12,K:13,A:14})[s[0]]||Number(s[0]),suit:s[1]}));
function view(overrides={}){
  return {hole:cards('As Ah'),board:[],street:'preflop',stack:500,bet:0,pot:15,opponents:3,currentBet:10,minRaise:10,bigBlind:10,streetRaiseCount:0,ownRaiseCount:0,
    legal:{fold:true,check:false,call:10,canRaise:true,minRaiseTo:20,maxRaiseTo:500,allIn:true},...overrides};
}
test('premium preflop hands use small opens and never proactive deep-stack jams',()=>{
  let raises=0;
  for(let seed=1;seed<=80;seed++){
    const d=Poker.chooseFairAction(view(),seeded(seed));
    assert.notEqual(d.type,'allin');
    if(d.type==='raise'){raises++;assert(d.amount>=20&&d.amount<=40);assert.equal(d.amount,25);}
  }
  assert(raises>10,'premium hands should still sometimes open for value');
});
test('a public early raise prevents an AI re-raise even with a premium hand',()=>{
  for(let seed=1;seed<=60;seed++){
    const v=view({pot:90,currentBet:30,minRaise:20,streetRaiseCount:1,legal:{check:false,call:30,canRaise:true,minRaiseTo:50,maxRaiseTo:500}});
    assert(!['raise','allin'].includes(Poker.chooseFairAction(v,seeded(seed)).type));
  }
});
test('real table counts human opening raises, so a modest open cannot start an AI raising loop',()=>{
  for(let seed=1;seed<=40;seed++){
    const t=new Poker.Table({random:seeded(seed)});t.dealer=0;t.newHand();assert.equal(t.actor,0);t.act(0,'raise',25);
    while(!t.result&&t.street==='preflop'){
      assert.notEqual(t.actor,0);const d=t.chooseAIAction();assert(!['raise','allin'].includes(d.type));t.act(t.actor,d.type,d.amount);
    }
    assert.equal(t.players.reduce((n,p)=>n+p.stack,t.pot),2000);
  }
});
test('flop nuts do not turn a pot-sized suggestion into a whole-stack raise',()=>{
  let bets=0;
  for(let seed=1;seed<=40;seed++){
    const v=view({hole:cards('As Ks'),board:cards('Qs Js Ts'),street:'flop',pot:2000,currentBet:0,
      legal:{check:true,call:0,canRaise:true,minRaiseTo:10,maxRaiseTo:500}});
    const d=Poker.chooseFairAction(v,seeded(seed));assert.notEqual(d.type,'allin');
    if(d.type==='raise'){bets++;assert(d.amount<=90);}
  }
  assert(bets>0);
});
test('unaffordable minimum raises fall back to calling rather than inflate a small intended bet',()=>{
  for(let seed=1;seed<=30;seed++){
    const v=view({currentBet:200,minRaise:190,pot:500,legal:{check:false,call:200,canRaise:true,minRaiseTo:390,maxRaiseTo:500}});
    assert(!['raise','allin'].includes(Poker.chooseFairAction(v,seeded(seed)).type));
  }
});
test('genuine short-stack all-in calls remain available',()=>{
  const v=view({stack:5,bet:5,pot:100,legal:{check:false,call:5,canRaise:false,minRaiseTo:20,maxRaiseTo:10,allIn:true}});
  for(let seed=1;seed<=20;seed++)assert.equal(Poker.chooseFairAction(v,seeded(seed)).type,'call');
});
test('weak cards do not make expensive early calls merely because the pot is large',()=>{
  const v=view({hole:cards('7h 2c'),pot:1400,currentBet:500,legal:{check:false,call:500,canRaise:false,minRaiseTo:1000,maxRaiseTo:500,allIn:true}});
  for(let seed=1;seed<=40;seed++)assert.equal(Poker.chooseFairAction(v,seeded(seed)).type,'fold');
});
test('later strong value can still commit a stack, without another raise from the same seat',()=>{
  const v=view({hole:cards('As Ks'),board:cards('Qs Js Ts 2d 3h'),street:'river',stack:100,pot:500,currentBet:0,
    legal:{check:true,call:0,canRaise:true,minRaiseTo:10,maxRaiseTo:100,allIn:true}});
  let jams=0;
  for(let seed=1;seed<=30;seed++){
    if(Poker.chooseFairAction(v,seeded(seed)).type==='allin')jams++;
    assert.equal(Poker.chooseFairAction({...v,ownRaiseCount:1,streetRaiseCount:1},seeded(seed)).type,'check');
  }
  assert(jams>0);
});
test('seeded pacing: fresh stacks reach later betting, continuing stacks never proactively jam early',()=>{
  const fresh=runScenario({sessions:100,handLimit:1});
  assert.equal(fresh.aiProactiveEarlyJamHands,0);assert.equal(fresh.bettingReach.flop,100);
  assert(fresh.bettingReach.river>=95);
  const continuing=runScenario({sessions:20,handLimit:20,smallOpens:true});
  assert.equal(continuing.aiProactiveEarlyJamHands,0);
  assert(continuing.bettingReach.turn/continuing.hands>.90);
  assert(continuing.bettingReach.river/continuing.hands>.90);
});
