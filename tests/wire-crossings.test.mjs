import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crossingPaths,polylinePoints} from '../dist/wire-crossings.js';
import {demo} from '../dist/model.js';
import {geometry,settle} from '../dist/geometry.js';
import {drawKernelPaths} from '../dist/kernel-canvas.js';
const route=(...pairs)=>({points:pairs.map(([x,y])=>({x,y}))});
test('horizontal wire gets an arc while vertical underpass remains straight',()=>{
 const [h,v]=crossingPaths([route([0,50],[100,50]),route([50,0],[50,100])]);assert.equal(h.hops.length,1);assert.ok(h.d.includes('A7,7'));assert.equal(v.hops.length,0);assert.ok(h.d.startsWith('M0,50'));assert.ok(h.d.endsWith('L100,50'));
});
test('shared endpoints, overlaps and corners are not rendered as crossovers',()=>{
 const paths=crossingPaths([route([0,50],[100,50]),route([100,50],[100,100]),route([0,50],[100,50])]);assert.ok(paths.every(p=>!p.hops.length));
});
test('a foreign wire ending or turning on the middle of a wire is not a network junction',()=>{
 const paths=crossingPaths([route([0,50],[100,50]),route([50,50],[50,100])]);assert.equal(paths[0].hops.length,1);
});
test('nearby crossings merge and reversed travel has the same upper arch',()=>{
 const r=crossingPaths([route([100,50],[0,50]),route([50,0],[50,100]),route([55,0],[55,100])]);assert.equal(r[0].hops.length,1);assert.ok(r[0].d.includes(' 0 0 0 '));assert.equal(crossingPaths([route([0,0],[100,0],[100,100],[0,100],[0,0])])[0].hops.length,0);
});
test('crossovers do not depend on screen zoom or input route order',()=>{
 const a=route([0,50],[100,50]),b=route([50,0],[50,100]);assert.equal(crossingPaths([a,b])[0].d,crossingPaths([b,a])[1].d);assert.deepEqual(polylinePoints('M0,50 L100,50'),a.points);
});
test('crossing arc bulges inward when route is near the upper boundary of its parent',()=>{
 const h={...route([0,3],[100,3]),bounds:{x:0,y:0,w:100,h:100}},v=route([50,0],[50,100]);const result=crossingPaths([h,v],14)[0];assert.ok(result.hops[0].includes(' 0 0 0 '));
});
test('kernel route leaves processing block downwards without a horizontal U-turn',()=>{
 const s=demo();settle(s);const os=s.nodes.find(n=>n.type==='ubuntu'),g=geometry(s),r=g.rects.get(os.id),app=s.nodes.find(n=>n.type==='container'),box={x:r.x+24,y:r.y+92,w:r.w-48,h:148};g.kernelCards=new Map([[app.id,box]]);
 const card={dataset:{kernelCard:app.id}},html=drawKernelPaths({g,getState:()=>s,zoom:1,world:{getBoundingClientRect:()=>({left:0,top:0})},host:{querySelectorAll:()=>[card]}}),d=html.match(/data-kernel-phase="route".*? d="([^"]+)"/)[1],points=polylinePoints(d);
 assert.equal(points[1].x,box.x+box.w*.82);assert.equal(points[2].x,points[1].x);assert.ok(points[2].y>points[1].y);
 for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1];if(a.y===b.y&&b.y===c.y)assert.ok((b.x-a.x)*(c.x-b.x)>=0);if(a.x===b.x&&b.x===c.x)assert.ok((b.y-a.y)*(c.y-b.y)>=0)}
});
