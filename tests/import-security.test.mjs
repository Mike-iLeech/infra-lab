import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demo,validate} from '../dist/model.js';
import {cableHTML} from '../dist/physical-ui.js';
test('import rejects markup in identifiers and unknown cable CSS classes',()=>{for(const mutate of [s=>s.nodes[0].id='x" onmouseover="alert(1)',s=>s.nodes.find(n=>n.interfaces.length).interfaces[0].id='<img src=x>',s=>s.links[0].id='x"><svg/onload=alert(1)>',s=>s.links[0].medium='copper" onload="alert(1)']){const s=demo();mutate(s);assert.throws(()=>validate(s))}});
test('import rejects duplicate cable IDs and unsafe manual route keys',()=>{let s=demo();s.links[1].id=s.links[0].id;assert.throws(()=>validate(s));s=demo();s.wireRoutes=[{id:'link:x" onload="alert(1)',points:[{x:0,y:0},{x:100,y:0}]}];assert.throws(()=>validate(s))});
test('cable length must be numeric on import and is escaped independently by its properties renderer',()=>{for(const value of ['"><img src=x onerror=alert(1)>','3',-1,Infinity,1e8]){const s=demo();s.links[0].length=value;assert.throws(()=>validate(s));assert.ok(!cableHTML(s.links[0]).includes('<img'))}const s=demo();s.links[0].length=0;validate(s)});
test('passive pair index cannot carry imported markup or nonpositive/noninteger values',()=>{for(const value of ['<img src=x onerror=alert(1)>','1',0,-1,1.5]){const s=demo();s.nodes.find(n=>n.type==='fiber_panel').interfaces[0].pairIndex=value;assert.throws(()=>validate(s))}});
