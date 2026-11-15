import {interfaceOwner} from './ownership.js';
import {routeCable,pathData} from './geometry.js';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function drawCniPaths(canvas){const s=canvas.getState(),g=canvas.g;let html='';
 for(const host of g.visible.filter(n=>n.services.cni?.enabled&&!n.collapsed)){
  const ingress=host.interfaces.find(p=>p.ip),a=g.ports.get(ingress?.id);if(!a)continue;
  for(const bridge of s.nodes.filter(n=>n.type==='bridge'&&interfaceOwner(s,n).id===host.id)){
   const p=bridge.interfaces.find(p=>p.ip),b=g.ports.get(p?.id);if(!b||b.owner===a.owner)continue;
   const related=new Set([host.id,b.owner,...g.rects.get(host.id).ancestors,...g.rects.get(b.owner).ancestors]),obstacles=[...g.rects.values()].filter(r=>!related.has(r.id)||r.id===b.owner),r=routeCable(a,b,obstacles,2,false,[],g.rects.get(host.id));
   const box=g.rects.get(b.owner);html+=`<g class="cni-wire" data-cni-host="${esc(host.id)}" data-cni-a="${esc(ingress.id)}" data-cni-b="${esc(p.id)}"><title>L3 в ядре ${esc(host.name)}: ${esc(ingress.name)} ⇄ ${esc(p.name)}. Это маршрутизация, не кабель и не NIC Kubernetes.</title><path class="cni-line" d="${pathData(r.points)}"/><text class="cni-label" x="${box.x+12}" y="${box.y-8}">L3 · eth0 ⇄ cni0 · без обработки NodePort</text></g>`;
  }
 }return html;
}
