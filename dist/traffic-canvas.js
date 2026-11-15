import {packetCompactHTML} from './packet-fields.js';
export function installTrafficCanvas(canvas){
 canvas.packetBadge=document.createElement('div');canvas.packetBadge.className='packet-badge';canvas.packetBadge.hidden=true;canvas.world.append(canvas.packetBadge);
 canvas.setTraffic=function(view){this.trafficView=view;this.applyTraffic()};
 canvas.visibleTraceNode=function(id){const s=this.getState();let n=s.nodes.find(n=>n.id===id);while(n&&!this.g.rects.has(n.id))n=s.nodes.find(a=>a.id===n.parent);return n?.id};
 canvas.tracePoint=function(port,node){if(this.g.ports.has(port))return this.g.ports.get(port);const owner=this.getState().nodes.find(n=>n.interfaces.some(p=>p.id===port)),visible=this.visibleTraceNode(owner?.id||node),r=this.g.rects.get(visible);return r?{x:r.x+r.w/2,y:r.y+24}:null};
 canvas.applyTraffic=function(){
  const view=this.trafficView,active=view?.event,visited=view?.visited||[],ports=new Set(visited.flatMap(e=>e.portIds||[])),links=new Set(visited.flatMap(e=>e.linkIds||[])),bindings=new Set(visited.flatMap(e=>e.bindingIds||[]));
  const nodes=new Set(visited.flatMap(e=>[e.nodeId,e.fromNode,e.toNode]).filter(Boolean).map(id=>this.visibleTraceNode(id)));
  const nowPorts=new Set(active?.portIds||[]),nowNodes=new Set([active?.nodeId,active?.fromNode,active?.toNode].filter(Boolean).map(id=>this.visibleTraceNode(id)));
  this.world.classList.toggle('trace-mode',!!view);
  this.host.querySelectorAll('.node').forEach(el=>{el.classList.toggle('trace-visited',nodes.has(el.dataset.id));el.classList.toggle('trace-active',nowNodes.has(el.dataset.id));el.classList.toggle('trace-failed',active?.type==='stop'&&this.visibleTraceNode(active.nodeId)===el.dataset.id)});
  this.host.querySelectorAll('[data-anchor]').forEach(el=>{const id=el.dataset.anchor;el.classList.toggle('trace-port-visited',ports.has(id)||bindings.has(id));el.classList.toggle('trace-port-active',nowPorts.has(id)||(active?.bindingIds||[]).includes(id));el.classList.toggle('trace-port-failed',active?.type==='stop'&&nowPorts.has(id))});
  this.svg.querySelectorAll('.cable').forEach(el=>{const id=el.dataset.cable,binding=el.dataset.bindingId;el.classList.toggle('trace-wire-visited',id?links.has(id):bindings.has(binding));el.classList.toggle('trace-wire-active',(active?.linkIds||[]).includes(id)||(active?.bindingIds||[]).includes(binding));el.classList.toggle('trace-wire-failed',active?.type==='stop'&&((active.linkIds||[]).includes(id)||(active.bindingIds||[]).includes(binding)))});
  this.svg.querySelectorAll('.cni-wire').forEach(el=>{const matches=e=>e.type==='cni-route'&&e.nodeId===el.dataset.cniHost&&[el.dataset.cniA,el.dataset.cniB].includes(e.fromPort)&&[el.dataset.cniA,el.dataset.cniB].includes(e.toPort);el.classList.toggle('trace-wire-visited',visited.some(matches));el.classList.toggle('trace-wire-active',!!active&&matches(active))});
  const kernelVisited=new Set(visited.map(e=>e.kernelPathId).filter(Boolean));
  this.host.querySelectorAll('[data-kernel-card]').forEach(el=>{const on=el.dataset.kernelCard===active?.kernelPathId;el.classList.toggle('trace-kernel-active',on);el.querySelectorAll('[data-kernel-phase]').forEach(cell=>cell.classList.toggle('kernel-current',on&&cell.dataset.kernelPhase===(active.kernelPhase?.startsWith('reverse')?'reverse':active.kernelPhase)))});
  this.svg.querySelectorAll('[data-kernel-id]').forEach(el=>{el.classList.toggle('trace-wire-visited',kernelVisited.has(el.dataset.kernelId));el.classList.toggle('trace-wire-active',el.dataset.kernelId===active?.kernelPathId&&(active.kernelPhase?.startsWith('reverse')||el.dataset.kernelPhase===active.kernelPhase))});
  this.syncCrossings?.();this.svg.querySelector('#traffic-overlay')?.remove();this.packetPath=null;this.packetCircle=null;
  this.packetBadge.hidden=!active||!view.showPacketDetails;if(active)this.packetBadge.innerHTML=packetCompactHTML(active);
  this.logicalView?.update(view);if(!active)return;
  const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'g');overlay.id='traffic-overlay';this.svg.append(overlay);
  const from=this.tracePoint(active.fromPort||active.portIds?.[0],active.fromNode||active.nodeId),to=this.tracePoint(active.toPort||active.portIds?.at(-1),active.toNode||active.nodeId);
  let path=[...this.svg.querySelectorAll('.cable')].find(el=>(active.linkIds||[]).includes(el.dataset.cable)||(active.bindingIds||[]).includes(el.dataset.bindingId))?.querySelector('.wire');
  if(active.kernelPathId){const pieces=[...this.svg.querySelectorAll('[data-kernel-id]')].filter(el=>el.dataset.kernelId===active.kernelPathId);if(active.kernelPhase?.startsWith('reverse')&&pieces.length===2){path=document.createElementNS(ns,'path');path.setAttribute('d',pieces.map(el=>el.querySelector('path').getAttribute('d')).join(' '));path.classList.add('trace-internal');overlay.append(path)}else path=pieces.find(el=>el.dataset.kernelPhase===(active.kernelPhase==='snat'?'route':active.kernelPhase))?.querySelector('path')||path;}
  if(active.type==='cni-route')path=[...this.svg.querySelectorAll('.cni-wire')].find(el=>el.dataset.cniHost===active.nodeId&&[el.dataset.cniA,el.dataset.cniB].includes(active.fromPort)&&[el.dataset.cniA,el.dataset.cniB].includes(active.toPort))?.querySelector('path')||path;
  if(!path&&from&&to&&active.type!=='stop'){path=document.createElementNS(ns,'path');path.classList.add('trace-internal');const mid=(from.x+to.x)/2;path.setAttribute('d',`M${from.x},${from.y} H${mid} V${to.y} H${to.x}`);overlay.append(path)}
  if(active.type==='stop'){const p=to||from;if(p){this.positionPacketBadge(p);const mark=document.createElementNS(ns,'path'),r=9/this.zoom;mark.setAttribute('d',`M${p.x},${p.y-r} L${p.x+r},${p.y} L${p.x},${p.y+r} L${p.x-r},${p.y}Z`);mark.classList.add('packet-stop');overlay.append(mark)}return}
  const dot=document.createElementNS(ns,'circle');dot.setAttribute('r',6/this.zoom);dot.classList.add('packet-dot');overlay.append(dot);this.packetCircle=dot;this.packetPath=path;
  const first=path?.getPointAtLength(0),last=path?.getPointAtLength(path.getTotalLength());this.packetReverse=active.kernelPhase?.startsWith('reverse')||!!(from&&first&&last&&Math.hypot(from.x-last.x,from.y-last.y)<Math.hypot(from.x-first.x,from.y-first.y));this.packetFallback=to||from;this.animateTraffic(view.progress??0);
 };
 canvas.positionPacketBadge=function(p){this.packetBadge.style.left=p.x+'px';this.packetBadge.style.top=p.y+'px';this.packetBadge.style.transform=`translate(12px,12px) scale(${1/this.zoom})`};
 canvas.animateTraffic=function(t){if(!this.packetCircle)return;const p=this.packetPath?.getPointAtLength(this.packetPath.getTotalLength()*(this.packetReverse?1-t:t))||this.packetFallback;if(p){this.packetCircle.setAttribute('cx',p.x);this.packetCircle.setAttribute('cy',p.y);this.positionPacketBadge(p)}};
 canvas.focusTraffic=function(){const e=this.trafficView?.event;if(!e)return;const id=this.visibleTraceNode(e.nodeId||e.toNode||e.fromNode);if(id)this.focus(id)};
}
