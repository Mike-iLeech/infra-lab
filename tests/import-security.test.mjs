import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demo,validate} from '../dist/model.js';
test('import rejects markup in identifiers and unknown cable CSS classes',()=>{for(const mutate of [s=>s.nodes[0].id='x" onmouseover="alert(1)',s=>s.nodes.find(n=>n.interfaces.length).interfaces[0].id='<img src=x>',s=>s.links[0].id='x"><svg/onload=alert(1)>',s=>s.links[0].medium='copper" onload="alert(1)']){const s=demo();mutate(s);assert.throws(()=>validate(s))}});
test('import rejects duplicate cable IDs and unsafe manual route keys',()=>{let s=demo();s.links[1].id=s.links[0].id;assert.throws(()=>validate(s));s=demo();s.wireRoutes=[{id:'link:x" onload="alert(1)',points:[{x:0,y:0},{x:100,y:0}]}];assert.throws(()=>validate(s))});
