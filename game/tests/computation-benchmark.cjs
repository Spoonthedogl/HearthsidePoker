'use strict';
const {performance}=require('node:perf_hooks');
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const Poker=require('../poker.js');
const Computation=require('../computation.js');
const hole=[{rank:14,suit:'s'},{rank:13,suit:'s'}];
function workerFactory(){
  const thread=new Worker(path.join(__dirname,'../poker-worker.js'));
  const bridge={postMessage:message=>thread.postMessage(message),terminate:()=>thread.terminate()};
  thread.on('message',data=>bridge.onmessage&&bridge.onmessage({data}));thread.on('error',error=>bridge.onerror&&bridge.onerror(error));return bridge;
}
function summary(values){const sorted=[...values].sort((a,b)=>a-b);return {firstMs:values[0],medianMs:sorted[Math.floor(sorted.length/2)],maxMs:sorted[sorted.length-1]};}
async function main(){
  const baseline=[];
  for(let i=0;i<8;i++){const start=performance.now();Poker.analyzeVisible(hole,[],{samples:12000,random:Computation.seeded(71)});baseline.push(performance.now()-start);}
  console.log(JSON.stringify({mode:'synchronous',runs:8,samples:12000,total:summary(baseline),mainThreadTask:summary(baseline)},null,2));
  for(const [mode,options] of [['worker',{workerFactory}],['chunked',{useWorker:false}]]){
    const service=new Computation(options),durations=[];let heartbeatTicks=0;const heartbeat=setInterval(()=>heartbeatTicks++,1);
    try{
      for(let i=0;i<8;i++){const start=performance.now();await service.analyze(hole,[],{samples:12000,seed:71});durations.push(performance.now()-start);}
      console.log(JSON.stringify({mode,runs:8,samples:12000,total:summary(durations),heartbeatTicks,stats:service.getStats()},null,2));
    }finally{clearInterval(heartbeat);service.dispose();}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
