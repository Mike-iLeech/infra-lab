import {portView} from './port-view.js';
import {TRANSPARENT,PASSIVE,physicalError} from './physical.js';
import {lagStatus,lagLinkError} from './lag.js';
import {memberId} from './bridges.js';
export function networkGraph(s){
  const known=new Set([1]);s.nodes.forEach(n=>n.interfaces.forEach(p=>[p.accessVlan,p.nativeVlan,p.vlanId,...(p.allowedVlans||[])].filter(Boolean).forEach(v=>known.add(v))));
  const replicas=[],parent=new Map(),adj=new Map(),byPort=new Map(),lag=lagStatus(s);
  for(const n of s.nodes)for(const p of n.interfaces){
    const transparent=TRANSPARENT.includes(n.type),mode=p.switchMode||'access';
    const vlans=transparent?[0,...known]:mode==='trunk'?(p.allowedVlans||[1,10,20]):[p.accessVlan||p.vlanId||1];
    for(const vlan of vlans){const tag=transparent?(vlan||null):mode==='trunk'?(vlan===(p.nativeVlan||1)?null:vlan):(p.tagged?vlan:null);
      const key=p.id+'@'+vlan,management=mode==='trunk'?(p.nativeVlan||1):(p.accessVlan||p.vlanId||1);
      const r={...p,name:portView(n,p).name,ip:vlan===management?p.ip:'',node:n,vlan,tag,key};replicas.push(r);parent.set(key,key);adj.set(key,[]);if(!byPort.has(p.id))byPort.set(p.id,[]);byPort.get(p.id).push(r);
    }
  }
  const find=a=>parent.get(a)===a?a:(parent.set(a,find(parent.get(a))),parent.get(a));
  const join=(a,b,reason,meta={})=>{if(!a||!b)return;parent.set(find(a.key),find(b.key));adj.get(a.key).push({key:b.key,reason,...meta});adj.get(b.key).push({key:a.key,reason,...meta})};
  for(const l of s.links){const aa=byPort.get(l.a)||[],bb=byPort.get(l.b)||[];if(!aa.length||!bb.length||physicalError(aa[0],bb[0],l)||lagLinkError(lag,aa[0],bb[0]))continue;for(const a of aa)for(const b of bb)if(a.tag===b.tag)join(a,b,(l.kind==='veth'?'veth-пара: хост ↔ namespace контейнера':l.medium==='adapter'?'тот же виртуальный адаптер в гостевой ОС':`кабель · ${a.tag?'802.1Q VLAN '+a.tag:'без тега'}`)+(a.lagGroup?' · LAG '+a.lagGroup:''),{kind:'cable',linkId:l.id})}
  for(const n of s.nodes){
    if(PASSIVE.includes(n.type)){for(let i=0;i+1<n.interfaces.length;i+=2)for(const a of byPort.get(n.interfaces[i].id)||[])for(const b of byPort.get(n.interfaces[i+1].id)||[])if(a.tag===b.tag)join(a,b,'пассивная пара панели');continue}
    if(['switch','bridge',...TRANSPARENT].includes(n.type)){
      const ports=[...n.interfaces.map(p=>p.id),...(n.type==='bridge'?n.members||[]:[])];const groups=new Map();
      for(const id of ports)for(const r of byPort.get(id)||[]){const key=r.vlan;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
      for(const group of groups.values())for(let i=0;i<(n.type==='switch'?group.length:1);i++)for(const r of group.slice(i+1))join(group[i],r,TRANSPARENT.includes(n.type)?'прозрачный переход среды':n.type==='bridge'&&r.tag===null?`L2 · без тега (локальный PVID ${r.vlan})`:`L2 · VLAN ${r.vlan}`,{kind:'internal',deviceId:n.id,bindingIds:n.type==='bridge'?[group[0],r].filter(p=>(n.members||[]).includes(p.id)).map(p=>memberId(n.id,p.id)):[]});
    }
  }
  // A bundle is one logical attachment even on a host that is not itself a switch.
  for(const group of lag.groups.values()){
    if(group.some(x=>lag.errors.has(x.p.id)&&!lag.errors.get(x.p.id).includes('ожидание')))continue;
    const channels=new Map();for(const {p} of group)for(const r of byPort.get(p.id)||[]){if(!channels.has(r.vlan))channels.set(r.vlan,[]);channels.get(r.vlan).push(r)}
    for(const channel of channels.values())for(const r of channel.slice(1))join(channel[0],r,`${group[0].p.lagMode==='backup'?'BOND':'LAG'} ${group[0].p.lagGroup} · логическая агрегация`,{kind:'internal',deviceId:group[0].n.id});
  }
  const groups=new Map();replicas.forEach(p=>{const key=find(p.key);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p)});
  return {segments:[...groups.values()],adj,replicas,byPort,lag};
}
export function layer2Events(graph,source,target){
 const queue=[source.key],prev=new Map([[source.key,null]]),map=new Map(graph.replicas.map(p=>[p.key,p]));
 while(queue.length){const key=queue.shift();if(key===target.key){const result=[];let k=key;while(prev.get(k)){const edge=prev.get(k),a=map.get(edge.from),b=map.get(k);result.unshift({type:'hop',nodeId:edge.deviceId||b.node.id,fromNode:a.node.id,toNode:b.node.id,fromPort:a.id,toPort:b.id,portIds:[a.id,b.id],linkIds:edge.linkId?[edge.linkId]:[],bindingIds:edge.bindingIds||[],vlan:b.vlan,label:`${b.node.name} / ${b.name} · ${edge.reason}`});k=edge.from}return result}for(const e of graph.adj.get(key)||[])if(!prev.has(e.key)){prev.set(e.key,{...e,from:key});queue.push(e.key)}}return[];
}
export function layer2Path(graph,source,target){const queue=[source.key],prev=new Map([[source.key,null]]),map=new Map(graph.replicas.map(p=>[p.key,p]));while(queue.length){const key=queue.shift();if(key===target.key){const result=[];let k=key;while(prev.get(k)){const edge=prev.get(k);const p=map.get(k);result.unshift(`${p.node.name} / ${p.name} · ${edge.reason}`);k=edge.from}return result}for(const e of graph.adj.get(key)||[])if(!prev.has(e.key)){prev.set(e.key,{from:key,reason:e.reason});queue.push(e.key)}}return[]}
