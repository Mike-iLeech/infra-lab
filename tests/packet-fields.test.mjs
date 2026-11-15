import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demo,simulate} from '../dist/model.js';
import {packetDetailsHTML,packetSummary} from '../dist/packet-fields.js';
function run(protocol='tcp',target='site.lab'){const s=demo();return{s,r:simulate(s,{source:s.nodes.find(n=>n.type==='client').id,target,protocol,port:8080})}}
test('all HTTP and DNS hops have immutable packet tuples, preserving endpoints across switches',()=>{
 const {r}=run();assert.equal(r.ok,true);assert.ok(r.trace.every(e=>e.packet));
 for(const stage of ['DNS · запрос','DNS · ответ','HTTP · запрос','Контейнер · запрос','Контейнер · ответ','HTTP · ответ']){const events=r.trace.filter(e=>e.stage===stage);assert.ok(events.length);assert.ok(events.every(e=>JSON.stringify(e.packet)===JSON.stringify(events[0].packet)))}
 assert.notEqual(r.trace[0].packet,r.trace[1].packet);
});
test('DNAT changes only destination; reverse translation changes only source and preserves client port',()=>{
 const {r}=run(),[dnat,reply]=r.trace.filter(e=>e.nat);
 assert.deepEqual(dnat.nat.before.source,{ip:'10.10.0.100',port:49152});assert.deepEqual(dnat.nat.before.destination,{ip:'10.10.0.10',port:8080});
 assert.deepEqual(dnat.nat.after.source,dnat.nat.before.source);assert.deepEqual(dnat.nat.after.destination,{ip:'172.18.0.2',port:80});
 assert.deepEqual(reply.nat.before.source,{ip:'172.18.0.2',port:80});assert.deepEqual(reply.nat.before.destination,{ip:'10.10.0.100',port:49152});
 assert.deepEqual(reply.nat.after.source,{ip:'10.10.0.10',port:8080});assert.deepEqual(reply.nat.after.destination,reply.nat.before.destination);
 assert.deepEqual(r.trace.at(-1).packet,reply.nat.after);assert.equal((packetDetailsHTML(dnat).match(/packet-changed/g)||[]).length,2);assert.equal((packetDetailsHTML(reply).match(/packet-changed/g)||[]).length,2);
});
test('DNS has its own UDP client port and swaps port 53 on response',()=>{
 const {r}=run(),request=r.trace.find(e=>e.stage==='DNS · запрос').packet,reply=r.trace.find(e=>e.stage==='DNS · ответ').packet;
 assert.equal(request.protocol,'UDP');assert.deepEqual(request.source,{ip:'10.10.0.100',port:53000});assert.deepEqual(request.destination,{ip:'10.10.0.53',port:53});assert.deepEqual(reply.source,request.destination);assert.deepEqual(reply.destination,request.source);
});
test('ICMP has no transport ports and no NAT for direct ping',()=>{
 const {r}=run('icmp','10.10.0.10');assert.equal(r.ok,true);assert.ok(r.trace.every(e=>e.packet.protocol==='ICMP'&&e.packet.source.port===null&&e.packet.destination.port===null&&!e.nat));assert.ok(packetDetailsHTML(r.trace[0]).includes('У ICMP нет'));assert.ok(!packetSummary(r.trace[0].packet).includes(':8080'));
});
test('failed forwarding keeps packet fields at point of failure; configuration failure creates no packet',()=>{
 const {s}=run();s.nodes.find(n=>n.type==='switch').interfaces[1].allowedVlans=[20];let r=simulate(s,{source:s.nodes.find(n=>n.type==='client').id,target:'10.10.0.10',protocol:'tcp',port:8080});assert.equal(r.ok,false);assert.equal(r.trace.at(-1).packet.destination.port,8080);assert.ok(!r.trace.some(e=>e.nat));
 s.nodes.find(n=>n.type==='dns').interfaces[0].ip='10.10.0.100';r=simulate(s,{source:s.nodes.find(n=>n.type==='client').id,target:'site.lab',protocol:'tcp',port:8080});assert.equal(r.trace[0].packet,null);assert.ok(packetDetailsHTML(r.trace[0]).includes('ещё не сформирован'));
});
