/* Clockwise physical seats, with the human fixed at the near edge. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HearthSeating=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function layout(count){
  if(!Number.isInteger(count)||count<2||count>7)throw Error('Choose 2–7 players.');
  return Array.from({length:count},function(_,id){
   var angle=Math.PI/2+id*2*Math.PI/count,c=Math.cos(angle),s=Math.sin(angle);
   var x=720+540*c,y=535+240*s;
   var cards={x:720+(s>.15?345:300)*c-50,y:550+165*s-34,width:100,height:68};
   var body={x:x-150,y:y-180,width:300,height:300};
   return {id:id,body:body,near:s>.15,mirror:c>.1,label:{x:x-82-(s>.15?c*90:0),y:body.y-(s>.15?105:48),width:164,height:54},cards:cards,
    chips:{x:cards.x+(Math.abs(c)<.15?112:22),y:cards.y+(Math.abs(c)<.15?35:77),width:65,height:26},pan:c*.65};
  });
 }
 return {layout:layout};
});



