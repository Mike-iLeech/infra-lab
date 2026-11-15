import {inwardPort} from './route-bounds.js';
import {parallelConflict,laneCoordinates} from './wire-spacing.js';
import {attachedBridgePorts,bridgeLaneSpace} from './bridge-view.js';
import {publicationPaths,kernelSpace} from './kernel-path.js';
import {bindings,memberId} from './bridges.js';
import {portRow} from './port-view.js';
// Geometry is independent of the DOM so nesting, collisions and routing share one model.
export const GAP = 24;
export const PORT_ROW = 28;
export const HEADER = 48;
export function children(state, parent) { return state.nodes.filter(n => n.parent === parent); }
export function descendants(state, id) {
  const result = new Set([id]);
  for (const n of children(state, id)) for (const sub of descendants(state, n.id)) result.add(sub);
  return result;
}
function ownPorts(state,n){
  const attached=attachedBridgePorts(state),moved=new Set(attached.map(a=>a.p.id));
  const own = n.interfaces.filter(p=>!moved.has(p.id)).map(p => ({ p, node: n, proxy: false }));
  if(n.type==='bridge')for(const id of n.members||[]){const owner=state.nodes.find(a=>a.interfaces.some(p=>p.id===id));const p=owner?.interfaces.find(p=>p.id===id);if(p){const a=attached.find(a=>a.bridge.id===n.id&&a.p.id===id);if(a){const item={p,node:owner,proxy:false,attached:a,alias:a.alias};own.splice(Math.min(own.length,1),0,item)}else own.push({p:{id:memberId(n.id,id),name:owner.name+' / '+p.name,ip:''},node:n,proxy:false,member:true})}}
  return own;
}
export function displayPorts(state, n) {
  const own=ownPorts(state,n);
  if (!n.collapsed) return own;
  const ids = descendants(state, n.id);
  const inside = new Set(state.nodes.filter(a => ids.has(a.id)).flatMap(a => [...a.interfaces.map(p => p.id),...(a.members||[]).map(id=>memberId(a.id,id))]));
  const attached=attachedBridgePorts(state),moved=new Set(attached.map(a=>a.p.id));for(const a of attached)if(ids.has(a.bridge.id))inside.add(a.p.id);
  const kernel=state.nodes.flatMap(host=>publicationPaths(state,host).filter(p=>p.ready).map(p=>({a:p.ingress.id,b:p.egress.id})));
  const external = new Set([...state.links,...bindings(state).filter(l=>!moved.has(l.a)),...kernel].filter(l => inside.has(l.a) !== inside.has(l.b)).flatMap(l => [l.a, l.b]));
  return own.concat(state.nodes.filter(a => a.id !== n.id && ids.has(a.id)).flatMap(node => ownPorts(state,node)
    .filter(a => external.has(a.p.id)).map(a => ({...a,proxy:true}))));
}
export function contentTop(state, n) { return HEADER + Math.ceil(displayPorts(state, n).length / 2) * portRow(n) + 36 + kernelSpace(state,n) + bridgeLaneSpace(state,n); }
export function geometry(state) {
  const sizes = new Map(), rects = new Map(), visible = [], ports = new Map();
  function size(n) {
    const top = contentTop(state, n);
    const kids = n.collapsed ? [] : children(state, n.id);
    const dims = kids.map(k => ({ k, ...size(k) }));
    const result = { w: Math.max(['containerd','kubelet'].includes(n.type)?210:kernelSpace(state,n)?760:bridgeLaneSpace(state,n)?440:n.type==='switch'?420:['patch_panel','fiber_panel'].includes(n.type)?360:300, ...dims.map(d => d.k.x + d.w + GAP)), h: Math.max(top + 12, ...dims.map(d => d.k.y + d.h + GAP)) };
    sizes.set(n.id, result); return result;
  }
  children(state, null).forEach(size);
  function walk(n, ox = 0, oy = 0, ancestors = []) {
    const r = { id: n.id, x: ox + n.x, y: oy + n.y, ...sizes.get(n.id), headH: contentTop(state,n)-12, ancestors };
    rects.set(n.id, r); visible.push(n);
    displayPorts(state, n).forEach(({ p, node, proxy,alias }, i) => {
      const side = i % 2 ? 1 : -1;
      ports.set(p.id, { id: p.id, owner: n.id, node: node.id, x: side < 0 ? r.x : r.x + r.w,
        y: r.y + HEADER + Math.floor(i / 2) * portRow(n) + portRow(n) / 2, side, proxy });if(alias)ports.set(alias,{...ports.get(p.id),id:alias});
    });
    if (!n.collapsed) children(state, n.id).forEach(k => walk(k, r.x, r.y, [...ancestors, n.id]));
  }
  children(state, null).forEach(n => walk(n));
  return { sizes, rects, visible, ports };
}
export function overlaps(a, b, gap = GAP) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}
// Growing a container pushes only overlapping siblings down. No node or cable is discarded.
export function settle(state) {
  let changed = false;
  function group(parent) {
    const peers = children(state, parent);
    peers.forEach(n => group(n.id));
    const parentNode = state.nodes.find(n => n.id === parent);
    const minY = parentNode ? contentTop(state, { ...parentNode, collapsed: false }) : GAP;
    const placed = [];
    for (const n of peers.toSorted((a, b) => a.y - b.y || a.x - b.x)) {
      const before = [n.x, n.y];
      n.x = Math.max(GAP, n.x); n.y = Math.max(minY, n.y);
      const d = geometrySize(state, n);
      let hit;
      while ((hit = placed.find(p => overlaps({ ...d, x: n.x, y: n.y }, p)))) n.y = hit.y + hit.h + GAP;
      placed.push({ x: n.x, y: n.y, ...d });
      changed ||= before[0] !== n.x || before[1] !== n.y;
    }
  }
  group(null); return changed;
}
function geometrySize(state, n) {
  const kids = n.collapsed ? [] : children(state, n.id);
  const dims = kids.map(k => ({ k, ...geometrySize(state, k) }));
  return { w: Math.max(kernelSpace(state,n)?760:bridgeLaneSpace(state,n)?440:n.type==='switch'?420:['patch_panel','fiber_panel'].includes(n.type)?360:300, ...dims.map(d => d.k.x + d.w + GAP)),
    h: Math.max(contentTop(state, n) + 12, ...dims.map(d => d.k.y + d.h + GAP)) };
}
// Swept axis motion: a fast pointer movement cannot tunnel through a sibling.
export function moveNode(state, id, dx, dy) {
  const n = state.nodes.find(n => n.id === id), d = geometrySize(state, n);
  const parent = state.nodes.find(p => p.id === n.parent), minY = parent ? contentTop(state, { ...parent, collapsed: false }) : GAP;
  const peers = children(state, n.parent).filter(p => p.id !== id).map(p => ({ x: p.x, y: p.y, ...geometrySize(state, p) }));
  let x = Math.max(GAP, n.x + dx), y = Math.max(minY, n.y + dy);
  for (const b of peers) {
    if (n.y < b.y + b.h + GAP && n.y + d.h + GAP > b.y) {
      if (dx > 0 && n.x + d.w + GAP <= b.x) x = Math.min(x, b.x - d.w - GAP);
      if (dx < 0 && n.x >= b.x + b.w + GAP) x = Math.max(x, b.x + b.w + GAP);
    }
  }
  for (const b of peers) {
    if (x < b.x + b.w + GAP && x + d.w + GAP > b.x) {
      if (dy > 0 && n.y + d.h + GAP <= b.y) y = Math.min(y, b.y - d.h - GAP);
      if (dy < 0 && n.y >= b.y + b.h + GAP) y = Math.max(y, b.y + b.h + GAP);
    }
  }
  n.x = x; n.y = y; settle(state);
}
export function moveNodes(state,ids,dx,dy){
 const selected=new Set(ids),moving=state.nodes.filter(n=>selected.has(n.id)&&!(()=>{let p=state.nodes.find(a=>a.id===n.parent);while(p){if(selected.has(p.id))return true;p=state.nodes.find(a=>a.id===p.parent)}return false})());
 let mx=dx,my=dy;
 for(const n of moving){const d=geometrySize(state,n),p=state.nodes.find(a=>a.id===n.parent),minY=p?contentTop(state,{...p,collapsed:false}):GAP;mx=Math.max(mx,GAP-n.x);my=Math.max(my,minY-n.y);
  for(const b of children(state,n.parent).filter(b=>!selected.has(b.id))){const r={x:b.x,y:b.y,...geometrySize(state,b)};if(n.y<r.y+r.h+GAP&&n.y+d.h+GAP>r.y){if(mx>0&&n.x+d.w+GAP<=r.x)mx=Math.min(mx,r.x-n.x-d.w-GAP);if(mx<0&&n.x>=r.x+r.w+GAP)mx=Math.max(mx,r.x+r.w+GAP-n.x)}}}
 for(const n of moving){const d=geometrySize(state,n),x=n.x+mx;for(const b of children(state,n.parent).filter(b=>!selected.has(b.id))){const r={x:b.x,y:b.y,...geometrySize(state,b)};if(x<r.x+r.w+GAP&&x+d.w+GAP>r.x){if(my>0&&n.y+d.h+GAP<=r.y)my=Math.min(my,r.y-n.y-d.h-GAP);if(my<0&&n.y>=r.y+r.h+GAP)my=Math.max(my,r.y+r.h+GAP-n.y)}}}
 moving.forEach(n=>{n.x+=mx;n.y+=my});settle(state);
}
export function zoomAt(camera, factor, point) {
  const zoom = Math.max(.2, Math.min(2, factor));
  return { zoom, left: (camera.left + point.x) / camera.zoom * zoom - point.x,
    top: (camera.top + point.y) / camera.zoom * zoom - point.y };
}
export function segmentHits(a, b, r) {
  if (a.x === b.x) return a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h;
  if (a.y === b.y) return a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w;
  return true;
}
function simplify(points) {
  return points.filter((p, i) => !i || i === points.length - 1 || !(
    points[i-1].x === p.x && p.x === points[i+1].x || points[i-1].y === p.y && p.y === points[i+1].y));
}
// Compressed orthogonal grid. Obstacles are full unrelated nodes and headers of ancestors.
export function routeCable(a, b, obstacles, lane = 0, tight = false, lanes = [], bounds = null) {
  a=inwardPort(a,bounds);b=inwardPort(b,bounds);
  const clearance = tight ? 3 : 8 + lane % 4 * 3;
  const blocks = obstacles.map(r => ({ x: r.x - clearance, y: r.y - clearance, w: r.w + 2 * clearance, h: r.h + 2 * clearance }));
  const stub = bounds?(tight?6:12):tight ? 12 : 26 + lane % 4 * 3;
  const clamp=p=>bounds?{x:Math.max(bounds.x+4,Math.min(bounds.x+bounds.w-4,p.x)),y:Math.max(bounds.y+4,Math.min(bounds.y+bounds.h-4,p.y))}:p;
  const start=clamp({x:a.x+a.side*stub,y:a.y}),end=clamp({x:b.x+b.side*stub,y:b.y});
  const inBounds=p=>!bounds||(p.x>=bounds.x+4&&p.x<=bounds.x+bounds.w-4&&p.y>=bounds.y+4&&p.y<=bounds.y+bounds.h-4);
  const clear = (p, q) => inBounds(p)&&inBounds(q)&&!parallelConflict(p,q,lanes)&&!blocks.some(r => segmentHits(p, q, r));
  const tidy=points=>{const out=[points[0]];let i=0;while(i<points.length-1){let found=false;for(let j=points.length-1;j>i;j--){const a=points[i],b=points[j],horizontal=points[i+1].y===a.y,corners=horizontal?[{x:b.x,y:a.y},{x:a.x,y:b.y}]:[{x:a.x,y:b.y},{x:b.x,y:a.y}];for(const c of corners)if(clear(a,c)&&clear(c,b)){out.push(c,b);i=j;found=true;break}if(found)break}if(!found)out.push(points[++i])}return simplify(out.filter((p,i,a)=>!i||p.x!==a[i-1].x||p.y!==a[i-1].y))};
  const inside=(p,r)=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
  const clearStub=(p,q)=>!parallelConflict(p,q,lanes)&&!blocks.some(r=>!inside(p,r)&&segmentHits(p,q,r));
  const fallback=()=>tight?{points:[a,start,{x:start.x,y:end.y},end,b],blocked:true}:routeCable(a,b,obstacles,0,true,lanes,bounds);
  if (!clearStub(a, start) || !clearStub(b, end)) return fallback();
  const gridLanes=laneCoordinates(lanes);
  const xs = [...new Set([...(bounds?[bounds.x+4,bounds.x+bounds.w-4]:[]),...gridLanes.xs,start.x, end.x, ...blocks.flatMap(r => [r.x - 1, r.x + r.w + 1])])].filter(x=>!bounds||(x>=bounds.x+4&&x<=bounds.x+bounds.w-4)).sort((a,b)=>a-b);
  const ys = [...new Set([...(bounds?[bounds.y+4,bounds.y+bounds.h-4]:[]),...gridLanes.ys,start.y, end.y, ...blocks.flatMap(r => [r.y - 1, r.y + r.h + 1])])].filter(y=>!bounds||(y>=bounds.y+4&&y<=bounds.y+bounds.h-4)).sort((a,b)=>a-b);
  const width = xs.length, key = (x,y)=>y*width+x, xy = id=>({x:xs[id%width],y:ys[Math.floor(id/width)]});
  const first = key(xs.indexOf(start.x),ys.indexOf(start.y)), last = key(xs.indexOf(end.x),ys.indexOf(end.y));
  const open = [{id:first,f:0}], cost = new Map([[first,0]]), previous = new Map(), closed = new Set();
  let iterations = 0;
  while (open.length && iterations++ < 20000) {
    // Binary heap pop.
    const curr = open[0], tail = open.pop();
    if(open.length){open[0]=tail;let i=0;while(true){let c=i*2+1;if(c>=open.length)break;if(c+1<open.length&&open[c+1].f<open[c].f)c++;if(open[i].f<=open[c].f)break;[open[i],open[c]]=[open[c],open[i]];i=c}}
    if(closed.has(curr.id))continue;
    if(curr.id===last){const points=[];let id=last;while(id!==undefined){points.unshift(xy(id));id=previous.get(id)}return{points:simplify([a,...tidy(points),b]),blocked:false}}
    closed.add(curr.id);
    const ix=curr.id%width,iy=Math.floor(curr.id/width),p=xy(curr.id);
    for(const [x,y] of [[ix-1,iy],[ix+1,iy],[ix,iy-1],[ix,iy+1]]){
      if(x<0||x>=width||y<0||y>=ys.length)continue;
      const id=key(x,y),q=xy(id);if(closed.has(id)||!clear(p,q))continue;
      const value=cost.get(curr.id)+Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
      if(value >= (cost.get(id)??Infinity))continue;
      cost.set(id,value);previous.set(id,curr.id);
      const item={id,f:value+Math.abs(q.x-end.x)+Math.abs(q.y-end.y)};
      open.push(item);let i=open.length-1;while(i>0){const parent=(i-1)>>1;if(open[parent].f<=item.f)break;open[i]=open[parent];i=parent;open[i]=item}
    }
  }
  return fallback();
}
export function cableObstacles(g, a, b) {
  const related = new Set([a.owner,b.owner,...g.rects.get(a.owner).ancestors,...g.rects.get(b.owner).ancestors]);
  const ancestorOfEndpoint=new Set([...g.rects.get(a.owner).ancestors,...g.rects.get(b.owner).ancestors]);
  return [...g.rects.values()].filter(r=>!r.ancestors.some(id=>!related.has(id))).map(r => ancestorOfEndpoint.has(r.id)
    ? {x:r.x,y:r.y,w:r.w,h:r.id===a.owner||r.id===b.owner?48:r.headH} : r);
}
export function pathData(points) { return points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '); }
