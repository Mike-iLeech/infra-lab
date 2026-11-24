import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,empty,connect} from '../dist/model.js';
import {connectionCheck,completeConnection} from '../dist/connection-ux.js';
import {LabCanvas} from '../dist/canvas.js';

function pair(profile='rj45',other=profile){
 const state=empty(),a=create('client'),b=create('client');
 a.interfaces[0].profile=profile;b.interfaces[0].profile=other;state.nodes.push(a,b);
 return{state,a:a.interfaces[0].id,b:b.interfaces[0].id};
}
function freeze(value){Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))freeze(child);return value}
function harness(state){
 const messages=[],canvas=Object.assign(Object.create(LabCanvas.prototype),{getState:()=>state,pending:null,render(){this.renders=(this.renders||0)+1},commit(){this.commits=(this.commits||0)+1},notify:message=>messages.push(message),selectLink(id){this.inspectedLink=id}});
 return{canvas,messages};
}

test('connection preview uses real medium, speed and wavelength rules without changing topology',()=>{
 for(const [a,b,options] of [['rj45','rj45',{}],['rj45','sfp_lx',{}],['sfp_sx','sfp10_sr',{}],['sfp_bxu','sfp_bxd',{}],['sfp_bxu','sfp_bxu',{}],['rj45','rj45',{length:101}],['virtual','virtual',{medium:'adapter'}]]){
  const fixture=pair(a,b),before=structuredClone(fixture.state),actual=structuredClone(fixture.state);let expected;
  try{connect(actual,fixture.a,fixture.b,options);expected={compatible:true,reason:''}}catch(error){expected={compatible:false,reason:error.message}}
  assert.deepEqual(connectionCheck(freeze(fixture.state),fixture.a,fixture.b,options),expected);
  assert.deepEqual(fixture.state,before);
 }
});

test('preview reports occupied, missing and identical contacts and accepts legacy profiles like connect',()=>{
 const {state,a,b}=pair();connect(state,a,b);const before=structuredClone(state);
 assert.match(connectionCheck(state,a,b).reason,/занят/);assert.equal(connectionCheck(state,a,a).compatible,false);assert.equal(connectionCheck(state,a,'missing').compatible,false);assert.deepEqual(state,before);
 const legacy=pair('rj45','sfp_lx');delete legacy.state.nodes[0].interfaces[0].profile;
 assert.equal(connectionCheck(legacy.state,legacy.a,legacy.b).compatible,true);
});

test('an unsuccessful target keeps the original contact pending and can be retried successfully',()=>{
 const {state,a,b}=pair('rj45','sfp_lx'),third=create('client');third.interfaces[0].profile='rj45';state.nodes.push(third);
 const {canvas,messages}=harness(state);canvas.pending=a;canvas.pointer={x:12,y:34};const before=structuredClone(state);
 assert.equal(completeConnection(canvas,b),false);assert.equal(canvas.pending,a);assert.deepEqual(canvas.pointer,{x:12,y:34});assert.equal(canvas.commits,undefined);assert.deepEqual(state,before);assert.match(messages.at(-1),/среды/);
 assert.equal(completeConnection(canvas,third.interfaces[0].id),true);assert.equal(canvas.pending,null);assert.equal(canvas.pointer,null);assert.equal(canvas.connectionError,null);assert.equal(canvas.commits,1);assert.equal(state.links.length,1);assert.equal(state.links[0].a,a);
});

test('a busy contact opens cable properties without starting a drag or enabling route editing',()=>{
 const {state,a,b}=pair();connect(state,a,b);const {canvas}=harness(state),target={closest:selector=>selector==='[data-port]'?{dataset:{port:a}}:null};
 canvas.down({button:0,target,clientX:20,clientY:30});assert.equal(canvas.cableDrag,undefined);assert.equal(canvas.pending,null);
 canvas.portClick(a);assert.equal(canvas.inspectedLink,state.links[0].id);assert.equal(canvas.selectedWireRoute,'link:'+state.links[0].id);assert.equal(canvas.editingWireRoute,null);assert.equal(canvas.pending,null);assert.equal(state.links.length,1);
});

test('pressing another contact during a pending connection cannot replace its source by dragging',()=>{
 const {state,a,b}=pair(),{canvas}=harness(state);canvas.pending=a;
 canvas.down({button:0,target:{closest:()=>({dataset:{port:b}})},clientX:20,clientY:30});
 assert.equal(canvas.cableDrag,undefined);assert.equal(canvas.pending,a);
 canvas.portClick(b);assert.equal(canvas.pending,null);assert.equal(state.links[0].a,a);assert.equal(state.links[0].b,b);
});
