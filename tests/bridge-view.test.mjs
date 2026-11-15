import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demo,simulate,validate} from '../dist/model.js';
import {displayPorts,geometry,settle} from '../dist/geometry.js';
import {attachedBridgePorts,localBridgePaths} from '../dist/bridge-view.js';
import {portView} from '../dist/port-view.js';

test('host veth is displayed once as actual bridge port while OS ownership and link stay unchanged',()=>{
 const s=demo(),a=attachedBridgePorts(s)[0],before=JSON.stringify(s);assert.ok(a);
 assert.equal(displayPorts(s,a.host).some(p=>p.p.id===a.p.id),false);
 assert.equal(displayPorts(s,a.bridge).filter(p=>p.p.id===a.p.id).length,1);
 const g=geometry(s);assert.equal(g.ports.get(a.p.id).owner,a.bridge.id);assert.equal(g.ports.get(a.p.id).node,a.host.id);assert.deepEqual({...g.ports.get(a.alias),id:a.p.id},g.ports.get(a.p.id));
 assert.equal(JSON.stringify(s),before);assert.equal(a.host.interfaces.includes(a.p),true);assert.ok(s.links.some(l=>l.a===a.p.id||l.b===a.p.id));
});
test('visible path is bridge gateway -> member veth -> container with matching trace binding',()=>{
 const s=demo();settle(s);const g=geometry(s),a=attachedBridgePorts(s)[0],path=localBridgePaths(s,g)[0],r=simulate(s,{source:s.nodes.find(n=>n.type==='client').id,target:'site.lab',protocol:'tcp',port:8080});
 assert.equal(path.start.id,a.bridge.interfaces[0].id);assert.equal(path.end.id,a.p.id);assert.equal(path.start.owner,path.end.owner);assert.equal(g.rects.get(a.bridge.id).w>=440,true);assert.equal(r.ok,true);assert.ok(r.trace.some(e=>e.bindingIds.includes(a.alias)&&e.portIds.includes(a.p.id)));assert.equal(portView(a.bridge,a.bridge.interfaces[0]).role,'L3');
});
test('collapse hides internal veth and preserves L3 proxy from kernel to Docker group',()=>{
 const s=demo(),a=attachedBridgePorts(s)[0],engine=s.nodes.find(n=>n.type==='docker');engine.collapsed=true;let g=geometry(s);
 assert.equal(g.ports.has(a.p.id),false);assert.equal(g.ports.get(a.bridge.interfaces[0].id).owner,engine.id);assert.equal(localBridgePaths(s,g).length,0);
 engine.collapsed=false;a.host.collapsed=true;g=geometry(s);assert.equal(g.ports.has(a.p.id),false);assert.equal(displayPorts(s,a.host).some(p=>p.p.id===a.p.id),false);
});
test('removing membership restores independent host interface; physical Proxmox membership is unchanged',()=>{
 const s=demo(),a=attachedBridgePorts(s)[0],server=s.nodes.find(n=>n.type==='server');a.bridge.members=[];assert.equal(attachedBridgePorts(s).length,0);assert.ok(displayPorts(s,a.host).some(p=>p.p.id===a.p.id));assert.ok(displayPorts(s,server).some(p=>p.p.id===server.interfaces[0].id));assert.equal(validate(s),s);
});
