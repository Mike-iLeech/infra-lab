import {controlConnections} from './runtime-control.js';
import {routeCable,pathData,cableObstacles} from './geometry.js';
import {commonRouteBounds} from './route-bounds.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function controlWires(s,g){let html='<defs><marker id="control-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="#ed91bc"/></marker></defs>';const lanes=[];
 for(const [i,e] of controlConnections(s).entries()){
  let source=e.source,target=e.target;
  while(!g.rects.has(source.id)&&source.parent)source=s.nodes.find(n=>n.id===source.parent);
  while(!g.rects.has(target.id)&&target.parent)target=s.nodes.find(n=>n.id===target.parent);
  const a=g.rects.get(source.id),b=g.rects.get(target.id);if(!a||!b||source.id===target.id)continue;
  const direction=b.x>=a.x+a.w?1:b.x+b.w<=a.x?-1:0;
  const start={owner:source.id,x:direction===1?a.x+a.w:a.x,y:a.y+28,side:direction===1?1:-1},end={owner:target.id,x:direction===1?b.x:b.x+b.w,y:b.y+28,side:direction===1?-1:1};
  const route=routeCable(start,end,cableObstacles(g,start,end),i,true,lanes,commonRouteBounds(g,start,end));lanes.push(route.points);
  const label=route.points.slice(1).map((b,i)=>({a:route.points[i],b})).filter(p=>p.a.y===p.b.y).sort((a,b)=>Math.abs(b.b.x-b.a.x)-Math.abs(a.b.x-a.a.x))[0];
  html+=`<g class="control-link" data-control-id="${esc(e.id)}" data-control-kind="${e.kind}" data-control-source="${esc(e.source.id)}" data-control-target="${esc(e.target.id)}"><title>${esc(e.detail)}</title><path class="control-line" d="${pathData(route.points)}" marker-end="url(#control-arrow)"/>${label?`<text class="control-label" x="${e.kind==='cri'?(a.x+a.w+b.x)/2:b.x+8}" y="${e.kind==='cri'?Math.min(a.y,b.y)-10:b.y-9}" text-anchor="${e.kind==='cri'?'middle':'start'}">${esc(e.kind==='cri'?'CTRL · CRI':'CTRL · жизненный цикл')}</text>`:''}</g>`;
 }return html;
}
