import {PASSIVE,getProfile} from './physical.js';
import {LAG_MODES} from './lag.js';
export const vlanColor=v=>`hsl(${(Number(v)*137.508+30)%360} 64% 63%)`;
export function portRow(n){return (n.type==='switch'?72:n.type==='bridge'?76:64)+(n.interfaces.some(p=>p.lagGroup)?14:0)}
export function portView(n,p){
 const index=n.interfaces.findIndex(a=>a.id===p.id),passive=PASSIVE.includes(n.type),switching=['switch','bridge'].includes(n.type);
 const pair=p.pairIndex||Math.floor(index/2)+1;const name=passive&&index>=0?`PORT ${pair} ${index%2?'OUT':'IN'}`:p.name;
 const role=n.type==='bridge'&&(p.ip||p.interfaceRole==='bridge-l3')?'L3':passive?(index%2?'OUT':'IN'):switching?(p.switchMode==='trunk'?'TRUNK':'ACCESS'):'';
 const vlans=switching?p.switchMode==='trunk'?(p.allowedVlans||[1,10,20]):[p.accessVlan||1]:p.tagged?[p.accessVlan||1]:[];
 const detail=n.type==='bridge'&&p.ip?(p.ip?'IP моста · интерфейс ядра':'Интерфейс моста · IP не задан'):passive?'↔ '+`PORT ${pair} ${index%2?'IN':'OUT'}`:switching?(p.switchMode==='trunk'?`VLAN ${vlans.join(', ')} · native ${p.nativeVlan||1}`:`VLAN ${p.accessVlan||1} · без тега`):'';
 return{name,role,vlans,detail,lag:p.lagGroup?`${p.lagMode==='backup'?'BOND':'LAG'} ${p.lagGroup} · ${LAG_MODES[p.lagMode||'active']}`:'',profile:getProfile(p).name};
}
export function lassoSelection(s,rect,g,existing=[],add=false,crossing=false){
 const matches=g.visible.filter(n=>{const r=g.rects.get(n.id);if(crossing){const insideParent=s.nodes.some(k=>k.parent===n.id)&&rect.x>r.x&&rect.y>r.y+48&&rect.x+rect.w<r.x+r.w&&rect.y+rect.h<r.y+r.h;return !insideParent&&r.x<=rect.x+rect.w&&r.y<=rect.y+rect.h&&r.x+r.w>=rect.x&&r.y+r.h>=rect.y}return r.x>=rect.x&&r.y>=rect.y&&r.x+r.w<=rect.x+rect.w&&r.y+r.h<=rect.y+rect.h});
 const ids=new Set(matches.map(n=>n.id)),top=matches.filter(n=>!g.rects.get(n.id).ancestors.some(id=>ids.has(id))).map(n=>n.id);
 return [...new Set([...(add?existing:[]),...top])];
}
