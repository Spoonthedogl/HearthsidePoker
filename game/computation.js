/* Responsive hand journal computation.
 * Load after poker.js, before app.js. new HearthComputation(options?)
 * .analyze(hole,visibleBoard,{samples:12000,seed?,key?}) -> Promise<analysis>
 * .invalidate() cancels outstanding work; .dispose() also closes the worker.
 * Cancellations reject with error.name === 'AbortError'. Same pending inputs
 * share a promise. Different inputs invalidate the old request automatically.
 * Caller still checks its hand/version token before updating its own UI.
 * .getStats() exposes timings/mode for QA, never private game state.
 *
 * Direct local-file workers can be blocked by CEF/Chromium. A blocked, failed,
 * or unresponsive worker automatically switches to the identical incremental
 * Poker calculation in small setTimeout batches, without reducing accuracy.
 * AI remains synchronous: measured at <1ms here, it needs no worker roundtrip.
 */
(function(root,factory){
  var poker=typeof module==='object'&&module.exports?require('./poker.js'):root.Poker;
  var api=factory(root,poker);if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HearthComputation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root,Poker){
  'use strict';
  var scriptURL=root.document&&root.document.currentScript&&root.document.currentScript.src;
  function now(){return root.performance&&root.performance.now?root.performance.now():Date.now();}
  function abort(){var error=new Error('Analysis superseded.');error.name='AbortError';return error;}
  function seeded(seed){return function(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
  function copyCards(cards){if(!Array.isArray(cards))throw new Error('Expected visible cards.');return cards.map(function(c){return {rank:c.rank,suit:c.suit};});}
  function cardsKey(hole,board){return hole.concat(board).map(Poker.cardKey).join(',');}
  function seedFromKey(key){var seed=1;key.split('').forEach(function(c){seed=(seed*31+c.charCodeAt(0))>>>0;});return seed;}
  function HearthComputation(options){
    this.options=options||{};this.worker=null;this.pending=null;this.nextId=0;this.generation=0;this.disposed=false;
    this.workerBlocked=this.options.useWorker===false;this.workerTimer=null;this.chunkTimer=null;
    this.stats={mode:'idle',jobs:0,completed:0,cancelled:0,workerFailures:0,maxMainThreadMs:0,maxChunkMs:0,lastTotalMs:0,lastChunks:0};
  }
  HearthComputation.key=cardsKey;
  HearthComputation.seeded=seeded;
  HearthComputation.prototype.getStats=function(){return Object.assign({},this.stats);};
  HearthComputation.prototype._timed=function(start){this.stats.maxMainThreadMs=Math.max(this.stats.maxMainThreadMs,now()-start);};
  HearthComputation.prototype._stopWorker=function(){if(this.worker){this.worker.terminate();this.worker=null;}clearTimeout(this.workerTimer);this.workerTimer=null;};
  HearthComputation.prototype.invalidate=function(){
    this.generation++;clearTimeout(this.chunkTimer);this.chunkTimer=null;
    if(this.pending){var old=this.pending;this.pending=null;this.stats.cancelled++;this._stopWorker();old.reject(abort());}
  };
  HearthComputation.prototype.dispose=function(){this.invalidate();this._stopWorker();this.disposed=true;};
  HearthComputation.prototype._isCurrent=function(request){return this.pending===request&&request.generation===this.generation&&!this.disposed;};
  HearthComputation.prototype._finish=function(request,result,error){
    if(!this._isCurrent(request))return;
    clearTimeout(this.workerTimer);this.workerTimer=null;this.pending=null;
    this.stats.lastTotalMs=now()-request.started;this.stats.lastChunks=request.chunks;
    if(error)request.reject(error);else{this.stats.completed++;request.resolve(result);}
  };
  HearthComputation.prototype._fallback=function(request){
    if(!this._isCurrent(request))return;
    this.stats.mode='chunked';var self=this;
    // Initialize only on the next task, so opening the journal can paint first.
    function chunk(){
      if(!self._isCurrent(request))return;
      var start=now();
      try{
        if(!request.task)request.task=Poker.createVisibleAnalysis(request.hole,request.board,{samples:request.samples,random:seeded(request.seed)});
        var completed=0,budget=Math.max(1,Math.min(8,Number(self.options.chunkBudgetMs)||4));
        do{request.task.step(32);completed+=32;}while(!request.task.done&&completed<1024&&now()-start<budget);
        request.chunks++;var elapsed=now()-start;self.stats.maxChunkMs=Math.max(self.stats.maxChunkMs,elapsed);self._timed(start);
        if(request.task.done){self._finish(request,request.task.result);return;}
        self.chunkTimer=setTimeout(chunk,0);
      }catch(error){self._timed(start);self._finish(request,null,error);}
    }
    this.chunkTimer=setTimeout(chunk,0);
  };
  // A slow device can miss the watchdog on a job the worker would have
  // finished, so one timeout retires the worker for that job only. Repeated
  // failures mean it is genuinely blocked, and then we stop asking.
  HearthComputation.prototype._workerFailed=function(request){
    if(!this._isCurrent(request))return;
    this.stats.workerFailures++;
    if(this.stats.workerFailures>=(Number(this.options.workerFailureLimit)||2))this.workerBlocked=true;
    this._stopWorker();this._fallback(request);
  };
  HearthComputation.prototype._dispatch=function(request){
    var self=this;
    if(this.workerBlocked||(!this.options.workerFactory&&typeof root.Worker!=='function')){this._fallback(request);return;}
    try{
      if(!this.worker){
        var workerURL=this.options.workerURL||'poker-worker.js';
        if(!this.options.workerURL&&root.URL&&root.document)workerURL=new root.URL('poker-worker.js',scriptURL||root.document.baseURI).href;
        this.worker=this.options.workerFactory?this.options.workerFactory(workerURL):new root.Worker(workerURL);
        var activeWorker=this.worker;
        this.worker.onmessage=function(event){
          if(self.worker!==activeWorker)return;
          var pending=self.pending,data=event.data;if(!pending||!data||data.id!==pending.id)return;
          if(data.error){var error=new Error(data.error.message);error.name=data.error.name||'Error';self._finish(pending,null,error);}
          else self._finish(pending,data.result);
        };
        this.worker.onerror=function(event){if(event&&event.preventDefault)event.preventDefault();if(self.worker===activeWorker&&self.pending)self._workerFailed(self.pending);};
      }
      this.stats.mode='worker';
      // Strict whitelist: no caller object, hidden cards, or real deck crosses.
      this.worker.postMessage({type:'analyze',id:request.id,hole:request.hole,board:request.board,samples:request.samples,seed:request.seed});
      this.workerTimer=setTimeout(function(){self._workerFailed(request);},Math.max(100,Number(this.options.workerTimeoutMs)||1500));
    }catch(error){this._workerFailed(request);}
  };
  HearthComputation.prototype.analyze=function(hole,board,options){
    if(this.disposed)return Promise.reject(new Error('Computation service is closed.'));
    var start=now(),self=this;options=options||{};
    try{
      hole=copyCards(hole);board=copyCards(board);
      var key=cardsKey(hole,board),seed=Number.isFinite(options.seed)?options.seed>>>0:seedFromKey(key);
      var samples=Math.max(100,Math.min(100000,Math.floor(Number(options.samples)||12000)));
      var fingerprint=key+'|'+samples+'|'+seed+'|'+(options.key||'');
      if(this.pending&&this.pending.fingerprint===fingerprint){this._timed(start);return this.pending.promise;}
      this.invalidate();
      var request={id:++this.nextId,generation:this.generation,fingerprint:fingerprint,hole:hole,board:board,seed:seed,samples:samples,started:now(),chunks:0};
      request.promise=new Promise(function(resolve,reject){request.resolve=resolve;request.reject=reject;});this.pending=request;this.stats.jobs++;
      this._dispatch(request);this._timed(start);return request.promise;
    }catch(error){this._timed(start);return Promise.reject(error);}
  };
  return HearthComputation;
});
