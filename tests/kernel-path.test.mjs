import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demo,simulate} from '../dist/model.js';
import {publicationPaths,kernelSpace,kernelCardsHTML} from '../dist/kernel-path.js';
import {geometry,settle,contentTop} from '../dist/geometry.js';
import {drawKernelPaths} from '../dist/kernel-canvas.js';
import {segmentHits} from '../dist/geometry.js';

test('publication path derives actual NIC, bridge gateway and container from current configuration',()=>{
 const s=demo(),os=s.nodes.find(n=>n.type==='ubuntu'),p=publicationPaths(s,os)[0];
 assert.equal(p.ingress.ip,'10.10.0.10');assert.equal(p.egress.ip,'172.18.0.1');assert.equal(p.destination.ip,'172.18.0.2');assert.equal(p.ready,true);
 p.service.publishPort=9090;p.service.port=8081;
 const html=kernelCardsHTML(s,os,92);assert.ok(html.includes('10.10.0.10:9090'));assert.ok(html.includes('172.18.0.2:8081'));assert.ok(html.includes('PREROUTING'));assert.ok(html.includes('conntrack'));
});
test('missing bridge membership is shown as missing path and never creates a simulated cable',()=>{
 const s=demo(),os=s.nodes.find(n=>n.type==='ubuntu'),p=publicationPaths(s,os)[0],count=s.links.length;
 p.bridge.members=[];const broken=publicationPaths(s,os)[0];assert.equal(broken.ready,false);assert.ok(kernelCardsHTML(s,os,92).includes('Нет полной bridge-связи'));assert.equal(s.links.length,count);
});
test('kernel cards reserve space above nested objects and disappear when host is collapsed',()=>{
 const s=demo(),os=s.nodes.find(n=>n.type==='ubuntu');settle(s);const g=geometry(s),r=g.rects.get(os.id);
 assert.equal(kernelSpace(s,os),188);assert.ok(r.w>=760);for(const child of s.nodes.filter(n=>n.parent===os.id))assert.ok(child.y>=contentTop(s,os));
 os.collapsed=true;assert.equal(kernelSpace(s,os),0);assert.equal(publicationPaths(s,os).length,1);
});
test('trace separates DNAT, L3 forwarding and reverse translation with concrete interface endpoints',()=>{
 const s=demo(),os=s.nodes.find(n=>n.type==='ubuntu'),p=publicationPaths(s,os)[0],r=simulate(s,{source:s.nodes.find(n=>n.type==='client').id,target:'site.lab',protocol:'tcp',port:8080});
 assert.equal(r.ok,true);const phases=r.trace.filter(e=>e.kernelPathId===p.id);assert.deepEqual(phases.map(e=>e.kernelPhase),['dnat','route','reverse']);
 assert.equal(phases[1].fromPort,p.ingress.id);assert.equal(phases[1].toPort,p.egress.id);assert.equal(phases[2].fromPort,p.egress.id);assert.equal(phases[2].toPort,p.ingress.id);assert.ok(phases.every(e=>!e.linkIds.length&&!e.bindingIds.length));
});

test('internal path reaches bridge contact without crossing bridge labels',()=>{
 const s=demo(),os=s.nodes.find(n=>n.type==='ubuntu');settle(s);const g=geometry(s),p=publicationPaths(s,os)[0],r=g.rects.get(os.id),target=g.rects.get(p.bridge.id);
 const card={dataset:{kernelCard:p.id},getBoundingClientRect:()=>({left:r.x+24,top:r.y+92,width:r.w-48,height:148})};
 const html=drawKernelPaths({g,getState:()=>s,zoom:1,world:{getBoundingClientRect:()=>({left:0,top:0})},host:{querySelectorAll:()=>[card]}});
 const d=html.match(/data-kernel-phase="route".*? d="([^"]+)"/)[1],nums=d.match(/-?\d+(?:\.\d+)?/g).map(Number),points=[];for(let i=0;i<nums.length;i+=2)points.push({x:nums[i],y:nums[i+1]});
 const endpoint=g.ports.get(p.egress.id);assert.deepEqual(points.at(-1),{x:endpoint.x,y:endpoint.y});
 for(let i=1;i<points.length;i++)assert.equal(segmentHits(points[i-1],points[i],{x:target.x+2,y:target.y+2,w:target.w-4,h:target.h-4}),false);
});
