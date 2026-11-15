import {publicationPaths} from './kernel-path.js';
import {routeCable,pathData} from './geometry.js';
export function drawKernelPaths(canvas){
 const {g}=canvas,s=canvas.getState(),origin=canvas.world.getBoundingClientRect();g.kernelCards??=new Map();let html='<defs><marker id="kernel-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="none" stroke="#d3a56d" stroke-width="1.4"/></marker></defs>';
 for(const host of g.visible){if(host.collapsed)continue;for(const p of publicationPaths(s,host)){
  const card=[...canvas.host.querySelectorAll('[data-kernel-card]')].find(e=>e.dataset.kernelCard===p.id);if(!card)continue;
  let box=g.kernelCards.get(p.id);if(!box){const r=card.getBoundingClientRect();box={x:(r.left-origin.left)/canvas.zoom,y:(r.top-origin.top)/canvas.zoom,w:r.width/canvas.zoom,h:r.height/canvas.zoom};g.kernelCards.set(p.id,box)}
  const a=g.ports.get(p.ingress?.id),b=g.ports.get(p.egress?.id);if(!p.ready||!a||!b)continue;
  const y=box.y+box.h-13,left=box.x+12,middle=box.x+box.w*.58,exit=box.x+box.w*.82;
  const start={x:left,y,side:-1,owner:host.id},end={x:exit,y:box.y+box.h+18,side:0,owner:host.id};
  // The kernel card is inside the host, so its containing nodes are not obstacles.
  // Keep the complete destination bridge blocked, allowing entry only at its port stub.
  const related=new Set([host.id,b.owner,...g.rects.get(host.id).ancestors,...g.rects.get(b.owner).ancestors]);
  const obstacles=[...g.rects.values()].filter(r=>!related.has(r.id)||(r.id===b.owner&&b.owner!==host.id));
  const channel=box.x-12;const incoming={points:[a,{x:channel,y:a.y},{x:channel,y},{x:left,y}]},outgoing=routeCable(end,b,obstacles,1,false,canvas.routeLaneConstraints?.('kernel:'+p.id+':route')||[],g.rects.get(host.id));
  const dnat=pathData([...incoming.points,{x:middle,y}]),route=pathData([{x:middle,y},{x:exit,y},...outgoing.points]);
  const id=String(p.id).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  for(const [phase,d] of [['dnat',dnat],['route',route]])html+=`<g class="kernel-wire" data-kernel-id="${id}" data-kernel-phase="${phase}"><title>Внутренний путь ядра: ${phase==='dnat'?'публикация порта / DNAT':'маршрутизация в сеть контейнера'} · это не Ethernet-кабель</title><path class="kernel-line" marker-end="url(#kernel-arrow)" d="${d}"/></g>`;
 }}return html;
}
