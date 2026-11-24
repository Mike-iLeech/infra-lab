import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,empty,connect} from '../dist/model.js';
import {portConnection,compactProfile} from '../dist/port-status.js';
import {renderPort} from '../dist/port-render.js';
import {connectionInspector,interfaceSummary} from '../dist/connection-inspector.js';

function pair(){const s=empty(),a=create('client',null,0,0),b=create('client',null,400,0);s.nodes.push(a,b);return {s,a,b,p:a.interfaces[0],q:b.interfaces[0]}}
test('port distinguishes a cable from validated service reachability and reports physical faults',()=>{
 const {s,p,q,b}=pair();assert.equal(portConnection(s,p).code,'free');connect(s,p.id,q.id);
 assert.equal(portConnection(s,p).code,'connected');assert.equal(portConnection(s,p).node,b);
 s.links[0].length=200;assert.equal(portConnection(s,p).code,'fault');assert.match(portConnection(s,p).description,/Длина/);
 assert.equal(portConnection(s,p,'Резервный участник · ожидание').code,'fault');
 s.links[0].length=3;assert.equal(portConnection(s,p,'Резервный участник · ожидание').code,'reserve');
});
test('physical profile is visible without conflating SFP module with virtual adapter',()=>{
 assert.equal(compactProfile({profile:'sfp10_lr'}),'SFP+ · 10G SMF');
 assert.equal(compactProfile({profile:'sfp_empty'}),'SFP · без модуля');
 assert.equal(compactProfile({profile:'virtual'}),'Виртуальный NIC');
});
test('port accessible name includes role, fault and action; imported endpoint labels remain escaped',()=>{
 const {s,a,p,q}=pair();connect(s,p.id,q.id);s.links[0].length=200;p.name='<img src=x onerror=alert(1)>';
 const canvas={getState:()=>s,lag:{errors:new Map()},pending:p.id};
 const html=renderPort(canvas,p,a,false,0);
 assert.match(html,/port-fault/);assert.match(html,/aria-pressed="true"/);assert.match(html,/Ошибка/);assert.match(html,/Отменить подключение/);assert.ok(!html.includes('<img'));
 const inspector=connectionInspector(s,s.links[0],canvas.lag);assert.match(inspector,/connection-health fault/);assert.ok(!inspector.includes('<img'));
 assert.match(interfaceSummary(s,a,p,canvas.lag),/summary-state fault/);
});
