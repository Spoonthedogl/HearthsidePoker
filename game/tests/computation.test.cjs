'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const Poker=require('../poker.js');
const Computation=require('../computation.js');
const hole=[{rank:14,suit:'s'},{rank:13,suit:'s'}];
const flop=[{rank:12,suit:'s'},{rank:7,suit:'d'},{rank:2,suit:'h'}];
function workerFactory(){
  const worker=new Worker(path.join(__dirname,'../poker-worker.js'));
  const bridge={postMessage:message=>worker.postMessage(message),terminate:()=>worker.terminate()};
  worker.on('message',data=>{if(bridge.onmessage)bridge.onmessage({data});});
  worker.on('error',error=>{if(bridge.onerror)bridge.onerror(error);});
  return bridge;
}
function expected(board,samples=12000){return Poker.analyzeVisible(hole,board,{samples,random:Computation.seeded(71)});}

test('incremental guide preserves original seeded counts and exact runout ordering',()=>{
  const pre=Poker.createVisibleAnalysis(hole,[],{samples:12000,random:Computation.seeded(71)});
  assert.equal(pre.done,false);assert.equal(pre.result,null);
  while(!pre.done)pre.step(37);
  assert.deepEqual(pre.result.rows.map(row=>row.observed),[2226,5191,2705,469,386,773,233,12,5]);
  assert.deepEqual(pre.result,expected([]));
  for(const board of [flop,[...flop,{rank:9,suit:'h'}],[...flop,{rank:9,suit:'h'},{rank:10,suit:'s'}]]){
    const job=Poker.createVisibleAnalysis(hole,board);while(!job.done)job.step(17);
    assert.deepEqual(job.result,expected(board));assert.equal(job.completedRunouts,job.expectedRunouts);
  }
});
test('real worker returns the identical result while the caller remains available',async()=>{
  const service=new Computation({workerFactory});let ticks=0;
  const timer=setInterval(()=>ticks++,1);
  try{
    const result=await service.analyze(hole,[],{samples:12000,seed:71});
    assert.deepEqual(result,expected([]));assert.equal(service.getStats().mode,'worker');assert.equal(service.getStats().lastChunks,0);
    assert(ticks>1,'the caller should service timers while the worker computes');
  }finally{clearInterval(timer);service.dispose();}
});
test('restricted-file fallback yields between batches without sacrificing any runouts',async()=>{
  const service=new Computation({useWorker:false,chunkBudgetMs:1});let ticks=0;
  const timer=setInterval(()=>ticks++,1);
  try{
    const result=await service.analyze(hole,[],{samples:12000,seed:71});
    assert.deepEqual(result,expected([]));assert.equal(service.getStats().mode,'chunked');
    assert(service.getStats().lastChunks>1);assert(ticks>1);
  }finally{clearInterval(timer);service.dispose();}
});
test('worker construction rejection and runtime errors both recover through chunking',async()=>{
  for(const workerFactory of [()=>{throw new Error('SecurityError: file origin');},()=>{
    const worker={postMessage(){setTimeout(()=>worker.onerror({preventDefault(){}}),0);},terminate(){}};return worker;
  }]){
    const service=new Computation({workerFactory});
    try{assert.deepEqual(await service.analyze(hole,flop,{seed:71}),expected(flop));assert.equal(service.getStats().mode,'chunked');assert.equal(service.getStats().workerFailures,1);}
    finally{service.dispose();}
  }
});
test('new requests and invalidation reject old work, ignoring stale responses and errors',async()=>{
  const workers=[];
  const service=new Computation({workerFactory:()=>{const worker={postMessage(message){this.message=message;},terminate(){this.stopped=true;}};workers.push(worker);return worker;}});
  try{
    const first=service.analyze(hole,[],{seed:71});const aborted=assert.rejects(first,{name:'AbortError'});
    const second=service.analyze(hole,flop,{seed:71});await aborted;
    assert(workers[0].stopped);
    workers[0].onmessage({data:{id:workers[1].message.id,result:'stale'}});workers[0].onerror({preventDefault(){}});
    assert.equal(service.getStats().workerFailures,0);
    workers[1].onmessage({data:{id:workers[1].message.id,result:expected(flop)}});
    assert.deepEqual(await second,expected(flop));
    const third=service.analyze(hole,[],{seed:71});const cancelled=assert.rejects(third,{name:'AbortError'});service.invalidate();await cancelled;
    assert.equal(service.getStats().completed,1);
  }finally{service.dispose();}
});
test('identical pending inputs share a promise; payload omits unrelated private fields',async()=>{
  let worker;
  const service=new Computation({workerFactory:()=>worker={postMessage(message){this.message=message;},terminate(){}}});
  try{
    const privateHole=hole.map(c=>({...c,opponentHand:['secret'],deck:'never send'}));
    const first=service.analyze(privateHole,flop,{samples:12000,seed:71,opponents:['secret'],deck:['hidden']});
    assert.equal(first,service.analyze(hole,flop,{samples:12000,seed:71}));
    assert.deepEqual(Object.keys(worker.message).sort(),['board','hole','id','samples','seed','type']);
    assert.deepEqual(worker.message.hole,hole);
    worker.onmessage({data:{id:worker.message.id,result:expected(flop)}});assert.deepEqual(await first,expected(flop));
  }finally{service.dispose();}
});
test('disposed service cannot return a late result or start another request',async()=>{
  const service=new Computation({useWorker:false});
  const promise=service.analyze(hole,[]);const cancelled=assert.rejects(promise,{name:'AbortError'});service.dispose();await cancelled;
  await assert.rejects(service.analyze(hole,[]),/closed/);assert.equal(service.getStats().completed,0);
});
