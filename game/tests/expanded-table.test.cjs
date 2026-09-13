const test=require('node:test'),assert=require('node:assert/strict'),P=require('../poker.js'),S=require('../session.js'),Cat=require('../cat.js'),Companions=require('../companions.js');
const names=['You','Juniper','Luna','Clipper','Mur','Baron'];
const seeded=n=>()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
function ui(t){return {eventIndex:t.events.length,visibleBoard:t.board,visiblePot:t.pot,visibleStreet:t.street,revealed:!!t.result,visibleSeats:t.players.map(p=>({stack:p.stack,bet:p.bet,folded:p.folded,allIn:p.allIn}))};}
test('six seats complete 300 varied hands and conserve all chips with unique cards',()=>{
 for(let seed=1;seed<=300;seed++){const t=new P.Table({names,random:seeded(seed)});t.newHand();let actions=0;while(!t.result){assert(actions++<250);const l=t.legalActions(),id=t.actor;
 if(seed%4===0)t.act(id,'allin');else if(seed%3===0&&id!==0&&l.call>0)t.act(id,'fold');else t.act(id,l.check?'check':'call');
 assert.equal(t.players.reduce((n,p)=>n+p.stack,0)+t.pot,3000);
 }assert.equal(t.players.reduce((n,p)=>n+p.stack,0),3000);const cs=t.players.flatMap(p=>p.hole).concat(t.board,t.deck);assert.equal(new Set(cs.map(P.cardKey)).size,cs.length);}
});
test('six-seat saves preserve all actors, private cards, pending bets and side pots',()=>{
 const t=new P.Table({names,random:seeded(80)});t.newHand();t.act(t.actor,'allin');const restored=S.unpack(S.pack(t,ui(t))).table;
 assert.equal(restored.players.length,6);assert.deepEqual(restored.deck,t.deck);assert.deepEqual(restored.players,t.players);assert.deepEqual(restored.pending,t.pending);
 for(const table of [t,restored])while(!table.result){let l=table.legalActions();table.act(table.actor,l.check?'check':'call');}
 assert.deepEqual(restored.result,t.result);assert.equal(restored.players.reduce((n,p)=>n+p.stack,0),3000);
});
test('six-seat blinds rotate past empty chairs, then dealer posts small blind heads-up',()=>{
 const t=new P.Table({names});t.players.forEach((p,i)=>p.stack=i===0||i===5?1500:0);t.newHand();let blinds=t.events.filter(e=>e.type==='blind');assert.equal(blinds[0].playerId,t.dealer);assert.equal(blinds[1].playerId,5);assert.equal(t.actor,0);
});
test('six unequal all-in stacks produce conserved side pots and a restorable result',()=>{
 const t=new P.Table({names,random:seeded(93)});[50,100,200,450,700,1500].forEach((n,i)=>t.players[i].stack=n);t.newHand();while(!t.result)t.act(t.actor,'allin');
 assert(t.result.pots.length>=5);assert.equal(t.players.reduce((n,p)=>n+p.stack,0),3000);assert.deepEqual(S.unpack(S.pack(t,ui(t))).table.result,t.result);
});
test('cat spin has exact one-percent interval within scheduled animations',()=>{
 for(const [roll,expected] of [[0,'spin'],[.00999,'spin'],[.01,'stretch'],[.999,'watch']]){let draws=[0,0,roll,0],cat=new Cat({random:()=>draws.length?draws.shift():.99});for(let i=0;i<140;i++)cat.tick(250,{});assert.equal(cat.getState().action,expected);cat.tick(250,{gentle:true});assert.equal(cat.getState().action,'sleep');}
});
test('dialogue follows roster identities when new animals use different seats',()=>{
 let c=new Companions({random:()=>0,roster:[4,5,6,1,2]});assert(c.handle({type:'action',playerId:1,action:'fold'},{}));assert.match(c.getState().line,/bite|tight/);c.clear();assert(c.handle({type:'action',playerId:3,action:'call'},{}));assert.match(c.getState().line,/with you|Staying/);
});
test('six personalities remain legal and retain restrained early betting',()=>{
 for(let seed=1;seed<=12;seed++){let t=new P.Table({names,random:seeded(seed)});t.newHand();let n=0;while(!t.result){assert(n++<250);if(t.actor===0){let l=t.legalActions();t.act(0,l.check?'check':'call');}else{let d=t.chooseAIAction();if(['preflop','flop'].includes(t.street))assert.notEqual(d.type,'allin');t.act(t.actor,d.type,d.amount);}}assert.equal(t.players.reduce((n,p)=>n+p.stack,0),3000);}
});
