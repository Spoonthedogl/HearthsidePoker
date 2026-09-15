(function () {
 'use strict';
 var $=function(id){return document.getElementById(id);};
 var names=['You','Juniper','Luna','Moss'];
 var audio=new HearthAudio({master:.65,music:.28,ambience:.28});
 try{$('musicTrack').value=localStorage.getItem('hearthside-track')||'auto';}catch(e){}audio.setTrack($('musicTrack').value||'auto');
 $('musicTrack').addEventListener('change',function(){audio.setTrack(this.value);try{localStorage.setItem('hearthside-track',this.value);}catch(e){}});
 var teaReady=0;$('teaButton').addEventListener('click',function(){if(paused()||performance.now()<teaReady)return;teaReady=performance.now()+1000;audio.init();var sip=Math.random()<.5;audio.play(sip?'teaSip':'teaStir',{volume:.7,pan:.4});this.classList.remove('sipping','stirring');void this.offsetWidth;this.classList.add(sip?'sipping':'stirring');});
 audio.prepare(); // Open the silent device before the table's first interaction.
 var table=new Poker.Table({names:names}),started=false,busy=false,version=0,eventIndex=0;
 var online=false,onlineRoomCode=null; // true only inside an active online room; see the Online play block near the end of this file.
 var reconnecting=false,reconnectAttempts=0; // a dropped socket gets a few quiet retries before online play gives up; see the Online play block.
 var onlineHandNumber=0; // which hand driveOnline's local replay state (eventIndex, visibleSeats, ...) is caught up to; see the Online play block.
 var onlineRejoining=false; // true only while attempting to resume a saved session from a fresh page load; see the Online play block.
 var visibleSeats=table.players.map(function(p){return {stack:p.stack,bet:0,folded:false,allIn:false,lastAction:''};});
 var companions=new HearthCompanions({onChange:renderSpeech});
 var computation=new HearthComputation(),guidePending={},guideErrors={};
 var ambience=new HearthAmbience($('stage'));
 var cat=new HearthCatDirector({onFrame:renderCat});
 var previousCatAction=null;
 function renderCat(frame,state){if(state.action==='spin'&&previousCatAction!=='spin'&&started)audio.play('catSpin',{volume:.35});previousCatAction=state.action;var el=$('windowCat');el.style.backgroundPosition=((frame%4)*100/3)+'% '+(frame>=4?100:0)+'%';el.dataset.action=state.action;el.dataset.frame=frame;el.setAttribute('aria-label','A ginger cat '+({sleep:'sleeping on the window cushion',stretch:'stretching',groom:'licking its paw',watch:'looking out the window',spin:'doing a rare spinning dance'}[state.action]||'resting'));}
 renderCat(cat.getState().frame,cat.getState());
 var visibleBoard=[],visiblePot=0,visibleStreet='idle',revealed=false,guideTab='possibilities',guideCache={},raiseOpen=false,lastFocus=null;
 var record={wins:0,losses:0,net:0,lastHand:0},handStartStack=table.startingStack;
 var selectedCategory=null,restore=null,activeSeat=null,joining=false,pace="normal",checkpointData=null,saveFailed=false;
 var savedHandLost=null;
 // The table you chose in setup. Difficulty also rides on the Table so a saved
 // hand carries it; the evening's blind schedule is app state, saved with the UI.
 var tableKind='steady',chosenDifficulty='standard';
 var club=HearthClub.fresh(),eveningHands=0,buyIns=1,eveningClosed=false,eveningEarned=0,eveningWinnings=0;
 try{club=HearthClub.restore(JSON.parse(localStorage.getItem('hearthside-club')));}catch(e){}
 function saveClub(){try{localStorage.setItem('hearthside-club',JSON.stringify(club));}catch(e){}}
 function applyComforts(){ambience.setComforts(HearthClub.lights(club));cat.setLiveliness(HearthClub.catLiveliness(club));}
 function eveningOver(){return eveningHands>=HearthClub.EVENING_HANDS;}
 // Each suit carries a text-presentation selector (U+FE0E) so a device's colour
 // emoji font can't substitute a glyph (Samsung renders a pinched ♣ otherwise);
 // the monochrome text glyph also takes the CSS colour for red/four-colour decks.
 var suit={s:'♠︎',h:'♥︎',d:'♦︎',c:'♣︎'},rank={11:'J',12:'Q',13:'K',14:'A'};
 var descriptions=['Your highest cards, when no stronger pattern is made.','Two cards of the same rank.','Two different pairs of matching ranks.','Three cards of the same rank.','Five consecutive ranks. An ace can be low or high.','Five cards of the same suit, in any order.','Three of one rank, plus a pair of another.','Four cards of the same rank.','Five consecutive ranks, all in the same suit.'];
 var examples=[['As','Jh','9c','6d','3s'],['Kh','Ks','9c','6d','3s'],['Kh','Ks','9c','9d','3s'],['7h','7s','7c','Kd','3s'],['9h','8s','7c','6d','5s'],['Ah','Jh','8h','6h','3h'],['Qh','Qs','Qc','8d','8s'],['5h','5s','5c','5d','As'],['9h','8h','7h','6h','5h']];
 // A phone-sized screen swaps the whole stage to the portrait design space
 // rather than shrinking the desk layout, which would leave 4px text.
 // Own the viewport rather than trusting the page we are embedded in: without
 // a locked device-width the layout viewport falls back to ~980px and every
 // measurement below is taken against a screen that isn't there.
 (function(){var m=document.querySelector('meta[name=viewport]');if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}m.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');})();
 var compact=null,seatsMounted=false,rotateDismissed=false,fitMotes=function(){};
 function seatVariant(){return compact?'compact':'wide';}
 function touchDevice(){return matchMedia('(pointer:coarse)').matches;}
 function resize(){var box=HearthSeating.STAGE[seatVariant()];$('stage').style.transform='translate(-50%,-50%) scale('+Math.min(innerWidth/box.width,innerHeight/box.height)+')';}
 // The on-screen keyboard (e.g. the raise amount field) shrinks innerHeight
 // on many mobile browsers without the device actually rotating - reading
 // that as "now landscape" flashed the rotate hint and could re-lay the
 // portrait table out from under a raise in progress. screen.width/height
 // are the physical screen's dimensions: they rotate with the device but,
 // unlike the viewport, are never shrunk by an on-screen keyboard overlay.
 function isPortrait(){return screen.height&&screen.width?screen.height>=screen.width:innerHeight>=innerWidth;}
 function applyMode(){
  var narrow=Math.min(innerWidth,innerHeight)<=560,portrait=isPortrait(),want=narrow&&portrait;
  if(portrait)rotateDismissed=false;
  $('rotateHint').classList.toggle('hidden',!(narrow&&!portrait&&touchDevice())||rotateDismissed);
  if(want!==compact){compact=want;document.body.classList.toggle('compact',compact);ambience.setFit(compact?'width':'cover');fitMotes();if(seatsMounted){configureSeats();render();}}
  resize();
 }
 $('rotateHint').addEventListener('click',function(){rotateDismissed=true;this.classList.add('hidden');});
 // Re-check after layout settles: setting the viewport meta above can change
 // the layout viewport without firing a resize.
 addEventListener('resize',applyMode);addEventListener('orientationchange',applyMode);addEventListener('load',applyMode);applyMode();requestAnimationFrame(applyMode);
 // A WebView (such as the installed Android app) can resize its viewport a
 // moment after load — when the splash screen clears — without firing a window
 // resize. Watch the layout viewport itself so the table is fitted to the
 // screen on the very first frame, not only after the first rotation.
 if(window.ResizeObserver){try{new ResizeObserver(applyMode).observe(document.documentElement);}catch(e){}}
 if(window.visualViewport){visualViewport.addEventListener('resize',applyMode);}
 function safeStore(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
 try{restore=JSON.parse(localStorage.getItem('hearthside-session')||'null');if(restore&&restore.version===2){try{HearthSession.unpack(restore);}catch(err){restore=null;savedHandLost=err.message;}}var prefs=JSON.parse(localStorage.getItem('hearthside-settings')||'null');if(prefs){pace=["relaxed","normal","brisk"].includes(prefs.pace)?prefs.pace:"normal";audio.setMaster(prefs.master);audio.setMusic(prefs.music);audio.setAmbience(prefs.ambience);audio.setEffects(prefs.effects);audio.setMuted(prefs.muted);$('reducedMotion').checked=!!prefs.gentle;$('stage').classList.toggle('gentle',!!prefs.gentle);$('fourColour').checked=!!prefs.fourColour;document.body.classList.toggle('four-colour',!!prefs.fourColour);$('largeText').checked=!!prefs.largeText;document.body.classList.toggle('large-text',!!prefs.largeText);}}catch(e){}
 var settingsSaveTimer=null;
 function queueSettingsSave(){clearTimeout(settingsSaveTimer);settingsSaveTimer=setTimeout(saveSettings,250);}
 function saveSettings(){var p=audio.getSettings();p.gentle=$('reducedMotion').checked;p.fourColour=$('fourColour').checked;p.largeText=$('largeText').checked;p.pace=pace;safeStore('hearthside-settings',p);}
 function card(c,opts){opts=opts||{};var el=document.createElement('div');el.className='card'+(!c?' back':(c.suit==='h'||c.suit==='d'?' red':'')+' suit-'+c.suit)+(opts.best?' best':'')+(opts.enter?' enter':'');if(c){var r=rank[c.rank]||c.rank,s=suit[c.suit];el.setAttribute('aria-label',r+' of '+({s:'spades',h:'hearts',d:'diamonds',c:'clubs'}[c.suit]));el.dataset.card=Poker.cardKey(c);el.innerHTML='<div class="corner">'+r+'<span>'+s+'</span></div><div class="center-suit">'+s+'</div><div class="corner bottom">'+r+'<span>'+s+'</span></div>';}else{el.innerHTML='<span>✦</span>';el.setAttribute('aria-label','Face-down card');}return el;}
 function emptyCard(i){var e=document.createElement('div');e.className='card empty';e.textContent=['✧','✧','✧','·','·'][i];e.title=['Flop','Flop','Flop','Turn','River'][i]+' · not dealt yet';return e;}
 function replaceCards(el,cards,opts){var sig=cards.map(function(c){return c?Poker.cardKey(c):'?';}).join(',')+'|'+(opts&&opts.best||[]).join(',');if(el.dataset.sig===sig)return;var old=(el.dataset.sig||'').split('|')[0].split(',');el.dataset.sig=sig;el.innerHTML='';cards.forEach(function(c,i){el.appendChild(card(c,{best:c&&opts&&opts.best&&opts.best.indexOf(Poker.cardKey(c))>=0,enter:opts&&opts.animate&&old[i]!==(c?Poker.cardKey(c):'?')}));});}
 function current(){return Poker.evaluate(table.players[0].hole.concat(visibleBoard));}
 function paused(){return !$('journal').classList.contains('hidden')||['settings','rules','confirmReset','recap','eveningClose','shelf','online','gameOver'].some(function(id){return !$(id).classList.contains('hidden');});}
 function syncScenePause(){var context=companionContext();$('stage').classList.toggle('scene-paused',context.paused||context.hidden);ambience.setPaused(context.paused);cat.tick(0,{paused:context.paused,hidden:context.hidden,gentle:$('reducedMotion').checked});}
 function wait(ms,t){return new Promise(function(resolve){var left=ms,last=Date.now();function tick(){if(t!==version){resolve(false);return;}var now=Date.now();if(!paused()&&!document.hidden)left-=(now-last)/HearthSession.paceFactor(pace);last=now;if(left<=0){resolve(true);return;}setTimeout(tick,40);}tick();});}
 function sound(name,id){audio.play(name,{pan:id>0?Number($('seat'+id).dataset.pan):0});}
 function renderSpeech(state){for(var id=1;id<table.players.length;id++){var bubble=$('speech'+id),active=state.speakerId===id;bubble.textContent=active?state.line:'';bubble.classList.toggle('show',active&&state.visible);bubble.setAttribute('aria-hidden',active&&state.visible?'false':'true');bubble.setAttribute('aria-live','polite');}}
 function companionContext(){return {paused:paused(),hidden:document.hidden};}
 function applyPublicEvent(e){
  if(e.type==='hand-start')companions.handle({type:'hand-start',participantIds:visibleSeats.map(function(p,id){return p.folded?null:id;}).filter(function(id){return id!==null;})},companionContext());
  if(e.type==='blind'||e.type==='action'){var p=visibleSeats[e.playerId];p.stack=Math.max(0,p.stack-(e.amount||0));p.bet+=e.amount||0;if(e.action==='fold')p.folded=true;p.allIn=!p.folded&&p.stack===0;p.lastAction=e.text||(e.label+' '+e.amount);if(e.type==='action')companions.handle({type:'action',playerId:e.playerId,action:e.action,allIn:p.allIn},companionContext());}
  if(e.type==='street')visibleSeats.forEach(function(p){p.bet=0;if(!p.folded&&!p.allIn)p.lastAction='';});
  if(e.type==='result'){visibleSeats.forEach(function(p,id){p.stack=table.players[id].stack;p.bet=0;});companions.handle({type:'result',winnerIds:e.result.winners.filter(function(w){return w.wonAmount>0;}).map(function(w){return w.id;})},companionContext());}
 }
 function burst(x,y,count){if($('reducedMotion').checked)return;for(var i=0;i<count;i++){var p=document.createElement('span');p.className='particle';p.textContent=i%3?'✦':'◉';p.style.left=x+'px';p.style.top=y+'px';p.style.setProperty('--dx',(Math.random()-.5)*260+'px');p.style.setProperty('--dy',(-40-Math.random()*170)+'px');p.style.animationDelay=(i*.025)+'s';$('particles').appendChild(p);setTimeout(function(node){return function(){node.remove();};}(p),2000);}}
 function configureSeats(){HearthRoster.mount(table.players,seatVariant());seatsMounted=true;companions.roster=table.players.slice(1).map(function(p){return HearthRoster.all.findIndex(function(c){return c.name===p.name;})+1;});}
 function setupChoices(){HearthRoster.setup(names.slice(1));var kind=$('tableKind');if(!kind.options.length)HearthTables.tables.forEach(function(t){var o=document.createElement('option');o.value=t.id;o.textContent=t.name;kind.appendChild(o);});kind.value=tableKind;$('tableKindNote').textContent=HearthTables.find(tableKind).note;$('tableDifficulty').value=chosenDifficulty;}
 $('tableKind').addEventListener('change',function(){$('tableKindNote').textContent=HearthTables.find(this.value).note;});
 function anchors(){return HearthSeating.STAGE[seatVariant()];}
 function seatPoint(id){var el=$('seat'+id);return el?[Number(el.dataset.chipX),Number(el.dataset.chipY)]:anchors().hero;}
 function chipFlight(id){if($('reducedMotion').checked)return;var a=anchors(),from=id===0?a.hero:seatPoint(id);for(var i=0;i<4;i++){var p=document.createElement('span');p.className='particle';p.textContent='◉';p.style.left=from[0]+i*3+'px';p.style.top=from[1]+'px';p.style.setProperty('--dx',(a.pot[0]-from[0])+'px');p.style.setProperty('--dy',(a.pot[1]-from[1])+'px');p.style.animationDuration=(.65*HearthSession.paceFactor(pace))+'s';p.style.animationDelay=i*.045+'s';$('particles').appendChild(p);setTimeout(function(n){return function(){n.remove();};}(p),950);}}
 function render(){var snap=table.snapshot(),ev=current(),keys=visibleBoard.length>=3?ev.bestCards.map(Poker.cardKey):[];
  $('handNo').textContent=online?'GAME '+(table.gamesPlayed||1)+' · HAND '+(table.gameHand||1)+' OF '+(table.handsPerGame||7):'HAND '+Math.min(eveningHands+(revealed?0:1)||1,HearthClub.EVENING_HANDS)+' OF '+HearthClub.EVENING_HANDS;$('potValue').textContent=visiblePot.toLocaleString();$('blindsInfo').textContent='BLINDS '+table.smallBlind+' / '+table.bigBlind;
  $('streetRibbon').textContent=visibleStreet==='idle'?'':visibleStreet.toUpperCase();
  var chips='';for(var c=0;c<Math.min(11,Math.ceil(visiblePot/15));c++)chips+='<i class="chip '+(c%3===1?'green':c%3===2?'purple':'')+'" style="left:'+((c%3)*15)+'px;bottom:'+Math.floor(c/3)*4+'px"></i>';$('chipPile').innerHTML=chips;
  for(var i=1;i<table.players.length;i++){var p=snap.players[i],v=visibleSeats[i],seat=$('seat'+i),mood=started?(v.folded?'folded':v.allIn?'allin':'playing'):'playing';seat.querySelector('.stack').textContent=v.stack.toLocaleString();seat.querySelector('.status').textContent=!started?'Ready':(activeSeat===i&&!revealed?'Their turn':v.lastAction||(v.folded?'Resting':''));seat.querySelector('.dealer-token').style.display=started&&snap.dealer===i?'block':'none';seat.classList.toggle('active',started&&activeSeat===i&&!revealed);seat.querySelector('.nameplate').setAttribute('aria-current',activeSeat===i?'true':'false');HearthPresentation.renderChips(seat.querySelector('.npc-chips'),v.stack,names[i]);seat.classList.toggle('folded',started&&v.folded);seat.dataset.mood=mood;var sprite=seat.querySelector('.sprite');sprite.setAttribute('role','img');sprite.setAttribute('aria-label',names[i]+', '+(mood==='allin'?'all in':mood==='folded'?'sitting this hand out':'playing'));replaceCards(seat.querySelector('.opponent-cards'),started?p.hole.map(function(c){return revealed?c:null;}):[null,null],{animate:true});}
  var boardSig=visibleBoard.map(Poker.cardKey).join(',')+'|'+keys.join(',');if($('board').dataset.sig!==boardSig){var oldKeys=($('board').dataset.sig||'').split('|')[0];$('board').dataset.sig=boardSig;$('board').innerHTML='';for(var b=0;b<5;b++)$('board').appendChild(visibleBoard[b]?card(visibleBoard[b],{best:keys.indexOf(Poker.cardKey(visibleBoard[b]))>=0,enter:oldKeys.indexOf(Poker.cardKey(visibleBoard[b]))<0}):emptyCard(b));}
  replaceCards($('holeCards'),started?table.players[0].hole:[null,null],{animate:true,best:keys});
  $('humanStack').textContent=visibleSeats[0].stack.toLocaleString();
  $('sessionRecord').textContent=record.wins+'W · '+record.losses+'L · '+(record.net>=0?'+':'')+record.net+' chips';
  for(var pos=0;pos<table.players.length;pos++){var host=pos===0?$('humanPositions'):$('seat'+pos).querySelector('.position-markers');if(!host){host=document.createElement('div');host.className='position-markers';$('seat'+pos).querySelector('.nameplate').appendChild(host);}var positionSig=started?table.handNumber+'|'+table.dealer+'|'+table.events.slice(0,eventIndex+1).filter(function(e){return e.type==='blind'&&e.playerId===pos;}).map(function(e){return e.label;}).join(','):'idle';if(host.dataset.sig===positionSig)continue;host.dataset.sig=positionSig;host.innerHTML='';if(started){if(pos===table.dealer){var d=document.createElement('span');d.textContent='D';d.title='Dealer';d.className='dealer-marker';host.appendChild(d);}table.events.slice(0,eventIndex+1).filter(function(e){return e.type==='blind'&&e.playerId===pos;}).forEach(function(e){var m=document.createElement('span');m.textContent=e.label==='Small blind'?'SB':'BB';m.title=e.label+' · '+e.amount+' chips';m.className='blind-marker';host.appendChild(m);});}}
 $('humanBet').textContent=started?(visibleSeats[0].folded?'Sitting this hand out.':visibleSeats[0].allIn?'All in.':visibleSeats[0].bet?'In this round: '+visibleSeats[0].bet+' chips':''):'';
  $('humanDealer').style.display=started&&table.dealer===0?'block':'none';$('currentHand').textContent=started?(table.players[0].hole.length===0?'Sitting out':visibleBoard.length<3?(ev.category===1?'Pocket '+(rank[table.players[0].hole[0].rank]||table.players[0].hole[0].rank)+'s':(rank[ev.tiebreak[0]]||ev.tiebreak[0])+' high'):ev.name):'No cards';
  var boardPair=visibleBoard.filter(function(c){return c.rank===ev.tiebreak[0];}).length>=2;
  $('handSource').textContent=started&&visibleBoard.length>=3&&ev.category===1?(boardPair?'Pair on the board · shared by everyone':'Pair uses your cards'):'';
  $('peekButton').title='Best five cards from your hand and the shared board';
  renderActions();if(!$('journal').classList.contains('hidden'))renderJournal();
 }
 function setMessage(text,win){$('tableMessage').textContent=text;$('tableMessage').classList.toggle('winner-banner',!!win);}
 function renderActions(){var btns=$('actionButtons'),oldRaise=$('raisePanel');if(oldRaise)oldRaise.remove();raiseOpen=false;
  if(joining){$('turnText').textContent='TAKING YOUR SEAT';$('turnHint').textContent='';btns.innerHTML='<button disabled class="primary">Settling in…</button>';return;}
  if(online){
   if(!HearthOnline.started){$('turnText').textContent='IN THE LOBBY';$('turnHint').textContent='';btns.innerHTML='<button disabled class="primary">Waiting to begin…</button>';return;}
   if(busy){$('turnText').textContent='WAITING';$('turnHint').textContent='';btns.innerHTML='<button disabled class="subtle-button">Fold</button><button disabled>Check / call</button><button disabled class="raise-button">Raise</button>';return;}
   // Online has no buy-in economy to rebuy from mid-game, so a busted seat
   // just sits out the rest of the current game (the server has already
   // stopped requiring its "ready" click too) - a fresh stack and a real
   // hand are only ever a new game away, not a button click.
   if(table.players[0].stack===0){$('turnText').textContent="YOU'RE OUT THIS GAME";$('turnHint').textContent='Watching the rest of this game play out.';btns.innerHTML='<button disabled>Waiting for the next game…</button>';return;}
   if(table.result){$('turnText').textContent='HAND COMPLETE';$('turnHint').textContent='';btns.innerHTML='<button id="onlineNextSubmit" class="primary">Ready for the next hand <span>↗</span></button>';return;}
   if(table.actor!==0){$('turnText').textContent='WAITING';$('turnHint').textContent=(table.names[table.actor]||'Someone')+' is deciding.';btns.innerHTML='<button disabled>Cards in motion…</button>';return;}
   var ol=table.legalActions();$('turnText').textContent='YOUR TURN';$('turnHint').textContent=ol.check?'':ol.call+' chips to call';
   btns.innerHTML='<button data-action="fold" class="subtle-button">Fold <small>F</small></button><button data-action="'+(ol.check?'check':'call')+'" class="primary">'+HearthPresentation.callLabel(ol,table.players[0].stack)+' <small>C</small></button><button id="raiseToggle" class="raise-button" '+(!ol.canRaise?'disabled':'')+'>'+(table.currentBet?'Raise':'Bet')+' <span>⌃</span></button>';
   return;
  }
  if(!started){$('turnText').textContent='YOUR CHAIR IS WAITING';$('turnHint').textContent=restore?(restore.version===2?'Your unfinished hand is saved.':'Your last finished table is saved.'):savedHandLost?'Your last hand could not be read back, so this is a fresh table. The club fund is safe.':'A friendly table. All make-believe chips.';var savedOnline=onlineSavedSession();btns.innerHTML='<button id="startButton" class="primary">'+(restore?'Return to the table':'Take a seat')+' <span>↗</span></button><button id="onlineButton">Play with friends</button>'+(savedOnline?'<button id="onlineRejoinButton">Rejoin room '+HearthRoomCode.display(savedOnline.room)+'</button>':'');return;}
  if(busy){$('turnText').textContent=activeSeat>0?names[activeSeat].toUpperCase()+'’S TURN':'DEALING';$('turnHint').textContent='';btns.innerHTML='<button disabled class="subtle-button">Fold</button><button disabled>Check / call</button><button disabled class="raise-button">Raise</button>';return;}
  if(revealed&&eveningOver()){$('turnText').textContent='THE EVENING WINDS DOWN';$('turnHint').textContent=HearthClub.EVENING_HANDS+' hands played. Time to settle up.';btns.innerHTML='<button id="recapButton">Review hand</button><button id="endEvening" class="primary">Settle up <span>↗</span></button>';return;}
  if(revealed){var busted=table.players[0].stack===0;$('turnText').textContent=busted?'OUT OF CHIPS':'HAND COMPLETE';$('turnHint').textContent=busted?'Buy back in and the evening carries on.':'';btns.innerHTML='<button id="recapButton">Review hand</button>'+(busted?'<button id="freshTable" class="subtle-button">Fresh table</button><button id="nextHand" class="primary">Rebuy '+table.startingStack+' chips <span>↗</span></button>':'<button id="nextHand" class="primary">Deal next hand <span>↗</span></button>');return;}
  if(table.actor!==0){$('turnText').textContent='WAITING';$('turnHint').textContent='Your companions are finishing the hand.';btns.innerHTML='<button disabled>Cards in motion…</button>';return;}
  var l=table.legalActions();$('turnText').textContent='YOUR TURN';$('turnHint').textContent=l.check?'':l.call+' chips to call';
  btns.innerHTML='<button data-action="fold" class="subtle-button">Fold <small>F</small></button><button data-action="'+(l.check?'check':'call')+'" class="primary">'+HearthPresentation.callLabel(l,table.players[0].stack)+' <small>C</small></button><button id="raiseToggle" class="raise-button" '+(!l.canRaise?'disabled':'')+'>'+(table.currentBet?'Raise':'Bet')+' <span>⌃</span></button>';
 }
 async function drive(t){busy=true;activeSeat=null;render();while(t===version){while(eventIndex<table.events.length){if(!await wait(30,t))return;var e=table.events[eventIndex];applyPublicEvent(e);if(e.type==='hand-start'){sound('shuffle');visibleStreet='preflop';visibleBoard=[];revealed=false;visiblePot=0;render();checkpoint(eventIndex+1);for(var d=0;d<table.players.filter(function(p){return p.hole.length;}).length*2;d++){sound('deal',d%table.players.length);if(!await wait(75,t))return;}setMessage('');}
    if(e.type==='blind'||e.type==='action'){visiblePot+=e.amount||0;if(e.type==='action'){sound(e.action==='call'?'chips':e.action==='allin'?'raise':e.action,e.playerId);setMessage(names[e.playerId]+' · '+e.text);}else sound('chips',e.playerId);if(e.amount)chipFlight(e.playerId);render();checkpoint(eventIndex+1);if(!await wait(e.type==='blind'?550:350,t))return;}
    if(e.type==='street'){visibleStreet=e.street;setMessage({flop:'',turn:'',river:''}[e.street]);for(var k=Math.max(0,visibleBoard.length-(e.board.length-e.cards.length));k<e.cards.length;k++){visibleBoard.push(e.cards[k]);sound('flip');render();checkpoint();if(!await wait(320,t))return;}if(!await wait(220,t))return;}
    if(e.type==='result'){var tallied=HearthSession.tally(record,table.handNumber,table.players[0].stack,handStartStack);if(tallied.counted){record=tallied.record;eveningHands++;}revealed=true;visibleStreet='showdown';visiblePot=e.result.totalPot;var wins=e.result.winners.filter(function(w){return w.wonAmount>0;});var bonusText=(e.result.bonus||[]).map(function(b){return (b.playerId===0?'You pocket':names[b.playerId]+' pockets')+' a Jack-Two bonus of '+b.amount+' from the table!';}).join(' ');setMessage(HearthPresentation.resultLabel(e.result,names)+(bonusText?' · '+bonusText:''),true);var humanWin=wins.some(function(w){return w.id===0;});sound(humanWin?'win':'lose');var wa=anchors();burst(humanWin?wa.heroWin[0]:seatPoint(wins[0]?wins[0].id:0)[0],humanWin?wa.heroWin[1]:wa.rivalWinY,humanWin?22:9);$('potValue').classList.add('burst');setTimeout(function(){$('potValue').classList.remove('burst');},500);render();checkpoint(eventIndex+1);if(!await wait(500,t))return;}
    eventIndex++;checkpoint();
   }
   if(table.result||table.actor===0||table.actor===null)break;
   var ai=table.actor;activeSeat=ai;render();$('seat'+ai).classList.add('thinking');if(!await wait(850+Math.random()*550,t))return;$('seat'+ai).classList.remove('thinking');activeSeat=null;try{table.stepAI();checkpoint();}catch(err){console.error(err);setMessage('The table needs a fresh start. '+err.message);break;}
  }if(t!==version)return;busy=false;activeSeat=table.result?null:table.actor;render();checkpoint();if(table.actor===0&&!table.result)sound('turn');
 }
 async function start(){if(joining||started)return;audio.init();if(restore&&restore.version===2){var saved=HearthSession.unpack(restore);table=saved.table;table.players.forEach(function(p){if(p.name==='Luma')p.name='Luna';});names=table.players.map(function(p){return p.name;});configureSeats();window.hearth.table=table;var ui=saved.ui;eveningHands=Number.isSafeInteger(ui.eveningHands)&&ui.eveningHands>=0?ui.eveningHands:0;buyIns=Number.isSafeInteger(ui.buyIns)&&ui.buyIns>=1?ui.buyIns:1;eveningClosed=!!ui.eveningClosed;eveningEarned=Number.isSafeInteger(ui.eveningEarned)&&ui.eveningEarned>=0?ui.eveningEarned:0;eveningWinnings=Number.isSafeInteger(ui.eveningWinnings)&&ui.eveningWinnings>=0?ui.eveningWinnings:0;tableKind=HearthTables.find(ui.tableKind).id;chosenDifficulty=table.difficulty;record=ui.record||{wins:0,losses:0,net:0,lastHand:table.result?table.handNumber:0};handStartStack=ui.handStartStack===undefined?table.players[0].stack+table.players[0].totalBet:ui.handStartStack;visibleSeats=ui.visibleSeats;visibleBoard=ui.visibleBoard;visiblePot=ui.visiblePot;visibleStreet=ui.visibleStreet;revealed=ui.revealed;eventIndex=ui.eventIndex;setMessage(ui.message||'Hand resumed.');restore=null;started=true;joining=false;$('stage').classList.add('seated');checkpoint();drive(++version);return;}joining=true;busy=true;activeSeat=null;$('stage').classList.add('joining','seated');companions.clear();renderActions();audio.play('fold',{volume:.35,pitch:.6});var token=++version;if(!await wait($('reducedMotion').checked?40:1250,token))return;$('stage').classList.remove('joining');joining=false;busy=false;started=true;newHand();}
 function newHand(){if(busy)return;handStartStack=table.players[0].stack;version++;companions.clear();var rebought=table.players.filter(function(p){return p.id!==0&&p.stack===0;});rebought.forEach(function(p){table.rebuy(p.id);});visibleSeats=table.players.map(function(p){return {stack:p.stack,bet:0,folded:p.stack===0,allIn:false,lastAction:p.stack===0?'Resting':''};});visibleBoard=[];visiblePot=0;visibleStreet='preflop';revealed=false;guideCache={};guidePending={};guideErrors={};computation.invalidate();selectedCategory=null;$('board').dataset.sig='';$('holeCards').dataset.sig='';eventIndex=0;var level=HearthTables.blinds(tableKind,eveningHands),rose=level.big>table.bigBlind&&eveningHands>0;table.smallBlind=level.small;table.bigBlind=level.big;if(!table.newHand()){reset();return;}var said=[];if(rose)said.push('The blinds rise to '+level.small+' / '+level.big+'.');if(rebought.length)said.push(rebought.map(function(p){return p.name;}).join(' and ')+(rebought.length>1?' are':' is')+' back in with fresh chips.');if(said.length)setMessage(said.join(' '));checkpoint();drive(version);}
 function checkpoint(nextEventIndex){if(!started||joining)return;checkpointData=HearthSession.pack(table,{eventIndex:nextEventIndex===undefined?eventIndex:nextEventIndex,visibleSeats:visibleSeats,visibleBoard:visibleBoard,visiblePot:visiblePot,visibleStreet:visibleStreet,revealed:revealed,record:record,handStartStack:handStartStack,eveningHands:eveningHands,buyIns:buyIns,eveningClosed:eveningClosed,eveningEarned:eveningEarned,eveningWinnings:eveningWinnings,tableKind:tableKind,message:$('tableMessage').textContent});saveSession();}
 function saveSession(){if(!checkpointData)return;try{localStorage.setItem('hearthside-session',JSON.stringify(checkpointData));saveFailed=false;}catch(e){saveFailed=true;}if($('saveStatus'))$('saveStatus').textContent=saveFailed?'The hand could not be saved. Keep this window open to preserve it.':started?'Your hand is saved automatically.':'';}
 function miniCards(cardsArr){var wrap=document.createElement('div');wrap.className='row-cards';cardsArr.forEach(function(c){var el=document.createElement('i');el.className=(c.suit==='h'||c.suit==='d'?'red ':'')+'suit-'+c.suit;el.textContent=(rank[c.rank]||c.rank)+suit[c.suit];wrap.appendChild(el);});return wrap;}
 function renderRecap(){var busted=table.players[0].stack===0;$('recapNextHand').textContent=eveningOver()?'Settle up ↗':busted?'Rebuy '+table.startingStack+' chips ↗':'Deal next hand ↗';var target=$('recapContent');target.innerHTML='';target.scrollTop=0;var result=table.result;
  if(result.showdown&&result.showdown.length){var showdownSection=document.createElement('section');showdownSection.className='recap-showdown';var heading=document.createElement('h3');heading.textContent='Showdown hands';showdownSection.appendChild(heading);var winnerIds=result.winners.filter(function(w){return w.wonAmount>0;}).map(function(w){return w.id;});result.showdown.slice().sort(function(a,b){return Poker.compare(b.hand,a.hand);}).forEach(function(p){var row=document.createElement('div');row.className='recap-hand-row'+(winnerIds.indexOf(p.id)>=0?' winner':'');var name=document.createElement('span');name.className='recap-hand-name';name.textContent=p.id===0?'You':names[p.id];row.appendChild(name);row.appendChild(miniCards(p.hole));var label=document.createElement('span');label.className='recap-hand-label';label.textContent=p.hand.name;row.appendChild(label);showdownSection.appendChild(row);});target.appendChild(showdownSection);}
  HearthSession.recap(result,names).forEach(function(pot){var section=document.createElement('section');var heading2=document.createElement('h3');heading2.textContent=pot.title;section.appendChild(heading2);pot.winners.forEach(function(w){var row=document.createElement('div');row.className='recap-pot-row';var name=document.createElement('strong');name.textContent=w.name+(w.hand?' · '+w.hand:'')+' · '+w.amount+' chips';row.appendChild(name);row.appendChild(miniCards(w.cards));section.appendChild(row);});var detail=document.createElement('p');detail.textContent=pot.text;section.appendChild(detail);target.appendChild(section);});}
 function quitGame(){saveSession();if(saveFailed)return;if(window.hearthDisplay)window.hearthDisplay.quit();}
 // Leaving without saving throws the evening away, so the button asks once
 // before it does. Closing the panel disarms it again.
 var discardArmed=false;
 function armDiscard(btn){discardArmed=!discardArmed;btn.classList.toggle('arming',discardArmed);btn.textContent=discardArmed?'Discard the evening?':'Quit without saving';if(discardArmed){$('saveStatus').textContent='This throws away the hand and the evening so far. The club fund is kept.';sound('click');}}
 function disarmDiscard(){if(!discardArmed)return;discardArmed=false;var btn=$('discardQuit');if(btn){btn.classList.remove('arming');btn.textContent='Quit without saving';}}
 function discardAndQuit(){discardArmed=false;var btn=$('discardQuit');btn.classList.remove('arming');btn.textContent='Quit without saving';
  checkpointData=null;restore=null;try{localStorage.removeItem('hearthside-session');}catch(e){}
  if(window.hearthDisplay)window.hearthDisplay.quit(true);}

 function rebuy(){if(busy||table.players[0].stack>0)return;table.rebuy(0);buyIns++;newHand();}
 // An evening banks once. Whatever is left above the buy-ins joins the fund;
 // a rough night simply adds nothing and never takes the room backwards.
 function closeEvening(){if(eveningClosed){renderEveningClose();openModal('eveningClose');return;}eveningClosed=true;var split=HearthClub.eveningTotal(table.players[0].stack,buyIns,table.startingStack);eveningWinnings=split.winnings;eveningEarned=split.total;club=HearthClub.endEvening(club,eveningEarned);saveClub();checkpoint();renderEveningClose();openModal('eveningClose');sound(split.winnings?'win':'guideClose');}
 function renderEveningClose(){$('eveningHandsPlayed').textContent=eveningHands;$('eveningWinnings').textContent=eveningWinnings.toLocaleString();$('eveningKitty').textContent=HearthClub.KITTY.toLocaleString();$('eveningTakeHome').textContent=eveningEarned.toLocaleString();$('eveningFund').textContent=club.fund.toLocaleString();$('eveningNote').textContent=eveningWinnings?'A good night — your winnings go in on top of the kitty.':'Everyone chipped in for the fire, as they always do.';
  // Derived from the club rather than remembered, so it reads the same after a reload.
  var best=$('eveningBest'),first=club.evenings===1,top=!first&&eveningEarned>=club.bestTakeHome;best.textContent=first?'Your first evening at the club. It goes in the ledger.':top?'Your best night at the club yet.':'';best.classList.toggle('hidden',!(first||top));}
 function newEvening(){reset();}
 function renderShelf(){$('shelfFund').textContent=club.fund.toLocaleString();var led=HearthClub.ledger(club);$('ledgerEvenings').textContent=led.evenings.toLocaleString();$('ledgerBest').textContent=led.bestNight.toLocaleString();$('ledgerComforts').textContent=led.comforts;$('ledgerComfortsTotal').textContent=led.comfortsTotal;var list=$('shelfItems');list.innerHTML='';HearthClub.catalogue.forEach(function(item){var owned=HearthClub.owns(club,item.id),row=document.createElement('div');row.className='shelf-item'+(owned?' owned':'');var text=document.createElement('div');var name=document.createElement('strong');name.textContent=item.name;text.appendChild(name);var note=document.createElement('small');note.textContent=item.note;text.appendChild(note);row.appendChild(text);var action=document.createElement('button');if(owned){action.textContent='In the room';action.disabled=true;}else{action.textContent=item.cost+' chips';action.disabled=club.fund<item.cost;action.dataset.buy=item.id;}row.appendChild(action);list.appendChild(row);});}
 // Any fresh table is also a fresh evening: a new stack has to reset the
 // buy-in count, or the evening's take-home would be measured against a
 // stake that is no longer what the player actually put in.
 function reset(){eveningHands=0;buyIns=1;eveningClosed=false;eveningEarned=0;record={wins:0,losses:0,net:0,lastHand:0};version++;companions.clear();busy=false;activeSeat=null;joining=false;$('stage').classList.remove('joining');$('stage').classList.add('seated');table=new Poker.Table({names:names,difficulty:chosenDifficulty});handStartStack=table.startingStack;configureSeats();window.hearth.table=table;restore=null;checkpointData=null;safeStore('hearthside-session',null);closeAll();document.querySelectorAll('.thinking').forEach(function(e){e.classList.remove('thinking');});started=true;eventIndex=0;newHand();}
 function act(type,amount){if(online){if(!started||busy||paused()||table.actor!==0)return;busy=true;activeSeat=null;render();HearthOnline.act(type,amount);driveOnlineAfterAction(version);return;}if(!started||joining||busy||paused()||table.actor!==0||revealed)return;audio.init();try{table.act(0,type,amount);checkpoint();drive(version);}catch(err){setMessage(err.message);renderActions();}}
 // table.actor still shows MY turn until the server actually answers - drive()
 // would see that stale value and stop immediately instead of waiting, so an
 // action always waits for the server's first reply before replaying anything.
 async function driveOnlineAfterAction(t){if(!await HearthOnline.waitForEvents(t))return;driveOnline(t);}
 function confirmRaise(){var n=Number($('raiseNumber').value);act('raise',n);}
 function raisePanel(){if(raiseOpen){confirmRaise();return;}var l=table.legalActions();if(!l.canRaise)return;raiseOpen=true;var min=Math.min(l.minRaiseTo,l.maxRaiseTo),p=document.createElement('div');p.className='raise-controls';p.id='raisePanel';p.innerHTML='<label>'+(table.currentBet?'Raise to':'Bet')+' (total this round)<input id="raiseNumber" type="number" min="'+min+'" max="'+l.maxRaiseTo+'" step="1" value="'+min+'" aria-label="Raise total"></label><input id="raiseRange" type="range" min="'+min+'" max="'+l.maxRaiseTo+'" value="'+min+'" aria-label="Raise amount slider"><div class="raise-presets"><button data-raise="min">Minimum</button><button data-raise="half">½ pot</button><button data-raise="pot">Pot</button><button data-raise="all">All in</button><button id="raiseConfirm" class="primary">Confirm</button></div>';$('actions').appendChild(p);sound('click');}
 function analysisKey(){return table.players[0].hole.concat(visibleBoard).map(Poker.cardKey).join(',');}
 function getAnalysis(){var hole=table.players[0].hole,key=analysisKey();if(guideCache[key])return guideCache[key];if(!guidePending[key]&&!guideErrors[key]){var seed=1;key.split('').forEach(function(c){seed=(seed*31+c.charCodeAt(0))>>>0;});var token={version:version};guidePending[key]=token;computation.analyze(hole,visibleBoard,{samples:12000,seed:seed,key:key}).then(function(result){if(token.version!==version||guidePending[key]!==token)return;delete guidePending[key];guideCache[key]=result;if(analysisKey()===key&&!$('journal').classList.contains('hidden'))renderJournal();}).catch(function(err){if(token.version!==version||guidePending[key]!==token)return;delete guidePending[key];if(err&&err.name==='AbortError')return;guideErrors[key]=true;console.warn('Hand guide: '+(err&&err.message||'analysis unavailable'));if(analysisKey()===key&&!$('journal').classList.contains('hidden'))renderJournal();});}return null;}

 function cardExample(arr){return '<div class="row-cards">'+arr.map(function(c){var s=c.slice(-1);return '<i class="'+(s==='h'||s==='d'?'red ':'')+'suit-'+s+'">'+c.slice(0,-1)+suit[s]+'</i>';}).join('')+'</div>';}
 // Only events the table has already played out: table.events runs ahead of
 // the animation, so slicing at the replay cursor keeps the log from telling
 // the player what happens next.
 function renderLog(){var rows=$('journalRows'),seen=started?table.events.slice(0,eventIndex+1):[];
  if(!seen.length){rows.innerHTML='<p class="summary-note">Every bet, call and fold is written down here as the hand goes along.</p>';return;}
  var list=document.createElement('ol');list.className='log-list';
  seen.forEach(function(e){var li=document.createElement('li');
   if(e.type==='hand-start')li.className='log-street',li.textContent=e.dealer===0?'You deal':names[e.dealer]+' deals';
   else if(e.type==='blind'){var nb=document.createElement('b');nb.textContent=names[e.playerId];li.appendChild(nb);li.appendChild(document.createTextNode(' posts the '+e.label.toLowerCase()+' · '+e.amount));}
   else if(e.type==='action'){var nb=document.createElement('b');nb.textContent=names[e.playerId];li.appendChild(nb);li.appendChild(document.createTextNode(' · '+e.text));}
   else if(e.type==='street'){li.className='log-street';li.textContent=e.street.toUpperCase();li.appendChild(miniCards(e.cards));}
   else if(e.type==='result')li.className='log-result',li.textContent=HearthPresentation.resultLabel(e.result,names);
   else return;
   list.appendChild(li);});
  rows.appendChild(list);
  var body=rows.closest('.journal-body');if(body)body.scrollTop=body.scrollHeight;}
 function renderJournal(){var sum=$('journalSummary'),rows=$('journalRows');sum.innerHTML='';rows.innerHTML='';$('journalDetail').innerHTML='';
  var note=document.querySelector('.journal-note');if(note)note.hidden=guideTab==='log';
  if(guideTab==='log'){renderLog();return;}
  if(guideTab==='rankings'){rows.innerHTML='<p class="summary-note" style="margin:0 0 12px">Strongest to simplest. Choose any row to learn more. The best five cards count; suits never break ties.</p><button class="guide-row" data-category="9"><span class="rank">01</span><span><strong>Royal flush</strong><small>The highest possible straight flush</small>'+cardExample(['Ah','Kh','Qh','Jh','10h'])+'</span><span class="chance">✦</span></button>';for(var c=8;c>=0;c--)rows.innerHTML+='<button class="guide-row" data-category="'+c+'"><span class="rank">'+String(10-c).padStart(2,'0')+'</span><span><strong>'+Poker.CATEGORY_NAMES[c]+'</strong><small>'+descriptions[c]+'</small>'+cardExample(examples[c])+'</span></button>';if(selectedCategory!==null)renderDetail(selectedCategory);return;}
  if(!started||table.players[0].hole.length!==2){sum.innerHTML='<div class="journal-summary"><h3>A little guide to possibility.</h3><p class="summary-note">Take a seat to see your cards here. As the community cards appear, this journal will show your current hand and the hands you could still make.</p></div>';rows.innerHTML='<p class="summary-note">You can browse all ten hand rankings in the tab above.</p>';return;}
  if(visibleBoard.length===1||visibleBoard.length===2){sum.innerHTML='<div class="journal-summary"><h3>The flop is arriving…</h3><div class="visible-cards"></div><p class="summary-note">Close the journal to let all three flop cards settle. Then we can explore the complete set of possibilities.</p></div>';var partial=sum.querySelector('.visible-cards');table.players[0].hole.concat(visibleBoard).forEach(function(c){partial.appendChild(card(c));});return;}
  var a=getAnalysis();if(!a){var loading=document.createElement('div');loading.className='journal-summary';loading.innerHTML='<span class="eyebrow">YOUR VISIBLE CARDS</span><h3>'+$('currentHand').textContent+'</h3><div class="visible-cards"></div>';var best=visibleBoard.length>=3?current().bestCards.map(Poker.cardKey):[];table.players[0].hole.concat(visibleBoard).forEach(function(c){loading.querySelector('.visible-cards').appendChild(card(c,{best:best.indexOf(Poker.cardKey(c))>=0}));});sum.appendChild(loading);rows.innerHTML='<p class="summary-note" role="status">'+(guideErrors[analysisKey()]?'Close and reopen the journal to try again.':'Looking at your possibilities…')+'</p>';return;}var wrap=document.createElement('div');wrap.className='journal-summary';wrap.innerHTML='<span class="eyebrow">'+(visibleBoard.length<3?'YOUR STARTING CARDS':'YOUR BEST VISIBLE HAND')+'</span><h3>'+$('currentHand').textContent+'</h3><div class="visible-cards"></div><p class="summary-note">'+(visibleBoard.length<3?'A five-card hand forms when the flop arrives.':a.current.bestCards.length+' gold-edged cards make your best current hand.')+'</p>';var vc=wrap.querySelector('.visible-cards');table.players[0].hole.forEach(function(c){vc.appendChild(card(c,{best:visibleBoard.length>=3&&a.bestCardKeys.indexOf(Poker.cardKey(c))>=0}));});if(visibleBoard.length){var div=document.createElement('span');div.className='visible-divider';vc.appendChild(div);visibleBoard.forEach(function(c){vc.appendChild(card(c,{best:a.bestCardKeys.indexOf(Poker.cardKey(c))>=0}));});}sum.appendChild(wrap);
  var tapHint=visibleBoard.length>=3&&visibleBoard.length<5?'Tap any hand below to see the exact cards you\'d need to make it.':'Tap any hand below to see an example of it.';
  rows.innerHTML='<div class="eyebrow" style="margin:0 0 5px">'+(visibleBoard.length===5?'YOUR FINAL HAND':'BY THE RIVER')+'</div><p class="summary-note" style="margin:0 0 8px">'+a.sampleLabel+'. '+(!a.exact?'Rare hands may not appear in the sample. ':'')+tapHint+'</p>';
  a.rows.slice().reverse().forEach(function(row,i){var pct=row.probability*100,label=pct===100?'100%':pct===0?(a.exact?'0%':'—'):pct<.1?'<0.1%':pct.toFixed(1)+'%';var note=visibleBoard.length<3?(row.current?'Your starting pattern':'Possible final hand'):row.current?'Your current category':row.outs.length?row.outs.length+' next cards make this category':row.possible===false?'Cannot finish in this category':'Possible final hand';if(!a.exact&&pct===0&&row.possible!==false)note='Rare · not sampled';if(row.possible===false){label='0%';note='Cannot finish in this category';}rows.innerHTML+='<button class="guide-row '+(row.current?'current ':'')+(row.possible===false?'unavailable':'')+'" data-category="'+row.category+'"><span class="rank">'+String(i+1).padStart(2,'0')+'</span><span><strong>'+(row.category===8?'Straight / royal flush':row.name)+'</strong><small>'+note+'</small></span><span class="chance">'+label+'</span><span class="bar" style="width:'+Math.max(0,pct*3.18)+'px"></span></button>';});if(selectedCategory!==null)renderDetail(selectedCategory);
 }
 function hypotheticalHTML(example){if(!example)return '<p>No example of this rare outcome appeared in the sample. It may still be possible.</p>';var futureKeys=example.futureBoard.map(Poker.cardKey);return '<p><b>One possible version of your hand</b><br>This is an illustration, not a prediction of the deck.</p><div class="example-hand">'+example.bestCards.map(function(c){var k=Poker.cardKey(c),isFuture=futureKeys.indexOf(k)>=0,label=isFuture?'POSSIBLE':example.usedHoleKeys.indexOf(k)>=0?'YOURS':'TABLE';return '<div class="example-slot '+(isFuture?'hypothetical':'')+'">'+card(c).outerHTML+'<small>'+label+'</small></div>';}).join('')+'</div>'+(example.futureBoard.length?'<p>Example future board: '+example.futureBoard.map(function(c){return (rank[c.rank]||c.rank)+suit[c.suit];}).join(' · ')+'. Dotted cards above have not been dealt.</p>':'');}
 function renderDetail(c){selectedCategory=c;var title=c===9?'Royal flush':Poker.CATEGORY_NAMES[c];var html='<div class="guide-detail"><b>'+title+'</b><br>'+(c===9?'Ten, jack, queen, king and ace in the same suit. This is the strongest straight flush.':descriptions[c])+cardExample(c===9?['Ah','Kh','Qh','Jh','10h']:examples[c]);if(guideTab==='possibilities'&&started){var a=getAnalysis(),row=a&&a.rows[c];if(row&&row.possible!==false)html+=hypotheticalHTML(row.example);if(row&&visibleBoard.length>=3&&visibleBoard.length<5){html+='<p>These unseen <b>next cards</b> immediately change your current hand to this stronger category. They are not guaranteed winning cards.</p>';if(row.outs.length)html+='<div class="out-cards">'+row.outs.map(function(k){var s=k.slice(-1),r=Number(k.slice(0,-1));return '<span class="out-card '+(s==='h'||s==='d'?'red ':'')+'suit-'+s+'">'+(rank[r]||r)+suit[s]+'</span>';}).join('')+'</div>';else html+='<p>No single next card immediately upgrades you to this category. The final-hand percentage also includes two-card possibilities when two board cards remain.</p>';}else if(visibleBoard.length===5)html+='<p>All community cards are visible. Your final category is settled.</p>';else html+='<p>The percentages sample possible five-card boards. Specific next-card improvements become useful once the flop appears.</p>';}html+='</div>';$('journalDetail').innerHTML=html;}
 function openJournal(){audio.init();delete guideErrors[analysisKey()];lastFocus=document.activeElement;closeAll(false);$('journalBackdrop').classList.remove('hidden');$('journal').classList.remove('hidden');syncScenePause();renderJournal();sound('guideOpen');$('closeJournal').focus();}
 function closeAll(focus){var had=paused();disarmDiscard();$('journal').classList.add('hidden');['settings','rules','confirmReset','recap','eveningClose','shelf','online','gameOver'].forEach(function(id){$(id).classList.add('hidden');});$('journalBackdrop').classList.add('hidden');syncScenePause();if(had)sound('guideClose');if(focus!==false&&lastFocus&&lastFocus.isConnected)lastFocus.focus();}
 function openModal(id){audio.init();lastFocus=document.activeElement;closeAll(false);$('journalBackdrop').classList.remove('hidden');$(id).classList.remove('hidden');syncScenePause();sound('guideOpen');var focus=$(id).querySelector('button,input,select');if(focus)focus.focus();}
 document.addEventListener('click',function(e){var b=e.target.closest('button');if(!b||b.disabled)return;var id=b.id;if(b.dataset.close){closeAll();return;}if(b.dataset.action){act(b.dataset.action);return;}if(b.dataset.buy){var bought=HearthClub.buy(club,b.dataset.buy);if(bought.ok){club=bought.state;saveClub();applyComforts();sound('chips');}renderShelf();return;}if(b.dataset.tab){guideTab=b.dataset.tab;selectedCategory=null;document.querySelectorAll('.journal-tabs button').forEach(function(x){x.classList.toggle('selected',x===b);});sound('click');renderJournal();return;}if(b.dataset.category!==undefined){renderDetail(Number(b.dataset.category));sound('click');$('journalDetail').scrollIntoView({block:'nearest',behavior:$('reducedMotion').checked?'auto':'smooth'});return;}if(b.dataset.raise){var l=table.legalActions(),min=Math.min(l.minRaiseTo,l.maxRaiseTo),v=b.dataset.raise==='min'?min:b.dataset.raise==='all'?l.maxRaiseTo:table.currentBet+Math.round((table.pot+l.call)*(b.dataset.raise==='half'?.5:1));v=Math.max(min,Math.min(l.maxRaiseTo,v));$('raiseRange').value=$('raiseNumber').value=v;sound('chips');return;}
  if(id==='resumeGame')closeAll();else if(id==='settingsRules')openModal('rules');else if(id==='quitGame'||id==='windowQuit')quitGame();else if(id==='discardQuit'){if(discardArmed)discardAndQuit();else armDiscard(b);}else if(id==='recapButton'){renderRecap();openModal('recap');}else if(id==='startButton')start();else if(id==='onlineButton'){startOnlineFlow();}else if(id==='onlineRejoinButton'){onlineRejoinRoom();}else if(id==='onlineCreateSubmit')onlineCreateRoom();else if(id==='onlineJoinSubmit')onlineJoinRoom();else if(id==='onlineStartSubmit')HearthOnline.start();else if(id==='onlineNextSubmit'){busy=true;render();HearthOnline.next();driveOnlineAfterAction(version);}else if(id==='onlineLeaveSubmit')onlineLeaveRoom();else if(id==='nextHand'||id==='recapNextHand'){if(busy||!revealed)return;if(eveningOver()){closeEvening();return;}closeAll(false);audio.init();if(table.players[0].stack===0)rebuy();else newHand();}else if(id==='endEvening'){if(busy||!revealed)return;closeEvening();}else if(id==='newEveningButton'){closeAll(false);audio.init();newEvening();}else if(id==='shelfButton'||id==='eveningShelf'){renderShelf();openModal('shelf');}else if(id==='freshTable'){if(busy||!revealed)return;closeAll(false);audio.init();reset();}else if(id==='guideButton'||id==='peekButton')openJournal();else if(id==='closeJournal')closeAll();else if(id==='soundButton'){syncSettings();openModal('settings');}else if(id==='tableSetup'){setupChoices();openModal('confirmReset');}else if(id==='rulesButton')openModal('rules');else if(id==='newTableButton'){setupChoices();openModal('confirmReset');}else if(id==='resetConfirm'){var selected=HearthRoster.selected();if(selected.length!==Number($('tableSize').value)-1)return;names=['You'].concat(selected);tableKind=HearthTables.find($('tableKind').value).id;chosenDifficulty=Poker.DIFFICULTIES.indexOf($('tableDifficulty').value)>=0?$('tableDifficulty').value:'standard';reset();}else if(id==='raiseToggle')raisePanel();else if(id==='raiseConfirm')confirmRaise();else if(id==='muteButton'){audio.toggleMute();syncSettings();saveSettings();}else if(id==='testSound'){audio.init();audio.play('chips',{intensity:1});}
 });
 $('gamePace').addEventListener('change',function(){pace=this.value;$('stage').style.setProperty('--pace',HearthSession.paceFactor(pace));saveSettings();});
 $('journalBackdrop').addEventListener('click',function(){closeAll();});
 document.addEventListener('input',function(e){var id=e.target.id;if(id==='raiseRange')$('raiseNumber').value=e.target.value;if(id==='raiseNumber'&&$('raiseRange'))$('raiseRange').value=e.target.value;if(id==='masterVolume')audio.setMaster(Number(e.target.value)/100);if(id==='musicVolume')audio.setMusic(Number(e.target.value)/100);if(id==='ambienceVolume')audio.setAmbience(Number(e.target.value)/100);if(id==='effectsVolume')audio.setEffects(Number(e.target.value)/100);if(id==='reducedMotion'){$('stage').classList.toggle('gentle',e.target.checked);cat.tick(0,{gentle:e.target.checked,paused:paused(),hidden:document.hidden});}if(id==='fourColour')document.body.classList.toggle('four-colour',e.target.checked);if(id==='largeText')document.body.classList.toggle('large-text',e.target.checked);if(['masterVolume','musicVolume','ambienceVolume','effectsVolume','reducedMotion','fourColour','largeText'].indexOf(id)>=0)queueSettingsSave();});
 function syncSettings(){$('masterVolume').value=audio.getMaster()*100;$('effectsVolume').value=audio.getEffects()*100;$('musicVolume').value=audio.getMusic()*100;$('ambienceVolume').value=audio.getAmbience()*100;$('muteButton').textContent=audio.isMuted()?'Unmute sounds':'Mute all';$('gamePace').value=pace;saveSession();}
 document.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();if(e.repeat)return;if(paused())closeAll();else{if(raiseOpen)renderActions();syncSettings();openModal('settings');}return;}if(e.key==='Tab'&&paused()){var modal=['journal','settings','rules','confirmReset','recap','eveningClose','shelf','online'].map($).find(function(x){return !x.classList.contains('hidden');});var focusable=Array.from(modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')).filter(function(el){return el.getClientRects().length>0;});if(focusable.length){var first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return;}if(e.key==='Enter'&&e.target.id==='raiseNumber'){e.preventDefault();confirmRaise();return;}if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;if(e.key.toLowerCase()==='h'){e.preventDefault();if(!$('journal').classList.contains('hidden'))closeAll();else openJournal();}if(paused()||e.repeat)return;if(e.key.toLowerCase()==='c'&&started&&table.actor===0&&!busy)act(table.legalActions().check?'check':'call');if(e.key.toLowerCase()==='f')act('fold');});
 var npcHoverTimes={},lastNpcSound=0;
 document.addEventListener('companion-hover',function(e){if(paused()||document.hidden)return;var now=performance.now(),key=e.detail.character,el=e.target;if(now-(npcHoverTimes[key]||-9999)<4000)return;npcHoverTimes[key]=now;el.classList.remove('hover-react');void el.offsetWidth;el.classList.add('hover-react');setTimeout(function(){el.classList.remove('hover-react');},1150);if(started&&now-lastNpcSound>750){audio.play('npc_'+key,{volume:.45,pan:Number(el.dataset.pan)});lastNpcSound=now;}});
 var lastHover=0,lastCardHover=0,pointerHovers=matchMedia('(hover:hover)').matches;
 document.addEventListener('mouseover',function(e){
  if(!pointerHovers||!started)return;
  // Your own two cards riffle quietly when you look at them. Throttled well
  // past the cue's length so sliding between them does not stack it.
  if(e.target.closest('#holeCards .card')){if(table.players[0].hole.length!==2||Date.now()-lastCardHover<900)return;lastCardHover=Date.now();audio.play('shuffle',{volume:.2,pitch:1.15});return;}
  if(!e.target.closest('button')||Date.now()-lastHover<80)return;lastHover=Date.now();sound('hover');});
 function atmosphere(){var cv=$('atmosphere'),ctx=cv.getContext('2d'),motes=[];
  // The buffer follows the stage's design space, so motes stay square dots
  // instead of being stretched into streaks by a portrait box.
  fitMotes=function(){var box=HearthSeating.STAGE[seatVariant()];if(cv.width===box.width&&cv.height===box.height)return;cv.width=box.width;cv.height=box.height;motes.length=0;for(var i=0;i<24;i++)motes.push({x:Math.random()*box.width,y:Math.random()*box.height,r:1+Math.random()*2,s:.1+Math.random()*.16,p:Math.random()*6});};
  fitMotes();
  var frames=0,motion=$('reducedMotion'),painted=false;
  function frame(){requestAnimationFrame(frame);
   // Nothing to animate behind a modal, on a hidden tab, or in gentle motion.
   // Clearing once on the way in stops the last motes freezing mid-air.
   if(motion.checked||document.hidden||paused()){if(painted){ctx.clearRect(0,0,cv.width,cv.height);painted=false;}return;}
   if(++frames%2)return;
   ctx.clearRect(0,0,cv.width,cv.height);painted=true;
   motes.forEach(function(m){m.y-=m.s;m.x+=Math.sin(frames*.002+m.p)*.13;if(m.y<0)m.y=cv.height;ctx.fillStyle='rgba(242,203,134,'+(.10+.10*Math.sin(frames*.013+m.p))+')';ctx.fillRect(Math.floor(m.x/2)*2,Math.floor(m.y/2)*2,2,2);});}
  frame();}atmosphere();
 /* ---------- Online play ----------
  * An optional private room, joined by a generated code, played over a
  * Cloudflare Worker (see game/multiplayer.js and worker/). Nothing above
  * this line changes for single-player: `online` stays false until a player
  * explicitly creates or joins a room, and every branch above that checks
  * it leaves the existing single-player path byte-for-byte as it was.
  *
  * The server is the only place any hand or action is decided; this file's
  * job online is exactly what it already does for single-player - replay a
  * public event log with the table's chosen pace, and turn a button click
  * into one message. table.legalActions()/table.players[0].hole already
  * come from the server pre-shaped as if seat 0 were always the human (see
  * worker/view.js's rotation), so render()/renderActions()/configureSeats()
  * need no changes at all to draw an online table.
  *
  * Deliberately out of scope here (see the project's plan): the club fund
  * and 12-hand "evening" never apply online - eveningHands simply never
  * moves in this file for an online table, so eveningOver() stays false and
  * the existing single-player settle-up screen never appears. A visible
  * turn-clock countdown and text/voice chat are not built yet either.
  */
 function onlineSavedName(){try{return localStorage.getItem('hearthside-online-name')||'';}catch(e){return '';}}
 function onlineSaveName(name){try{localStorage.setItem('hearthside-online-name',name);}catch(e){}}
 function onlineSavedAvatar(){try{return localStorage.getItem('hearthside-online-avatar')||'';}catch(e){return '';}}
 function onlineSaveAvatar(avatar){try{localStorage.setItem('hearthside-online-avatar',avatar);}catch(e){}}
 // Lets a full page reload (a phone backgrounding Safari long enough that it
 // discards the tab, an accidental refresh) come back to the same seat
 // instead of losing it outright - the seat's own token is all hello()'s
 // reconnect path needs. Saved fresh on every successful welcome (a first
 // join AND every automatic reconnect alike), so the 10-minute expiry below
 // tracks time since last real contact with the room, not time since it was
 // first joined. A stale/expired entry just fails harmlessly (see the
 // 'error' handler) rather than needing to be proactively cleaned up here.
 function onlineSavedSession(){try{var s=JSON.parse(localStorage.getItem('hearthside-online-session')||'null');if(!s||!s.room||!s.token||Date.now()-(s.savedAt||0)>10*60*1000)return null;return s;}catch(e){return null;}}
 function onlineSaveSession(room,token){try{localStorage.setItem('hearthside-online-session',JSON.stringify({room:room,token:token,savedAt:Date.now()}));}catch(e){}}
 function onlineClearSession(){try{localStorage.removeItem('hearthside-online-session');}catch(e){}}
 function onlineErrorText(code){return {'no-such-room':'That room doesn’t exist. Check the code and try again.','room-full':'That room is already full.','room-already-started':'That room has already started without you.','already-created':'That code is already taken — try Create again for a new one.','connection-failed':'Couldn’t reach the room server. It may not be set up yet — see worker/README.md.'}[code]||'Something went wrong. Please try again.';}
 function renderOnlineEntry(errorText){
  var body=$('onlineBody');body.innerHTML='<label>Your name<input id="onlineName" maxlength="12" placeholder="Your name"></label>'+
   '<label>Play as<select id="onlineAvatar"></select></label>'+
   '<h3>Create a private room</h3><label>Players<select id="onlineSeatCount"><option value="2">2 players</option><option value="3">3 players</option><option value="4" selected>4 players</option><option value="5">5 players</option><option value="6">6 players</option><option value="7">7 players</option></select></label>'+
   '<label>Companions<select id="onlineDifficulty"><option value="gentle">Gentle</option><option value="standard" selected>Standard</option><option value="sharp">Sharp</option></select></label>'+
   '<label>The evening<select id="onlineTableKind"></select></label>'+
   '<label>Hands per game<select id="onlineHandsPerGame"><option value="3">3 hands</option><option value="5">5 hands</option><option value="7" selected>7 hands</option><option value="10">10 hands</option><option value="15">15 hands</option></select></label>'+
   '<div class="settings-row"><button id="onlineCreateSubmit" class="primary">Create a room</button></div>'+
   '<h3>Join a friend’s room</h3><label>Room code<input id="onlineCode" maxlength="9" placeholder="BCDF-GH" style="text-transform:uppercase"></label>'+
   '<div class="settings-row"><button id="onlineJoinSubmit" class="primary">Join</button></div>'+
   '<p id="onlineError" class="pace-note"></p>';
  var kind=$('onlineTableKind');HearthTables.tables.forEach(function(t){var o=document.createElement('option');o.value=t.id;o.textContent=t.name;kind.appendChild(o);});
  var avatar=$('onlineAvatar');HearthRoster.all.forEach(function(c){var o=document.createElement('option');o.value=c.asset;o.textContent=c.name+', '+c.animal;avatar.appendChild(o);});
  avatar.value=onlineSavedAvatar()||HearthRoster.all[0].asset;
  $('onlineName').value=onlineSavedName();
  if(errorText)$('onlineError').textContent=errorText;
 }
 function renderOnlineLobby(msg){
  var body=$('onlineBody');body.innerHTML='';
  var codeLine=document.createElement('p');codeLine.className='pace-note';codeLine.appendChild(document.createTextNode('Room code: '));
  var codeStrong=document.createElement('strong');codeStrong.textContent=onlineRoomCode?HearthRoomCode.display(onlineRoomCode):'…';codeLine.appendChild(codeStrong);
  body.appendChild(codeLine);
  if(msg.config&&msg.config.handsPerGame){var lenLine=document.createElement('p');lenLine.className='pace-note';lenLine.textContent='A game here runs '+msg.config.handsPerGame+' hands - anyone who busts sits out the rest of it, then everyone starts fresh.';body.appendChild(lenLine);}
  var list=document.createElement('ul');list.className='log-list';
  (msg.seats||[]).forEach(function(s){var li=document.createElement('li');li.textContent=(s.kind==='ai'?'Companion · ':s.connected?'':'Away · ')+s.name;list.appendChild(li);});
  body.appendChild(list);
  if(HearthOnline.owner){var startBtn=document.createElement('button');startBtn.id='onlineStartSubmit';startBtn.className='primary';startBtn.textContent='Deal the first hand';body.appendChild(startBtn);}
  else{var waiting=document.createElement('p');waiting.className='pace-note';waiting.textContent='Waiting for the host to deal.';body.appendChild(waiting);}
  var leaveBtn=document.createElement('button');leaveBtn.id='onlineLeaveSubmit';leaveBtn.textContent='Leave the room';body.appendChild(leaveBtn);
 }
 function startOnlineFlow(){closeAll(false);openModal('online');renderOnlineEntry();}
 function onlineCreateRoom(){
  var name=($('onlineName').value||'').trim().slice(0,12)||'Guest';onlineSaveName(name);
  var avatar=$('onlineAvatar').value;onlineSaveAvatar(avatar);
  onlineRoomCode=HearthRoomCode.generate();
  HearthOnline.connect({room:onlineRoomCode,name:name,avatar:avatar,create:true,cfg:{seatCount:Number($('onlineSeatCount').value),difficulty:$('onlineDifficulty').value,tableKind:$('onlineTableKind').value,handsPerGame:Number($('onlineHandsPerGame').value)}});
 }
 function onlineJoinRoom(){
  var name=($('onlineName').value||'').trim().slice(0,12)||'Guest';onlineSaveName(name);
  var avatar=$('onlineAvatar').value;onlineSaveAvatar(avatar);
  var code=HearthRoomCode.normalize($('onlineCode').value);
  if(!code){renderOnlineEntry('That doesn’t look like a room code.');return;}
  onlineRoomCode=code;
  HearthOnline.connect({room:code,name:name,avatar:avatar});
 }
 // Offered on the main screen instead of "Play with friends" whenever a
 // recent session is saved - one click straight back to the same seat via
 // the token hello() already knows how to resume, no name/avatar re-entry.
 function onlineRejoinRoom(){
  var saved=onlineSavedSession();if(!saved)return;
  onlineRoomCode=saved.room;onlineRejoining=true;
  closeAll(false);openModal('online');
  $('onlineBody').innerHTML='<p class="pace-note">Rejoining room '+HearthRoomCode.display(saved.room)+'…</p>';
  HearthOnline.connect({room:saved.room,token:saved.token});
 }
 function renderGameOver(msg){
  $('gameOverTitle').textContent='Game '+msg.gamesPlayed+' complete';
  var body=$('gameOverBody');body.innerHTML='';
  var standings=document.createElement('ol');standings.className='log-list';
  (msg.standings||[]).forEach(function(row){var li=document.createElement('li');li.textContent=row.place+'. '+(row.seat===0?'You':row.name)+' — '+row.stack.toLocaleString()+' chips';standings.appendChild(li);});
  body.appendChild(standings);
  if(msg.cumulative&&msg.cumulative.length){
   var h=document.createElement('h3');h.textContent='Session wins';body.appendChild(h);
   var wins=document.createElement('ul');wins.className='log-list';
   msg.cumulative.forEach(function(row){var li=document.createElement('li');li.textContent=(row.seat===0?'You':row.name)+' — '+row.wins+(row.wins===1?' win':' wins');wins.appendChild(li);});
   body.appendChild(wins);
  }
 }
 function onlineLeaveRoom(){
  HearthOnline.leave();HearthOnline.disconnect();
  online=false;started=false;joining=false;busy=false;activeSeat=null;version++;
  onlineClearSession();
  // table/names must not be left pointing at the online room: if no saved
  // single-player hand exists, the next "Take a seat" click calls newHand()
  // directly on whatever table/names currently are, with no reconstruction
  // in between - so this has to already be a fresh, ordinary local table.
  // (If a saved hand DOES exist, start()'s restore path rebuilds both from
  // scratch anyway, making this harmless in that case too.)
  names=['You','Juniper','Luna','Moss'];table=new Poker.Table({names:names,difficulty:chosenDifficulty});window.hearth.table=table;
  configureSeats();$('stage').classList.remove('seated');closeAll();renderActions();
 }
 function beginOnlinePlay(){
  online=true;reconnecting=false;reconnectAttempts=0;table=HearthOnline.table;names=table.names;version++;
  configureSeats();window.hearth.table=table;
  $('stage').classList.add('seated');started=true;joining=false;busy=false;activeSeat=null;
  closeAll(false);
  onlineHandNumber=table.handNumber;eventIndex=0;visibleSeats=table.players.map(function(p){return {stack:p.stack,bet:0,folded:false,allIn:false,lastAction:''};});visibleBoard=[];visiblePot=0;visibleStreet='preflop';revealed=false;
  driveOnline(version);
 }
 // The online equivalent of drive(): replays the server's public event log
 // with the same pacing/sound/particle treatment as single-player, but never
 // calls checkpoint() (online has nothing to do with the local save) and
 // never touches the evening/tally bookkeeping (online rooms don't use it).
 // Where single-player would call table.stepAI() for a non-human seat, this
 // waits for the server's next push instead - the server has already
 // resolved every AI turn by the time that push arrives.
 async function driveOnline(t){
  // Each online hand's event log restarts from index 0 on the server (see
  // multiplayer.js's _applyEventsMessage), but eventIndex is this file's own
  // separate replay cursor - nothing else ever rewound it, so from hand 2
  // onward it stayed pointed past the end of the new, shorter array and the
  // inner loop below silently never ran again: the board, cards and message
  // froze at hand 1 forever while turn-taking kept working underneath,
  // since that reads table.actor/table.result directly. Catch the same
  // hand-number change beginOnlinePlay() handles for hand 1, every hand -
  // and before the render() just below, which would otherwise mix this
  // hand's fresh hole cards with last hand's still-stale visibleBoard (a
  // coincidentally reused card there throws deep inside Poker.evaluate and
  // silently aborts this whole async function, leaving busy stuck true).
  if(table.handNumber!==onlineHandNumber){onlineHandNumber=table.handNumber;eventIndex=0;visibleSeats=table.players.map(function(p){return {stack:p.stack,bet:0,folded:false,allIn:false,lastAction:''};});visibleBoard=[];visiblePot=0;visibleStreet='preflop';revealed=false;}
  busy=true;activeSeat=null;render();
  // An uncaught exception anywhere in here (this bug, or a future one) used
  // to abort this whole async function silently, leaving busy stuck true
  // forever with no way back in short of a page reload - mirrors drive()'s
  // own try/catch around stepAI() for the same reason.
  try{
   while(t===version&&online){
    while(eventIndex<table.events.length){
     var e=table.events[eventIndex];applyPublicEvent(e);
     if(e.type==='hand-start'){sound('shuffle');visibleStreet='preflop';visibleBoard=[];revealed=false;visiblePot=0;render();for(var d=0;d<table.players.filter(function(p){return p.hole.length;}).length*2;d++){sound('deal',d%table.players.length);if(!await wait(75,t))return;}setMessage('');}
     if(e.type==='blind'||e.type==='action'){visiblePot+=e.amount||0;if(e.type==='action'){sound(e.action==='call'?'chips':e.action==='allin'?'raise':e.action,e.playerId);setMessage((table.names[e.playerId]||'Someone')+' · '+e.text);}else sound('chips',e.playerId);if(e.amount)chipFlight(e.playerId);render();if(!await wait(e.type==='blind'?550:350,t))return;}
     if(e.type==='street'){visibleStreet=e.street;setMessage({flop:'',turn:'',river:''}[e.street]);for(var k=Math.max(0,visibleBoard.length-(e.board.length-e.cards.length));k<e.cards.length;k++){visibleBoard.push(e.cards[k]);sound('flip');render();if(!await wait(320,t))return;}if(!await wait(220,t))return;}
     if(e.type==='result'){visibleStreet='showdown';revealed=true;visiblePot=e.result.totalPot;var wins=e.result.winners.filter(function(w){return w.wonAmount>0;});var bonusText=(e.result.bonus||[]).map(function(b){return (b.playerId===0?'You pocket':(table.names[b.playerId]||'Someone')+' pockets')+' a Jack-Two bonus of '+b.amount+' from the table!';}).join(' ');setMessage(HearthPresentation.resultLabel(e.result,table.names)+(bonusText?' · '+bonusText:''),true);var humanWin=wins.some(function(w){return w.id===0;});sound(humanWin?'win':'lose');var wa=anchors();burst(humanWin?wa.heroWin[0]:seatPoint(wins[0]?wins[0].id:0)[0],humanWin?wa.heroWin[1]:wa.rivalWinY,humanWin?22:9);$('potValue').classList.add('burst');setTimeout(function(){$('potValue').classList.remove('burst');},500);render();if(!await wait(500,t))return;}
     eventIndex++;
    }
    if(!online)return;
    if(table.result||table.actor===0||table.actor===null)break;
    activeSeat=table.actor;render();
    if(!await HearthOnline.waitForEvents(t))return;
   }
   if(t!==version||!online)return;busy=false;activeSeat=table.result?null:table.actor;render();if(table.actor===0&&!table.result)sound('turn');
  }catch(err){
   console.error(err);
   if(t===version&&online){busy=false;activeSeat=null;setMessage('Something went wrong catching up on the table. Try your action again, or leave and rejoin the room.');renderActions();}
  }
 }
 // Every successful welcome - a first join or any later automatic reconnect
 // alike - refreshes the saved session, so onlineRejoinRoom() above always
 // has an up-to-date token to come back to (and its 10-minute expiry tracks
 // time since we were last actually in the room, not time since we joined).
 HearthOnline.on('welcome',function(msg){onlineSaveSession(onlineRoomCode,msg.token);});
 HearthOnline.on('lobby',function(msg){if(!online){onlineRejoining=false;renderOnlineLobby(msg);}else if(reconnecting){reconnecting=false;reconnectAttempts=0;}});
 // Once already online, driveOnline()'s own waitForEvents(t) call is what
 // wakes back up to consume a new push - nothing else needs to react here,
 // except right after a reconnect: that loop already returned (its wait was
 // cancelled when the old socket closed), so it has to be restarted here.
 HearthOnline.on('events',function(){if(!online){onlineRejoining=false;beginOnlinePlay();}else if(reconnecting){reconnecting=false;reconnectAttempts=0;beginOnlinePlay();}});
 // Not a poker.js event - a standalone notice the server sends alongside
 // (just before) the fresh game's own dealt-hand broadcast. Shown as its own
 // pausing modal rather than folded into driveOnline()'s replay: the new
 // game keeps dealing normally underneath regardless of whether anyone has
 // dismissed this yet.
 HearthOnline.on('game-over',function(msg){renderGameOver(msg);openModal('gameOver');});
 // A rejected action (a stale click, a timing race) must not leave the table
 // stuck mid-"waiting" forever - fall back to whatever the table already
 // knows, which is still correct since nothing here invalidated it.
 HearthOnline.on('error',function(msg){
  if(!online){
   // A saved session that no longer resolves (the room expired, the token
   // was never valid) would otherwise keep offering a "Rejoin" that can
   // only ever fail again the same way.
   if(onlineRejoining){onlineRejoining=false;onlineClearSession();}
   renderOnlineEntry(onlineErrorText(msg.error));return;
  }
  if(msg.error==='connection-failed')return; // attemptReconnect() below owns reconnect messaging
  busy=false;activeSeat=table.result?null:table.actor;setMessage(onlineErrorText(msg.error));renderActions();
 });
 // A dropped connection (a phone locking, a network blip) gets a few quiet
 // reconnect attempts - using the seat's own token, so it resumes the same
 // seat - before giving up and telling the player outright. Triggered both
 // by the socket actually closing, and (below) by the tab becoming visible
 // again to a socket that silently died while hidden without ever firing a
 // close event at all - common on mobile, where the OS can freeze a
 // background tab's networking without the page ever finding out.
 function attemptReconnect(){
  if(!online)return;
  if(reconnectAttempts>=5){online=false;reconnecting=false;setMessage('The connection to the room was lost.');renderActions();return;}
  reconnecting=true;reconnectAttempts++;busy=true;
  setMessage('Reconnecting'+'.'.repeat(Math.min(reconnectAttempts,3))+'…');renderActions();
  setTimeout(function(){if(online)HearthOnline.reconnect();},Math.min(1000*reconnectAttempts,4000));
 }
 HearthOnline.on('close',attemptReconnect);
 document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='visible'&&online&&!reconnecting&&(!HearthOnline.ws||HearthOnline.ws.readyState!==WebSocket.OPEN)){reconnectAttempts=0;attemptReconnect();}
 });

 window.hearth={table:table,audio:audio,companions:companions,cat:cat,ambience:ambience,computation:computation,saveSession:saveSession,openJournal:openJournal,closeAll:closeAll,getState:function(){return {started:started,joining:joining,activeSeat:activeSeat,busy:busy,paused:paused(),visibleBoard:visibleBoard.map(function(c){return Object.assign({},c);}),revealed:revealed,visiblePot:visiblePot,visibleSeats:visibleSeats.map(function(p){return Object.assign({},p);}),companionSpeech:companions.getState()};}};
 var companionClock=Date.now();setInterval(function(){var now=Date.now();var context=companionContext();companions.tick(now-companionClock,context);cat.tick(now-companionClock,{hidden:context.hidden,paused:context.paused,gentle:$('reducedMotion').checked});ambience.setPaused(context.paused);companionClock=now;},80);document.addEventListener('visibilitychange',function(){companionClock=Date.now();companions.tick(0,companionContext());syncScenePause();});
 configureSeats();applyComforts();$('stage').style.setProperty('--pace',HearthSession.paceFactor(pace));syncSettings();companions.clear();render();setTimeout(function(){if(!started)companions.handle({type:'greeting'},companionContext());},600);
 addEventListener('pagehide',function(e){saveSession();if(!e.persisted)computation.dispose();});
 
})();

