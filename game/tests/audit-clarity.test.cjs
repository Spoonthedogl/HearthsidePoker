const test=require('node:test'),assert=require('node:assert/strict'),P=require('../presentation.js');
test('short and exact-stack calls announce all-in, while checks and ordinary calls stay clear',()=>{
 assert.equal(P.callLabel({check:false,call:7},7),'All-in call 7');
 assert.equal(P.callLabel({check:false,call:10},50),'Call 10');
 assert.equal(P.callLabel({check:true,call:0},50),'Check');
});
test('different side-pot winners never share a misleading single hand label',()=>{
 const result={reason:'showdown',winners:[{id:0,wonAmount:90,hand:{name:'Flush'}},{id:1,wonAmount:60,hand:{name:'One Pair'}}],pots:[{winners:[0]},{winners:[1]}]};
 assert.equal(P.resultLabel(result,['You','Luna']),'Multiple pot winners · Review hand for payouts');
 result.pots=[{winners:[0,1]}];assert.equal(P.resultLabel(result,['You','Luna']),'Split pot · Review hand for payouts');
});
test('single-winner banner describes payout rather than implying net profit or including uncalled returns',()=>{
 const result={reason:'showdown',winners:[{id:0,amount:150,wonAmount:50,returnedAmount:100,hand:{name:'Two Pair'}},{id:1,wonAmount:0}],pots:[{winners:[0]}]};
 assert.equal(P.resultLabel(result,['You','Luna']),'You collect 50 · Two Pair');
 result.reason='fold';assert.equal(P.resultLabel(result,['You','Luna']),'You collect 50 · Everyone else folded');
});
