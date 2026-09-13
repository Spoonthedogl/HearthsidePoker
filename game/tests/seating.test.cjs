const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../poker.js'),S=require('../session.js'),Seats=require('../seating.js');
const cast=['You','Juniper','Luna','Moss','Clipper','Mur','Baron'];
const seeded=n=>()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
const ui=t=>({eventIndex:t.events.length,visibleBoard:t.board,visiblePot:t.pot,visibleStreet:t.street,revealed:!!t.result,visibleSeats:t.players.map(p=>({stack:p.stack,bet:p.bet,folded:p.folded,allIn:p.allIn}))});
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
for(let count=2;count<=7;count++){
 test(count+' players: varied hands, all-ins and in-progress saves conserve chips',()=>{
  for(let seed=1;seed<=60;seed++){
   let t=new P.Table({names:cast.slice(0,count),random:seeded(seed)});t.newHand();
   let turns=0;while(!t.result){assert(turns++<200);let legal=t.legalActions();t.act(t.actor,seed%3===0?'allin':seed%3===1&&legal.call?'fold':legal.check?'check':'call');
    assert.equal(t.players.reduce((n,p)=>n+p.stack,0)+t.pot,count*500);
    t=S.unpack(S.pack(t,ui(t))).table;
   }
   assert.equal(t.players.reduce((n,p)=>n+p.stack,0),count*500);
   const cards=t.players.flatMap(p=>p.hole).concat(t.board,t.deck);assert.equal(new Set(cards.map(P.cardKey)).size,cards.length);
  }
 });
 test(count+' players: readable card lanes and labels stay apart and on screen',()=>{
  const layout=Seats.layout(count).slice(1),board={x:504,y:555,width:430,height:108};
  for(const seat of layout){
   for(const box of [seat.body,seat.label,seat.cards,seat.chips]){assert(box.x>=0&&box.y>=0&&box.x+box.width<=1440&&box.y+box.height<=900);}
   assert(!overlaps(seat.cards,board),'Opponent cards cover the board');
   for(const other of layout){assert(!overlaps(seat.cards,other.label),'A nameplate covers cards');if(other.id!==seat.id){assert(!overlaps(seat.label,other.label));assert(!overlaps(seat.cards,other.cards));assert(!overlaps(seat.chips,other.cards));}}
  }
  if(count>=4){assert(layout.some(s=>s.body.x<200));assert(layout.some(s=>s.body.x>900));}
 });
}
test('seven players preserve all-in side pots with unequal stacks',()=>{
 const t=new P.Table({names:cast,random:seeded(83)});[50,100,200,350,500,800,1500].forEach((n,i)=>t.players[i].stack=n);t.newHand();while(!t.result)t.act(t.actor,'allin');
 assert(t.result.pots.length>=6);assert.equal(t.players.reduce((n,p)=>n+p.stack,0),3500);assert.deepEqual(S.unpack(S.pack(t,ui(t))).table.result,t.result);
});
test('heads-up dealer and blinds rotate across consecutive hands',()=>{
 const t=new P.Table({names:cast.slice(0,2)});let previous;
 for(let hand=0;hand<6;hand++){t.newHand();const blinds=t.events.filter(e=>e.type==='blind'&&e.handNumber===t.handNumber);assert.equal(blinds[0].playerId,t.dealer);assert.equal(blinds[1].playerId,1-t.dealer);assert.equal(t.actor,t.dealer);if(previous!==undefined)assert.notEqual(t.dealer,previous);previous=t.dealer;t.act(t.actor,'fold');}
});

