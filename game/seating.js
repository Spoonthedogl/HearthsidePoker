/* Clockwise physical seats, with the human fixed at the near edge. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HearthSeating=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Points the chip and celebration particles fly between. They belong beside
 // the seat geometry because they are in the same design space, and a portrait
 // stage puts the pot and the player's own chips somewhere quite different.
 var STAGE={
  wide:{width:1440,height:900,pot:[755,483],hero:[720,780],heroWin:[720,714],rivalWinY:425},
  compact:{width:768,height:1408,pot:[430,466],hero:[384,910],heroWin:[384,890],rivalWinY:430}
 };
 function wide(count){
  return Array.from({length:count},function(_,id){
   var angle=Math.PI/2+id*2*Math.PI/count,c=Math.cos(angle),s=Math.sin(angle);
   var x=720+540*c,y=535+240*s;
   var cards={x:720+(s>.15?345:300)*c-50,y:550+165*s-34,width:100,height:68};
   var body={x:x-150,y:y-180,width:300,height:300};
   return {id:id,body:body,near:s>.15,mirror:c>.1,label:{x:x-82-(s>.15?c*90:0),y:body.y-(s>.15?105:48),width:164,height:54},cards:cards,
    chips:{x:cards.x+(Math.abs(c)<.15?112:22),y:cards.y+(Math.abs(c)<.15?35:77),width:65,height:26},pan:c*.65};
  });
 }
 /* Portrait phones. Everything for a seat stacks against its own body rather
    than sitting on a shared ring, which keeps the middle of the felt clear for
    the board once a 2x-sized nameplate is in play. */
 function compact(count){
  return Array.from({length:count},function(_,id){
   var angle=Math.PI/2+id*2*Math.PI/count,c=Math.cos(angle),s=Math.sin(angle);
   var x=384+252*c,y=510+240*s,near=s>.15;
   var body={x:x-84,y:y-104,width:168,height:168};
   // Kept off both edges so the blind markers hanging to the left of a
   // nameplate are never clipped by the stage.
   var label={x:Math.max(40,Math.min(528,x-100)),y:near?body.y+176:body.y-66,width:200,height:60};
   var cards={x:x-42,y:near?label.y+62:body.y+176,width:84,height:50};
   return {id:id,body:body,near:near,mirror:c>.1,label:label,cards:cards,
    chips:{x:x-31,y:cards.y+52,width:62,height:26},pan:c*.65};
  });
 }
 function layout(count,variant){
  if(!Number.isInteger(count)||count<2||count>7)throw Error('Choose 2–7 players.');
  return variant==='compact'?compact(count):wide(count);
 }
 return {layout:layout,STAGE:STAGE};
});
