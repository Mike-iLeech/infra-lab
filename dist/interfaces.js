import {PASSIVE} from './physical.js';
export function ensurePassivePairs(n){if(!PASSIVE.includes(n.type))return;for(let i=0;i<n.interfaces.length;i+=2){const a=n.interfaces[i],b=n.interfaces[i+1],number=a.pairIndex||b?.pairIndex||Math.floor(i/2)+1;a.pairIndex=number;a.pairSide='in';if(b){b.pairIndex=number;b.pairSide='out'}}}
export function nextPassiveIdentity(n){ensurePassivePairs(n);const last=n.interfaces.at(-1);if(last?.pairSide==='in')return{pairIndex:last.pairIndex,pairSide:'out'};return{pairIndex:Math.max(0,...n.interfaces.map(p=>p.pairIndex||0))+1,pairSide:'in'}}
export function removeInterface(s,id){
 const n=s.nodes.find(n=>n.interfaces.some(p=>p.id===id));if(!n)throw Error('Интерфейс не найден');ensurePassivePairs(n);const p=n.interfaces.find(p=>p.id===id),removed=n.interfaces.filter(a=>PASSIVE.includes(n.type)?a.pairIndex===p.pairIndex:a.id===id),ids=new Set(removed.map(p=>p.id));
 const cables=s.links.filter(l=>ids.has(l.a)||ids.has(l.b)).length;let bindings=0;
 n.interfaces=n.interfaces.filter(p=>!ids.has(p.id));s.links=s.links.filter(l=>!ids.has(l.a)&&!ids.has(l.b));
 for(const node of s.nodes)if(node.members){bindings+=node.members.filter(id=>ids.has(id)).length;node.members=node.members.filter(id=>!ids.has(id))}
 if(Array.isArray(s.subnets))s.subnets=s.subnets.map(a=>({...a,ports:(a.ports||[]).filter(id=>!ids.has(id))})).filter(a=>a.ports.length);
 return{nodeId:n.id,name:PASSIVE.includes(n.type)?'PORT '+p.pairIndex+' IN / OUT':p.name,ids:[...ids],cables,bindings};
}
