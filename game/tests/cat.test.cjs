'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Cat = require('../cat.js');
const awake = {hidden:false,paused:false,gentle:false};

function advance(cat, ms, context=awake) {
  while (ms > 0) { const delta=Math.min(50,ms);cat.tick(delta,context);ms-=delta; }
}
function draws(values, fallback=0.99) {
  return () => values.length ? values.shift() : fallback;
}

test('first opportunity waits 35–65 seconds; rejected checks wait 20–35 seconds', () => {
  const cat=new Cat({random:draws([0.5,0.22,0.5,0.219,0.02,0])});
  assert.deepEqual(cat.getState(),{action:'sleep',frame:0,nextCheckMs:50000});
  advance(cat,49950);assert.equal(cat.getState().action,'sleep');
  advance(cat,50);assert.deepEqual(cat.getState(),{action:'sleep',frame:0,nextCheckMs:27500});
  advance(cat,27500);assert.equal(cat.getState().action,'stretch');
  assert.equal(cat.getState().nextCheckMs,20000);
});

test('stretch, groom and watch use the full intended frame sequences in 5–8 seconds', () => {
  const cases={
    stretch:{frames:[0,1,2,1,7,0],duration:5600},
    groom:{frames:[0,3,4,3,4,3,4,3,7,0],duration:5500},
    watch:{frames:[0,5,6,5,7,0],duration:7000}
  };
  for (const [action,expected] of Object.entries(cases)) {
    const frames=[],cat=new Cat({random:()=>0,onFrame:frame=>frames.push(frame)});
    assert(cat.play(action));
    advance(cat,expected.duration-50);assert.equal(cat.getState().action,action);
    advance(cat,50);assert.equal(cat.getState().action,'sleep');
    assert.deepEqual(frames,expected.frames,action);
    assert.equal(cat.getState().nextCheckMs,20000,'sleep countdown waits until action completes');
  }
});

test('automatic actions never immediately repeat and do not follow poker events', () => {
  const starts=[],cat=new Cat({random:()=>0.02,onFrame:(frame,state)=>{
    if(frame===0&&state.action!=='sleep')starts.push(state.action);
  }});
  advance(cat,150000);
  assert(starts.length>=4);
  for(let i=1;i<starts.length;i++)assert.notEqual(starts[i],starts[i-1]);
  assert.deepEqual(starts.slice(0,4),['stretch','groom','stretch','groom']);
});

test('hidden and modal intervals freeze rest and active poses without catchup on resume', () => {
  for(const context of [{hidden:true},{paused:true}]) {
    const cat=new Cat({random:()=>0});
    advance(cat,1200);const rest=cat.getState();
    advance(cat,100000,context);assert.deepEqual(cat.getState(),rest);
    cat.tick(100000,awake);assert.deepEqual(cat.getState(),rest);
    advance(cat,50);assert.equal(cat.getState().nextCheckMs,rest.nextCheckMs-50);
    cat.play('stretch');advance(cat,300);const pose=cat.getState();
    advance(cat,100000,context);assert.deepEqual(cat.getState(),pose);
    assert.equal(cat.play('watch'),false);
    cat.tick(100000,awake);assert.deepEqual(cat.getState(),pose);
    advance(cat,750);assert.equal(cat.getState().frame,1);
    advance(cat,50);assert.equal(cat.getState().frame,2);
  }
});

test('gentle motion returns to sleep, freezes time and never resumes an old action', () => {
  const frames=[],cat=new Cat({random:()=>0,onFrame:frame=>frames.push(frame)});
  cat.play('watch');advance(cat,1300);assert.equal(cat.getState().frame,6);
  cat.tick(50,{gentle:true});const resting=cat.getState();
  assert.deepEqual(resting,{action:'sleep',frame:0,nextCheckMs:20000});
  const calls=frames.length;
  advance(cat,120000,{gentle:true});assert.deepEqual(cat.getState(),resting);
  assert.equal(frames.length,calls);assert.equal(cat.play('groom'),false);
  cat.tick(120000,awake);assert.deepEqual(cat.getState(),resting);
  advance(cat,1000);assert.deepEqual(cat.getState(),{action:'sleep',frame:0,nextCheckMs:19000});
});

test('large or invalid deltas cannot create animation bursts or queued opportunities', () => {
  const frames=[],cat=new Cat({random:()=>0,onFrame:frame=>frames.push(frame)});
  const initial=cat.getState();
  for(const bad of [NaN,Infinity,-Infinity,-1,0,undefined])cat.tick(bad,awake);
  assert.deepEqual(cat.getState(),initial);
  cat.tick(3600000,awake);assert.equal(cat.getState().nextCheckMs,34750);
  assert.equal(frames.length,0);
  cat.play('groom');const before=frames.length;
  cat.tick(3600000,awake);assert.equal(frames.length,before+1);
  assert.equal(cat.getState().frame,3);
  assert.equal(cat.getState().nextCheckMs,20000);
});

test('state snapshots are isolated; callbacks carry usable atlas frames and valid actions', () => {
  const seen=[],cat=new Cat({random:()=>0,onFrame:(frame,state)=>seen.push({frame,state})});
  const initial=cat.getState();initial.frame=7;initial.nextCheckMs=0;
  assert.equal(cat.getState().frame,0);assert.equal(cat.getState().nextCheckMs,35000);
  assert.equal(cat.play('unknown'),false);assert.equal(cat.play('constructor'),false);
  assert.equal(cat.play('sleep'),false);
  cat.play('watch');advance(cat,7000);
  for(const {frame,state} of seen){assert(frame>=0&&frame<=7);assert.equal(frame,state.frame);}
  assert.deepEqual(seen.at(-1).state,{action:'sleep',frame:0,nextCheckMs:20000});
});

test('default scheduling spends most of ten minutes asleep', () => {
  let seed=1325,active=0,starts=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const cat=new Cat({random,onFrame:(frame,state)=>{if(frame===0&&state.action!=='sleep')starts++;}});
  for(let ms=0;ms<600000;ms+=100){cat.tick(100,awake);if(cat.getState().action!=='sleep')active+=100;}
  assert(starts>=1&&starts<=10,`action count ${starts}`);
  assert(active<60000,`active milliseconds ${active}`);
});
