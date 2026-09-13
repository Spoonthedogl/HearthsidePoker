/* Small, deterministic presentation helpers. Chip art represents ranges; labels remain exact. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.HearthPresentation=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 var thresholds=[0,1,50,150,300,600,1000];
 var stacks=[[],[2],[4],[3,3],[4,5,4],[5,6,5,4],[6,7,6,5,4]];
 function chipTier(amount){var tier=0;amount=Math.max(0,Number(amount)||0);for(var i=1;i<thresholds.length;i++)if(amount>=thresholds[i])tier=i;return {tier:tier,columns:stacks[tier].slice()};}
 function renderChips(el,amount,name){var shape=chipTier(amount);el.setAttribute('aria-label',name+' has '+amount.toLocaleString()+' chips');el.title=amount.toLocaleString()+' chips';if(el.dataset.tier===String(shape.tier))return;el.dataset.tier=shape.tier;el.innerHTML='';shape.columns.forEach(function(height,column){for(var row=0;row<height;row++){var chip=document.createElement('i');chip.className='bankroll-chip '+(['copper','sage','cream'][column%3]);chip.style.left=(column*14)+'px';chip.style.bottom=(row*4)+'px';el.appendChild(chip);}});}
 function callLabel(legal,stack){return legal.check?'Check':(legal.call>0&&legal.call===stack?'All-in call ':'Call ')+legal.call;}
 function resultLabel(result,names){
  var winners=result.winners.filter(function(w){return w.wonAmount>0;});
  if(winners.length>1){var pots=result.pots.filter(function(p){return !p.uncalled;}),same= pots.every(function(p){return p.winners.length===winners.length&&p.winners.every(function(id){return winners.some(function(w){return w.id===id;});});});return (same?'Split pot':'Multiple pot winners')+' · Review hand for payouts';}
  var w=winners[0];if(!w)return 'Hand complete · Review hand';
  return (w.id===0?'You collect ':names[w.id]+' collects ')+w.wonAmount+' · '+(result.reason==='fold'?'Everyone else folded':w.hand?w.hand.name:'Hand complete');
 }
 return {chipTier:chipTier,renderChips:renderChips,thresholds:thresholds.slice(),callLabel:callLabel,resultLabel:resultLabel};
}));

