import {interfaceOwner} from './ownership.js';
import {memberId} from './bridges.js';
// A local Linux bridge member is drawn once, on the bridge. Its model owner stays the OS.
export function attachedBridgePorts(s){return s.nodes.filter(n=>n.type==='bridge').flatMap(bridge=>{
 const host=interfaceOwner(s,bridge);if(!['ubuntu','debian','windows'].includes(host.type))return[];
 return host.interfaces.filter(p=>p.kind==='virtual'&&bridge.members?.includes(p.id)).map(p=>({host,bridge,p,alias:memberId(bridge.id,p.id)}));
})}
export function bridgeLaneSpace(s,n){return n.type==='bridge'&&attachedBridgePorts(s).some(a=>a.bridge.id===n.id)?36:0}
export function localBridgePaths(s,g){return attachedBridgePorts(s).flatMap(a=>{
 const from=a.bridge.interfaces.find(p=>p.ip)||a.bridge.interfaces[0],start=g.ports.get(from?.id),end=g.ports.get(a.p.id),r=g.rects.get(a.bridge.id);
 if(!r||!start||!end||start.owner!==a.bridge.id||end.owner!==a.bridge.id)return[];
 const y=r.y+r.h-20,x1=start.side<0?r.x+10:r.x+r.w-10,x2=end.side<0?r.x+10:r.x+r.w-10;
 return[{...a,start,end,points:[start,{x:x1,y:start.y},{x:x1,y},{x:x2,y},{x:x2,y:end.y},end],label:{x:r.x+r.w/2,y:y-6}}];
})}
