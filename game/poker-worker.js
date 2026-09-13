/* Guide calculations only. Messages contain the player's own cards and the
 * visible board; the worker never receives a Table, opponent hands, or deck.
 * Classic worker works from hosted pages. Restricted file:// hosts fall back
 * to short scheduled batches in computation.js. Node support is for tests.
 */
(function(){
  'use strict';
  var poker,send,listen;
  if(typeof importScripts==='function'){
    importScripts('poker.js');poker=self.Poker;
    send=function(message){self.postMessage(message);};
    listen=function(handler){self.onmessage=function(event){handler(event.data);};};
  }else if(typeof require==='function'){
    poker=require('./poker.js');var port=require('node:worker_threads').parentPort;
    send=function(message){port.postMessage(message);};listen=function(handler){port.on('message',handler);};
  }else return;
  function seeded(seed){return function(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
  listen(function(message){
    if(!message||message.type!=='analyze')return;
    try{
      var result=poker.analyzeVisible(message.hole,message.board,{samples:message.samples,random:seeded(message.seed>>>0)});
      send({id:message.id,result:result});
    }catch(error){send({id:message.id,error:{name:error.name||'Error',message:error.message||'Analysis failed.'}});}
  });
})();
