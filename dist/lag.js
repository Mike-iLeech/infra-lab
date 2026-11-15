import {physicalError,getProfile,PASSIVE} from './physical.js';
export const LAG_MODES={static:'Static / EtherChannel',active:'LACP active / 802.3ad',passive:'LACP passive',backup:'Bond active-backup'};
const signature=p=>JSON.stringify([p.switchMode||'access',p.accessVlan||1,p.nativeVlan||1,[...(p.allowedVlans||[1,10,20])].sort((a,b)=>a-b)]);
export function lagStatus(s){
 const byPort=new Map(),groups=new Map(),errors=new Map();
 for(const n of s.nodes)for(const p of n.interfaces){byPort.set(p.id,{n,p});if(p.lagGroup){const key=n.id+'|'+p.lagGroup;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({n,p})}}
 const peerOf=id=>{const seen=new Set();while(!seen.has(id)){seen.add(id);const l=s.links.find(l=>l.a===id||l.b===id);if(!l)return null;const x=byPort.get(l.a===id?l.b:l.a);if(!x)return null;if(PASSIVE.includes(x.n.type)){const i=x.n.interfaces.findIndex(p=>p.id===x.p.id),pair=x.n.interfaces[i%2?i-1:i+1];if(!pair)return null;id=pair.id;continue}return x}return null};
 const keyOf=x=>x.n.id+'|'+x.p.lagGroup;
 for(const group of groups.values()){
  const first=group[0].p;
  if(group.some(x=>signature(x.p)!==signature(first)||(x.p.lagMode||'active')!==(first.lagMode||'active')))group.forEach(x=>errors.set(x.p.id,'В группе '+first.lagGroup+' различаются VLAN или режим агрегации'));
  const speedSets=group.map(x=>getProfile(x.p).speeds);if(first.lagMode!=='backup'&&speedSets.length&& !speedSets[0].some(v=>speedSets.every(a=>a.includes(v))))group.forEach(x=>errors.set(x.p.id,'У участников LAG нет общей скорости'));
  const peers=new Set();for(const x of group){const remote=peerOf(x.p.id);if(!remote)continue;peers.add(keyOf(remote));}
  if((first.lagMode||'active')!=='backup'&&peers.size>1)group.forEach(x=>errors.set(x.p.id,'LAG должен завершаться на одной группе одного устройства; MLAG пока не моделируется'));
 }
 for(const l of s.links){let a=byPort.get(l.a),b=byPort.get(l.b);if(!a||!b)continue;if(a.p.lagGroup)b=peerOf(a.p.id)||b;else if(b.p.lagGroup)a=peerOf(b.p.id)||a;
  if(!a.p.lagGroup&&!b.p.lagGroup)continue;
  const ma=a.p.lagGroup?(a.p.lagMode||'active'):null,mb=b.p.lagGroup?(b.p.lagMode||'active'):null;
  if(ma==='backup'||mb==='backup'){if(ma&&mb&&ma!=='backup'&&mb!=='backup')continue;const bond=ma==='backup'?a:b,remote=bond===a?b:a;if(remote.p.lagGroup&&remote.p.lagMode!=='backup')errors.set(bond.p.id,'Bond active-backup требует самостоятельные порты на противоположной стороне');continue}
  const valid=ma==='static'&&mb==='static'||['active','passive'].includes(ma)&&['active','passive'].includes(mb)&&(ma==='active'||mb==='active');
  if(!valid){if(a.p.lagGroup)errors.set(a.p.id,ma==='passive'&&mb==='passive'?'LACP passive/passive: ни одна сторона не начинает согласование':'LAG/LACP не согласован с противоположным портом');if(b.p.lagGroup)errors.set(b.p.id,'LAG/LACP не согласован с противоположным портом')}
 }
 for(const group of groups.values())if(group[0].p.lagMode==='backup'){
  const active=group.find(x=>{const l=s.links.find(l=>l.a===x.p.id||l.b===x.p.id);if(!l||errors.has(x.p.id))return false;const remote=byPort.get(l.a===x.p.id?l.b:l.a);return remote&&!physicalError(x.p,remote.p,l)});
  group.filter(x=>x!==active).forEach(x=>{if(!errors.has(x.p.id))errors.set(x.p.id,'Резервный участник bond active-backup · ожидание')});
 }
 return {errors,groups,byPort};
}
export function lagLinkError(status,a,b){return status.errors.get(a.id)||status.errors.get(b.id)||''}
