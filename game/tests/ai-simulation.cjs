'use strict';
// Reproducible pacing benchmark. Human checks/calls, optionally opening to
// 2.5 big blinds preflop. Sessions stop when the human busts, as the app does.
const Poker=require('../poker.js');
function seeded(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function runScenario({sessions=100,handLimit=40,smallOpens=false}={}){
  const report={sessions,handLimit,humanPolicy:smallOpens?'2.5 BB preflop opening, otherwise check/call':'check/call',hands:0,aiActions:0,aiPreflopRaises:0,aiPreflopJamHands:0,aiProactivePreflopJamHands:0,aiEarlyJamHands:0,aiProactiveEarlyJamHands:0,aiAnyJamHands:0,boardReach:{flop:0,turn:0,river:0},bettingReach:{flop:0,turn:0,river:0},humanOpens:0};
  for(let session=1;session<=sessions;session++){
    const table=new Poker.Table();table.dealer=session%4-1;
    for(let hand=1;hand<=handLimit&&!table.gameOver&&table.players[0].stack>0;hand++){
      // Separate random streams keep initial cards comparable across policies.
      table.random=seeded(session*100003+hand*71);table.newHand();table.random=seeded(session*7919+hand*101+17);
      report.hands++;const reached=new Set();let preJam=false,prePro=false,earlyJam=false,earlyPro=false,anyJam=false,humanActedPre=false,guard=0;
      while(!table.result){
        if(++guard>250)throw new Error('A hand failed to terminate.');
        const id=table.actor,street=table.street,legal=table.legalActions(),stack=table.players[id].stack;reached.add(street);
        let decision;
        if(id===0){
          if(smallOpens&&street==='preflop'&&!humanActedPre&&table.currentBet===table.bigBlind&&legal.canRaise&&legal.maxRaiseTo>25){decision={type:'raise',amount:25};report.humanOpens++;}
          else decision={type:legal.check?'check':'call'};
          if(street==='preflop')humanActedPre=true;
        }else{decision=table.chooseAIAction();report.aiActions++;}
        const commitsAll=decision.type==='allin'||decision.type==='call'&&legal.call===stack||decision.type==='raise'&&decision.amount===legal.maxRaiseTo;
        const proactive=decision.type==='raise'||decision.type==='allin';
        if(id>0){
          if(street==='preflop'&&proactive)report.aiPreflopRaises++;
          if(commitsAll){anyJam=true;if(street==='preflop')preJam=true;if(street==='preflop'||street==='flop')earlyJam=true;if(proactive){if(street==='preflop')prePro=true;if(street==='preflop'||street==='flop')earlyPro=true;}}
        }
        table.act(id,decision.type,decision.amount);
        if(table.players.reduce((sum,p)=>sum+p.stack,table.pot)!==2000)throw new Error('Chip conservation failed.');
      }
      report.aiPreflopJamHands+=preJam;report.aiProactivePreflopJamHands+=prePro;report.aiEarlyJamHands+=earlyJam;report.aiProactiveEarlyJamHands+=earlyPro;report.aiAnyJamHands+=anyJam;
      ['flop','turn','river'].forEach((street,i)=>{if(table.board.length>=[3,4,5][i])report.boardReach[street]++;if(reached.has(street))report.bettingReach[street]++;});
    }
  }
  return report;
}
if(require.main===module){
  for(const [name,settings] of Object.entries({fresh:{sessions:1000,handLimit:1},continuing:{sessions:100,handLimit:40},smallOpens:{sessions:100,handLimit:40,smallOpens:true}}))console.log(JSON.stringify({name,...runScenario(settings)},null,2));
}
module.exports={seeded,runScenario};
