const test=require('node:test'),assert=require('node:assert/strict'),P=require('../poker.js');
const c=s=>s.split(' ').map(x=>({rank:({A:14,J:11})[x[0]]||+x[0],suit:x[1]}));
test('Screenshot 51: shared fives make one pair, with ace/jack/six kickers',()=>{
 const h=P.evaluate(c('2d Ac 6d 5s 4c Js 5c'));
 assert.equal(h.category,1);assert.deepEqual(h.tiebreak,[5,14,11,6]);
 assert.deepEqual(new Set(h.bestCards.map(P.cardKey)),new Set(c('5s 5c Ac Js 6d').map(P.cardKey)));
 assert.equal(P.evaluate(c('2d Ac 6d 5s 4c Js')).category,0,'undrawn river must not create a pair');
});
test('four cards to a straight or flush do not count as made hands',()=>{
 assert.equal(P.evaluate(c('Ac 2c 4c 6c Js 8d 9d')).category,0);
 assert.equal(P.evaluate(c('Ac 2d 4c 5s Js 8d 9d')).category,0);
});
