import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demo,simulate} from '../dist/model.js';
import {logicalTopology,logicalActiveStep} from '../dist/logical-network.js';
test('logical view derives eight real steps without inventing a Docker NIC or extra cables',()=>{
 const s=demo(),app=s.nodes.find(n=>n.type==='container'),before=JSON.stringify(s),m=logicalTopology(s,app.id);assert.equal(m.ready,true);assert.equal(m.steps.length,8);assert.ok(m.steps[0].title.includes('eno1'));assert.ok(m.steps[1].title.includes('vmbr0'));assert.ok(m.steps[2].title.includes('≡ eth0'));assert.ok(m.steps[4].detail.includes('172.18.0.1'));assert.equal(JSON.stringify(s),before);
});
test('logical view highlights NAT, bridge and veth from concrete trace events',()=>{
 const s=demo(),app=s.nodes.find(n=>n.type==='container'),m=logicalTopology(s,app.id),r=simulate(s,{source:s.nodes.find(n=>n.type==='client').id,target:'site.lab',protocol:'tcp',port:8080});
 assert.equal(logicalActiveStep(m,r.trace.find(e=>e.kernelPhase==='dnat')),'kernel');assert.equal(logicalActiveStep(m,r.trace.find(e=>e.type==='service')),'process');assert.equal(logicalActiveStep(m,r.trace.find(e=>e.label.includes('veth-пара'))),'veth');assert.equal(logicalActiveStep(m,{toPort:m.p.egress.id}),'bridge');
});
test('missing physical membership is reported instead of drawing a complete chain',()=>{
 const s=demo(),app=s.nodes.find(n=>n.type==='container'),server=s.nodes.find(n=>n.type==='server');s.nodes.find(n=>n.name.startsWith('vmbr0')).members=s.nodes.find(n=>n.name.startsWith('vmbr0')).members.filter(id=>id!==server.interfaces[0].id);const m=logicalTopology(s,app.id);assert.equal(m.ready,false);assert.ok(m.steps[0].title.includes('не связан'));assert.equal(logicalTopology(s,'not-an-app'),null);
});
