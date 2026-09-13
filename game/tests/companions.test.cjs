'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Companions=require('../companions.js');
const visible={paused:false,hidden:false};
const action=(playerId,kind)=>({type:'action',playerId,action:kind});
const seeded=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};

test('dialogue is chance-based and a successful greeting has one speaker',()=>{
  const quiet=new Companions({random:()=>.99});
  assert.equal(quiet.handle(action(1,'check'),visible),false);
  assert.equal(quiet.getState().speakerId,null);
  const chatty=new Companions({random:()=>0});
  assert.equal(chatty.handle({type:'greeting'},visible),true);
  assert.equal(chatty.getState().speakerId,1);
  assert(chatty.getState().visible);
  assert.equal(chatty.handle(action(2,'allin'),visible),false);
  assert.equal(chatty.getState().speakerId,1);
});

test('one global cooldown prevents overlapping bubbles and immediate replies',()=>{
  const c=new Companions({random:()=>0});
  c.handle(action(1,'raise'),visible);
  const duration=c.getState().remainingMs;
  c.tick(duration+1,visible);assert.equal(c.getState().visible,false);
  assert(c.getState().cooldownMs>0);
  assert.equal(c.handle(action(2,'raise'),visible),false);
  c.tick(11000,visible);
  assert.equal(c.handle(action(2,'raise'),visible),true);
  assert.equal(c.getState().speakerId,2);
});

test('bubble duration and cooldown freeze while paused or hidden',()=>{
  const c=new Companions({random:()=>0});c.handle(action(3,'call'),visible);
  const initial=c.getState();
  c.tick(60000,{paused:true,hidden:false});
  assert.equal(c.getState().remainingMs,initial.remainingMs);
  assert.equal(c.getState().cooldownMs,initial.cooldownMs);
  c.tick(60000,{paused:false,hidden:true});
  assert.equal(c.getState().visible,false);
  assert.equal(c.getState().remainingMs,initial.remainingMs);
  c.tick(0,visible);assert.equal(c.getState().visible,true);
  c.tick(100,visible);assert.equal(c.getState().remainingMs,initial.remainingMs-100);
});

test('events received while hidden or paused never become delayed chatter',()=>{
  const c=new Companions({random:()=>0});
  assert.equal(c.handle(action(1,'allin'),{paused:true,hidden:false}),false);
  assert.equal(c.handle(action(2,'raise'),{paused:false,hidden:true}),false);
  c.tick(10000,visible);assert.equal(c.getState().speakerId,null);
});

test('each character exhausts alternatives before repeating, including bag boundaries',()=>{
  const c=new Companions({random:()=>0}),seen=[];
  for(let i=0;i<9;i++){
    assert(c.handle(action(1,'raise'),visible));seen.push(c.getState().line);c.tick(12000,visible);
  }
  for(let i=0;i<9;i+=3)assert.equal(new Set(seen.slice(i,i+3)).size,3);
  for(let i=1;i<seen.length;i++)assert.notEqual(seen[i],seen[i-1]);
  c.clear();assert.equal(c.getState().speakerId,null);
});

test('new hands clear stale dialogue, greet only funded participants, and reset clears immediately',()=>{
  const c=new Companions({random:()=>0});c.handle(action(1,'fold'),visible);
  const old=c.getState().line;
  c.handle({type:'hand-start',participantIds:[0,2]},visible);
  assert.equal(c.getState().speakerId,2);assert.notEqual(c.getState().line,old);
  c.clear();assert.deepEqual(c.getState(),{speakerId:null,line:'',visible:false,remainingMs:0,cooldownMs:0});
});

test('public all-in calls use all-in personality lines; human all-ins get only one reaction',()=>{
  const c=new Companions({random:()=>0});
  assert(c.handle({...action(3,'call'),allIn:true},visible));
  assert.match(c.getState().line,/teapot|leaf|cup/);
  c.clear();assert(c.handle({...action(0,'raise'),allIn:true},visible));
  assert(c.getState().speakerId>=1&&c.getState().speakerId<=3);
});

test('same public events produce identical dialogue regardless of unrelated private fields',()=>{
  const a=new Companions({random:seeded(471)}),b=new Companions({random:seeded(471)});
  for(let i=0;i<100;i++){
    const event=action(i%3+1,['check','call','raise','fold','allin'][i%5]);
    a.handle(event,visible);
    b.handle({...event,hole:[{rank:14,suit:'s'}],deck:['not accessible'],futureWinner:2},visible);
    assert.deepEqual(a.getState(),b.getState());a.tick(12000,visible);b.tick(12000,visible);
  }
});
