import {clusterConnections} from './workloads.js';
import {routeCable,pathData,cableObstacles} from './geometry.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function clusterWires(s,g){
 return clusterConnections(s).map(({member,cluster},i)=>{
  const first=s.nodes.find(n=>n.clusterId===cluster.id);let m=member,c=first?.id!==member.id?first:cluster;
  while(!g.rects.has(m.id)&&m.parent)m=s.nodes.find(n=>n.id===m.parent);
  while(!g.rects.has(c.id)&&c.parent)c=s.nodes.find(n=>n.id===c.parent);
  const ra=g.rects.get(c.id),rb=g.rects.get(m.id);if(!ra||!rb||m.id===c.id)return '';
  const a={x:ra.x,y:ra.y+24,side:-1,owner:c.id},b={x:rb.x,y:rb.y+24,side:-1,owner:m.id};
  const route=routeCable(a,b,cableObstacles(g,a,b),i+2),segments=route.points.slice(1).map((q,j)=>({a:route.points[j],b:q})).filter(e=>e.a.y===e.b.y).sort((a,b)=>Math.abs(b.b.x-b.a.x)-Math.abs(a.b.x-a.a.x)),label=segments[0];
  return `<g class="cluster-link ${cluster.type}"><title>${esc(cluster.name)} · ${esc(member.name)} · логическое членство, не сетевой кабель</title><path d="${pathData(route.points)}"/>${label?`<text x="${(label.a.x+label.b.x)/2}" y="${label.a.y-7}" text-anchor="middle">${esc(cluster.name.split(' · ')[0])} · кластер</text>`:''}</g>`;
 }).join('');
}
