/* Original Hearthside companion dialogue. No poker state, cards, or deck access.
 * new HearthCompanions({random?,onChange?}); handle(publicEvent,context?);
 * tick(elapsedMs,{paused,hidden}); clear(); getState().
 * Events: greeting, hand-start, action {playerId,action,allIn?}, and
 * result {winnerIds:[public winning seat ids]}. One speaker at a time.
 * State: {speakerId,line,visible,remainingMs,cooldownMs}.
 * Dialogue time and cooldown stop while a modal is open or the app is hidden.
 * Events arriving while paused/hidden are discarded, never queued to pile up.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HearthCompanions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var lines={
    1:{
      greeting:['A new chapter. Save me a twist.','Every good tale needs a little mischief.','Pull up a chair. The story’s starting.'],
      fold:['I’ll leave this chapter to you.','A dramatic exit. Very tasteful.','The plot can manage without me.'],
      check:['A pause for dramatic effect.','Go on. I’m listening.','Let’s give the story some room.'],
      call:['Well, now I’m curious.','I can’t leave a tale unfinished.','One more page, then.'],
      raise:['A little twist in the tale.','Every story needs a surprise.','Just a pinch of mischief.'],
      allin:['All my acorns. What a chapter!','No bookmark. Straight to the ending.','Now that’s an entrance!'],
      win:['I’m keeping that chapter.','A tale worth telling by the fire.','The plot thickens. So does my stash.'],
      observeAllIn:['Well, that woke the narrator.','That’s one way to turn a page.','A bold chapter. I’ll remember it.']
    },
    2:{
      greeting:['A quiet table under a wide sky.','There’s time. Even stars take their time.','Another evening in our little orbit.'],
      fold:['I’ll watch from this orbit.','A little space to think.','Another constellation awaits.'],
      check:['Let the evening turn.','A quiet moment between stars.','No need to hurry the sky.'],
      call:['One more point on the chart.','Following this little orbit.','Let’s see the next constellation.'],
      raise:['A small change in orbit.','A little farther into the evening.','One careful step beyond.'],
      allin:['The whole constellation, then.','One small leap. A very large sky.','All aboard this little comet.'],
      win:['A lovely alignment.','I’ll mark this evening on the chart.','A bright little moment.'],
      observeAllIn:['A bright streak across the table.','That changes the evening’s orbit.','A moment to sit very still.']
    },
    3:{
      greeting:['The tea’s warm. Make yourself comfy.','A little company improves the brew.','There’s always room for one more cup.'],
      fold:['Time for a quiet sip.','I’ll let this one steep.','You carry on. I’ll mind the kettle.'],
      check:['A nice, gentle pace.','Let’s give it a moment to brew.','No rush. The cups are still warm.'],
      call:['A little more in the cup.','One more sip of the evening.','That sounds lovely. I’m in.'],
      raise:['Just a splash more.','A slightly stronger brew.','Shall we warm things up a little?'],
      allin:['The whole teapot. Steady now.','Every last leaf. Here we go.','Well. That’s a very full cup.'],
      win:['That’ll keep the kettle going.','A lovely little brew.','Tea tastes sweeter with company.'],
      observeAllIn:['I’ll put the kettle down for this.','Steady hands. Warm cups.','That’s quite a splash.']
    }
  };
  lines[4]={greeting:['Room for a crocodile?','I can wait.'],fold:['Not worth the bite.','I’ll sit tight.'],check:['Still waters.','Your move.'],call:['Just testing the water.','I’ll stay.'],raise:['That looks worth a bite.','A little pressure.'],allin:['Time to commit.','Taking the plunge.'],win:['Patience paid.','Good catch.'],observeAllIn:['That’s a splash.','I’m watching.']};
  lines[5]={greeting:['What are we playing? Oh!','I brought snacks.'],fold:['Next one!','Oops. Not this time.'],check:['Can we see another?','Just looking.'],call:['I want to see!','One more card?'],raise:['Let’s try this.','Tiny splash!'],allin:['All my little chips!','Here goes!'],win:['Oh! That worked!','Look at those cards!'],observeAllIn:['Whoa.','That’s a big pile.']};
  lines[6]={greeting:['Saved you a spot.','Good to see you.'],fold:['I’ll wait here.','You take this one.'],check:['Right here.','Go ahead.'],call:['I’m with you.','Staying put.'],raise:['Let’s make it interesting.','A little more.'],allin:['I’m committed.','All the way.'],win:['Good hand, everyone.','That went well.'],observeAllIn:['Easy now.','I’m paying attention.']};
  var chances={greeting:.38,fold:.32,check:.16,call:.24,raise:.48,allin:.88,win:.48,observeAllIn:.55};
  function HearthCompanions(options){
    options=options||{};this.random=options.random||Math.random;this.onChange=options.onChange||function(){};
    this.roster=options.roster||[1,2,3];this.active=null;this.cooldown=0;this.paused=false;this.hidden=false;this.bags={};this.previous={};this.lastSpeaker=null;
  }
  HearthCompanions.prototype.getState=function(){return {speakerId:this.active?this.active.id:null,line:this.active?this.active.line:'',visible:!!this.active&&!this.hidden,remainingMs:this.active?this.active.left:0,cooldownMs:this.cooldown};};
  HearthCompanions.prototype._notify=function(){this.onChange(this.getState());};
  HearthCompanions.prototype._context=function(context){
    if(!context)return;
    var changed=this.hidden!==!!context.hidden;this.paused=!!context.paused;this.hidden=!!context.hidden;
    if(changed)this._notify();
  };
  HearthCompanions.prototype.clear=function(){this.active=null;this.cooldown=0;this._notify();};
  HearthCompanions.prototype.tick=function(elapsedMs,context){
    this._context(context);
    if(this.paused||this.hidden)return;
    var elapsed=Math.max(0,Number(elapsedMs)||0);this.cooldown=Math.max(0,this.cooldown-elapsed);
    if(this.active){this.active.left-=elapsed;if(this.active.left<=0){this.active=null;this._notify();}}
  };
  HearthCompanions.prototype._line=function(id,kind){
    var key=id+':'+kind,pool=lines[this.roster[id-1]||id][kind],bag=this.bags[key];
    if(!bag||!bag.length){
      bag=pool.slice();
      for(var i=bag.length-1;i>0;i--){var j=Math.min(i,Math.floor(this.random()*(i+1))),tmp=bag[i];bag[i]=bag[j];bag[j]=tmp;}
      if(bag.length>1&&bag[bag.length-1]===this.previous[key]){var first=bag[0];bag[0]=bag[bag.length-1];bag[bag.length-1]=first;}
      this.bags[key]=bag;
    }
    var line=bag.pop();this.previous[key]=line;return line;
  };
  HearthCompanions.prototype._attempt=function(id,kind){
    if(this.paused||this.hidden||this.active||this.cooldown>0||!lines[this.roster[id-1]||id]||!lines[this.roster[id-1]||id][kind])return false;
    if(this.random()>=chances[kind])return false;
    var line=this._line(id,kind);
    this.active={id:id,line:line,left:Math.min(4200,2200+line.length*35)};
    this.cooldown=6500+Math.floor(this.random()*4500);this.lastSpeaker=id;this._notify();return true;
  };
  HearthCompanions.prototype._speaker=function(ids){
    var choices=ids.filter(function(id){return id!==this.lastSpeaker;},this);
    if(!choices.length)choices=ids;
    return choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))];
  };
  HearthCompanions.prototype.handle=function(event,context){
    this._context(context);if(!event)return false;
    if(event.type==='hand-start'){this.clear();var participants=(event.participantIds||[1,2,3]).filter(function(id){return id>=1&&id<=this.roster.length;},this);return this._attempt(this._speaker(participants),'greeting');}
    if(event.type==='greeting')return this._attempt(this._speaker(this.roster.map(function(_,i){return i+1;})),'greeting');
    if(event.type==='action'){
      var kind=event.allIn?'allin':event.action;
      if(event.playerId===0&&kind==='allin')return this._attempt(this._speaker(this.roster.map(function(_,i){return i+1;})),'observeAllIn');
      return this._attempt(event.playerId,kind);
    }
    if(event.type==='result'){
      var winners=(event.winnerIds||[]).filter(function(id){return id>=1&&id<=this.roster.length;},this);
      if(winners.length)return this._attempt(this._speaker(winners),'win');
    }
    return false;
  };
  return HearthCompanions;
});
