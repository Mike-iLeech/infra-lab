import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../dist/model.js';
import {geometry,settle,routeCable,cableObstacles} from '../dist/geometry.js';
import {commonRouteBounds,insideRouteBounds} from '../dist/route-bounds.js';
test('guest adapter connection stays entirely inside VM and enters from its boundary inward',()=>{
 const s=demo();settle(s);const g=geometry(s),l=s.links.find(l=>l.medium==='adapter'),a=g.ports.get(l.a),b=g.ports.get(l.b),bounds=commonRouteBounds(g,a,b);assert.equal(bounds.id,s.nodes.find(n=>n.type==='vm').id);
 const obstacles=cableObstacles(g,a,b).map(r=>r.x===bounds.x&&r.y===bounds.y?{...r,h:48}:r),r=routeCable(a,b,obstacles,0,false,[],bounds);
 assert.equal(r.blocked,false);assert.equal(insideRouteBounds(r.points,bounds),true);assert.ok(r.points[1].x>a.x);assert.deepEqual({x:r.points[0].x,y:r.points[0].y},{x:a.x,y:a.y});assert.deepEqual({x:r.points.at(-1).x,y:r.points.at(-1).y},{x:b.x,y:b.y});
});
test('internal fallback never escapes parent even when all corridors are blocked',()=>{
 const bounds={id:'vm',x:100,y:100,w:400,h:300},a={owner:'vm',x:100,y:170,side:-1},b={owner:'guest',x:150,y:280,side:-1},r=routeCable(a,b,[{x:101,y:101,w:398,h:298}],0,false,[],bounds);assert.equal(r.blocked,true);assert.equal(insideRouteBounds(r.points,bounds),true);
});
test('external cables between unrelated roots stay unrestricted; manual out-of-parent points are rejected',()=>{
 const s=demo();settle(s);const g=geometry(s),l=s.links[0];assert.equal(commonRouteBounds(g,g.ports.get(l.a),g.ports.get(l.b)),null);const bounds={x:100,y:100,w:300,h:200};assert.equal(insideRouteBounds([{x:100,y:130},{x:80,y:130},{x:180,y:190}],bounds),false);assert.equal(insideRouteBounds([{x:100,y:130},{x:120,y:130},{x:120,y:190},{x:180,y:190}],bounds),true);
});
