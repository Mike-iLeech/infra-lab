import {cniRoute,cidrContains} from './cni.js';
import {hostPublications} from './publications.js';
import {listeningApplication,applicationRunning} from './workloads.js';
import {packetTuple,reversePacket,destinationNAT,sourceNAT,CLIENT_TCP_PORT,CLIENT_DNS_PORT} from './packet-fields.js';
import {networkGraph,layer2Events} from './network.js';
import {ipnum,range,diagnostics} from './model.js';
import {physicalError,physicalIssues,TRANSPARENT,PASSIVE,getProfile} from './physical.js';
import {hostInterfaces,interfaceOwner} from './ownership.js';
import {bridgeCandidates} from './bridges.js';
import {lagLinkError} from './lag.js';
const nodePort=(p,label,type='origin')=>({type,nodeId:p.node.id,portIds:[p.id],linkIds:[],bindingIds:[],label});
const stop=(nodeId,portIds,label,extra={})=>({type:'stop',nodeId,portIds:portIds||[],linkIds:[],bindingIds:[],label,...extra});
function configurationStop(s,g){for(const segment of g.segments){const ips=new Map();for(const p of segment){if(!p.ip)continue;const r=range(`${p.ip}/${p.prefix}`),n=ipnum(p.ip);if(!r||n===r.base||n===r.last)return stop(p.node.id,[p.id],`${p.node.name}/${p.name}: недопустимый адрес ${p.ip}/${p.prefix}`);if(ips.has(p.ip)&&ips.get(p.ip).id!==p.id){const other=ips.get(p.ip);return stop(p.node.id,[other.id,p.id],`Конфликт IP ${p.ip}: ${other.node.name}/${other.name} и ${p.node.name}/${p.name}`,{fromNode:other.node.id,toNode:p.node.id})}ips.set(p.ip,p);if(p.gateway&&(ipnum(p.gateway)===null||ipnum(p.gateway)<=r.base||ipnum(p.gateway)>=r.last))return stop(p.node.id,[p.id],`${p.node.name}/${p.name}: шлюз вне подсети`)}}return null}
function potentialPath(s,start,end,missing=false){
 const adj=new Map(s.nodes.flatMap(n=>n.interfaces.map(p=>[p.id,[]]))),add=(a,b,meta={})=>{if(!adj.has(a)||!adj.has(b))return;adj.get(a).push({to:b,...meta});adj.get(b).push({to:a,...meta})};
 s.links.forEach(l=>add(l.a,l.b,{link:l}));
 for(const n of s.nodes){if(PASSIVE.includes(n.type)){for(let i=0;i+1<n.interfaces.length;i+=2)add(n.interfaces[i].id,n.interfaces[i+1].id,{device:n});continue}
  if(['bridge','switch',...TRANSPARENT].includes(n.type)){const ids=[...n.interfaces.map(p=>p.id),...(n.members||[])];ids.slice(1).forEach(id=>add(ids[0],id,{device:n}));
   if(missing&&n.type==='bridge'&&ids.length){const parent=s.nodes.find(a=>a.id===n.parent);bridgeCandidates(s,n).filter(x=>parent?.type!=='proxmox'||['server','vm','proxmox'].includes(x.node.type)).filter(x=>!ids.includes(x.p.id)).forEach(x=>add(ids[0],x.p.id,{device:n,missing:true}))}
  }
 }
 const queue=[start],prev=new Map([[start,null]]);while(queue.length){const id=queue.shift();if(id===end){const result=[];let p=id;while(prev.get(p)){const e=prev.get(p);result.unshift({from:e.from,to:p,...e});p=e.from}return result}for(const e of adj.get(id)||[])if(!prev.has(e.to)){prev.set(e.to,{...e,from:id});queue.push(e.to)}}return null;
}
function blockedPath(s,g,source,target){
 const all=new Map(s.nodes.flatMap(n=>n.interfaces.map(p=>[p.id,{...p,node:n}])));
 const route=potentialPath(s,source.id,target.id)||potentialPath(s,source.id,target.id,true);
 const origin=nodePort(source,`${source.node.name} / ${source.name} (${source.ip})`),trace=[origin];let current=[source];
 if(!route)return{ok:false,trace:[...trace,stop(source.node.id,[source.id],`${source.node.name}: нет объявленного пути до ${target.node.name}. Сеть разорвана: проверьте кабели и привязки мостов.`)]};
 for(const edge of route){const a=all.get(edge.from),b=all.get(edge.to);let reason='';
  if(edge.missing)reason=`${b.node.name} / ${b.name} не присоединён к мосту ${edge.device.name}`;
  if(edge.link)reason=physicalError(a,b,edge.link)||lagLinkError(g.lag,a,b);
  let chosen=null;for(const replica of current){const next=(g.adj.get(replica.key)||[]).find(x=>g.replicas.find(p=>p.key===x.key)?.id===edge.to);if(next){chosen={from:replica,to:g.replicas.find(p=>p.key===next.key)};break}}
  if(!chosen&&!reason){const vlan=current[0]?.vlan||source.vlan;
   reason=edge.device?`${edge.device.name}: VLAN ${vlan} не проходит на ${b.name}. Проверьте ACCESS, allowed/native VLAN TRUNK и принадлежность мосту.`:`${a.node.name}/${a.name} → ${b.node.name}/${b.name}: теги VLAN не согласованы`;
  }
  if(reason){trace.push(stop(edge.device?.id||a.node.id,[a.id,b.id],reason,{fromPort:a.id,toPort:b.id,linkIds:edge.link?[edge.link.id]:[]}));return{ok:false,trace}}
  const ev=layer2Events(g,chosen.from,chosen.to);trace.push(...ev);current=[chosen.to];
 }
 trace.push(stop(target.node.id,[target.id],`${target.node.name}: IP/префикс не соответствует подсети отправителя`));return{ok:false,trace};
}
function physicalTransitFailure(s,events){
 const ports=new Map(s.nodes.flatMap(n=>n.interfaces.map(p=>[p.id,{...p,node:n}])));let entry=null,total=0;
 for(let i=0;i<events.length;i++){const e=events[i],a=ports.get(e.fromPort),b=ports.get(e.toPort);if(!a||!b)continue;
  const device=s.nodes.find(n=>n.id===e.nodeId);if(device?.type==='media_converter'&&e.fromNode===e.toNode){const p=getProfile(a),q=getProfile(b);if(!p.speeds.some(v=>q.speeds.includes(v)))return{index:i,event:stop(device.id,[a.id,b.id],'Медиаконвертер: у входного и выходного портов нет общей скорости')}}
  const l=s.links.find(l=>e.linkIds.includes(l.id));if(!l)continue;
  if(!getProfile(a).passive&&getProfile(b).passive){entry=a;total=Number(l.length??3)}
  else if(entry){total+=Number(l.length??3);if(!getProfile(b).passive){const error=physicalError(entry,b,{...l,length:total});if(error)return{index:i,event:stop(b.node.id,[b.id],`После пассивной панели: ${error}`,{linkIds:[l.id],fromPort:a.id,toPort:b.id})};entry=null;total=0}}
 }
 return null;
}
function route(s,graph,src,dst,protocol,port){
 const n=s.nodes.find(n=>n.id===src);if(!n)return{ok:false,trace:[stop(null,[],'Источник не выбран')]};
 const targets=graph.replicas.filter(p=>p.ip===dst),starts=hostInterfaces(s,src).filter(p=>p.ip).map(p=>graph.replicas.find(a=>a.id===p.id&&a.ip===p.ip)).filter(Boolean);
 if(!starts.length)return{ok:false,trace:[stop(n.id,n.interfaces.map(p=>p.id),`${n.name}: нет интерфейса с IP-адресом`)]};
 if(!targets.length)return{ok:false,trace:[nodePort(starts[0],`${n.name}: отправка к ${dst}`),stop(n.id,[starts[0].id],`Адрес ${dst} не найден в модели`)]};
 const queue=starts.map(p=>({p,origin:p.ip,trace:[nodePort(p,`${n.name} / ${p.name} (${p.ip})`)],seen:[]}));let failure=null;
 while(queue.length){const {p,origin,trace,seen}=queue.shift();if(seen.includes(p.key))continue;const segment=graph.segments.find(g=>g.some(a=>a.key===p.key)),subnet=range(`${p.ip}/${p.prefix}`),target=segment.find(a=>a.ip===dst),number=ipnum(dst);
  if(target&&subnet&&number>subnet.base&&number<subnet.last){const events=layer2Events(graph,p,target),fault=physicalTransitFailure(s,events);if(fault)return{ok:false,trace:[...trace,...events.slice(0,fault.index),fault.event]};return{ok:true,sourceIP:origin,destination:interfaceOwner(s,target.node).id,targetPort:target.id,trace:[...trace,...events]}}
  const currentOwner=interfaceOwner(s,p.node),hint=cniRoute(currentOwner,dst),nextHop=hint&&cidrContains(p.ip+'/'+p.prefix,hint.via)?hint.via:p.gateway,gw=segment.find(a=>a.ip===nextHop),owner=gw&&interfaceOwner(s,gw.node);
  if(gw&&((owner.services.cni&&!owner.services.cni.enabled)||(hint?.via===nextHop&&!owner.services.cni?.enabled&&!['router','firewall'].includes(owner.type))))return{ok:false,sourceIP:origin,trace:[...trace,...layer2Events(graph,p,gw),stop(owner.id,[gw.id],owner.name+': CNI / IP forwarding не включён; пакет не маршрутизируется к Pod')]};
  if(gw&&(['router','firewall'].includes(owner.type)||owner.services.cni?.enabled)){
   const incoming=layer2Events(graph,p,gw),prefix=[...trace,...(hint&&hint.via===nextHop?[{type:'cni-next-hop',nodeId:currentOwner.id,portIds:[p.id],linkIds:[],bindingIds:[],label:currentOwner.name+': CNI маршрут '+hint.cidr+' via '+hint.via+' → '+p.name+' (физическая LAN, без туннеля)'}]:[]),...incoming];
   if(!subnet||ipnum(gw.ip)<=subnet.base||ipnum(gw.ip)>=subnet.last){failure={ok:false,trace:[...prefix,stop(n.id,[p.id],'Шлюз вне подсети источника')]};continue}
   const rules=owner.rules;if(owner.type==='firewall'&&((protocol==='icmp'&&rules.blockICMP)||(protocol==='tcp'&&rules.blockedPorts.includes(Number(port))))){return{ok:false,trace:[...prefix,stop(owner.id,[gw.id],`${owner.name}: правило запрещает ${protocol==='icmp'?'ICMP':'TCP/'+port}`)]}}
   let count=0;for(const out of hostInterfaces(s,owner.id).filter(a=>a.ip&&a.id!==gw.id&&(!owner.services.cni?.enabled||cidrContains(a.ip+'/'+a.prefix,dst)||(cniRoute(owner,dst)&&cidrContains(a.ip+'/'+a.prefix,cniRoute(owner,dst).via))))){const next=graph.replicas.find(a=>a.id===out.id&&a.ip===out.ip);if(next){queue.push({p:next,origin,trace:[...prefix,{type:owner.services.cni?.enabled?'cni-route':'route',nodeId:owner.id,fromNode:owner.id,toNode:owner.id,fromPort:gw.id,toPort:next.id,portIds:[gw.id,next.id],linkIds:[],bindingIds:[],label:`${owner.name}: ${owner.services.cni?.enabled?'CNI / ядро Ubuntu · L3':'маршрутизация'} ${gw.name} → ${next.name}`}],seen:[...seen,p.key,gw.key]});count++}}
   if(!count)failure={ok:false,trace:[...prefix,stop(owner.id,[gw.id],`${owner.name}: нет выходного маршрута`)]};continue;
  }
  const r=blockedPath(s,graph,p,targets[0]);if(!failure||r.trace.length>failure.trace.length)failure={...r,trace:[...trace.slice(0,-1),...r.trace]};
 }
 return failure||{ok:false,trace:[stop(n.id,[],`${n.name}: нет маршрута`)]};
}
export function simulate(s,{source,target,protocol='icmp',port=80}){
 const graph=networkGraph(s),trace=[],physical=physicalIssues(s),configuration=diagnostics(s).filter(x=>!physical.includes(x));
 let packet=null;const stamp=e=>({...e,packet:packet?structuredClone(packet):null});const emit=e=>trace.push(stamp(e));
 const routeIP=r=>r.sourceIP||s.nodes.flatMap(n=>n.interfaces).find(p=>p.id===r.trace[0]?.portIds?.[0])?.ip;
 const finish=ok=>({ok,trace,steps:trace.map(e=>e.label),stop:ok?null:trace.at(-1)});
 const fail=(nodeId,ports,label,stage='Проверка')=>{emit({...stop(nodeId,ports,label),stage});return finish(false)};
 if(configuration.length){const exact=configurationStop(s,graph);if(exact){emit({...exact,stage:'Конфигурация'});return finish(false)}const issue=configuration[0],owner=s.nodes.find(n=>issue.startsWith(n.name+':')||issue.startsWith(n.name+'/'));return fail(owner?.id||source,owner?.interfaces.map(p=>p.id)||[],configuration.join('; '),'Конфигурация')}
 const append=(r,stage)=>{if(!r.ok&&/ответ|Echo reply/.test(stage)&&r.trace.length)r.trace.at(-1).label='Нет обратного пути: '+r.trace.at(-1).label;trace.push(...r.trace.map(e=>stamp({...e,stage})));return r.ok};
 let dst=target;
 if(ipnum(dst)===null){const dnsIPs=hostInterfaces(s,source).map(p=>p.dns).filter(Boolean),dns=s.nodes.find(n=>n.services.dns?.enabled&&hostInterfaces(s,n.id).some(p=>dnsIPs.includes(p.ip)));
  if(!dns)return fail(source,hostInterfaces(s,source).map(p=>p.id),'DNS: в интерфейсе источника не указан включённый DNS-сервер','DNS');
  const dip=hostInterfaces(s,dns.id).find(p=>dnsIPs.includes(p.ip)).ip,request=route(s,graph,source,dip,'udp',53);packet=packetTuple('udp',routeIP(request),CLIENT_DNS_PORT,dip,53);if(!append(request,'DNS · запрос'))return finish(false);
  dst=dns.services.dns.records[target];if(!dst)return fail(dns.id,dns.interfaces.map(p=>p.id),`DNS: запись ${target} отсутствует`,'DNS · NXDOMAIN');
  emit({type:'dns',nodeId:dns.id,portIds:dns.interfaces.map(p=>p.id),linkIds:[],bindingIds:[],stage:'DNS · разрешение',label:`DNS ${dip}: ${target} → ${dst}`});
  packet=reversePacket(packet);if(!append(route(s,graph,dns.id,request.sourceIP,'udp',53),'DNS · ответ'))return finish(false);
 }
 const forward=route(s,graph,source,dst,protocol,port);packet=packetTuple(protocol,routeIP(forward),CLIENT_TCP_PORT,dst,Number(port));const clientRequest=structuredClone(packet);if(!append(forward,protocol==='tcp'?'HTTP · запрос':'ICMP · запрос'))return finish(false);
 const owner=s.nodes.find(n=>n.id===forward.destination);
 if(protocol==='tcp'){
  const publication=hostPublications(s,owner).find(p=>Number(p.service.publishPort)===Number(port)),app=publication?.app,h=publication?.service;

  if(publication?.kind==='kubernetes'){
   if(owner.services.cni&& !owner.services.cni.enabled)return fail(owner.id,[forward.targetPort],'Ядро Ubuntu: CNI / IP forwarding выключен','CNI · отказ');
   const skipped=publication.skipped.map(c=>c.pod.name+' — '+c.reason).join('; ');
   emit({type:'service-rule',kernelPathId:publication.id,kernelPhase:'rule',nodeId:publication.node.id,portIds:[forward.targetPort],linkIds:[],bindingIds:[],serviceId:publication.entity.id,endpointId:app?.id,stage:'Kubernetes Service · '+publication.policy,label:publication.entity.name+': NodePort '+port+' → targetPort '+h.port+'; policy='+publication.policy+'; '+(app?'выбран '+app.name+(publication.remote?' на другом узле':' на этом узле'):'нет готовых endpoints')+(skipped?'; исключены: '+skipped:'')});
   if(!app)return fail(publication.node.id,[forward.targetPort],publication.policy==='Local'?'NodePort Local: на этом узле нет готового Pod, соответствующего namespace и selector Service':'NodePort Cluster: в кластере нет готового Pod, соответствующего namespace и selector Service','Kubernetes · нет endpoint');
  }
  if(app){
   const ap=app.interfaces.find(p=>p.ip);if(!ap)return fail(app.id,app.interfaces.map(p=>p.id),'Контейнер/Pod: нет IP для опубликованного сайта','Контейнер');
   const serviceApp=listeningApplication(s,app,h.port);if(!serviceApp)return fail(app.id,[ap.id],'Целевой порт контейнера не слушает ни одно приложение','TCP · отказ');if(!applicationRunning(s,serviceApp))return fail(serviceApp.id,[ap.id],'Приложение или контейнер остановлен','Приложение');
   const local=route(s,graph,owner.id,ap.ip,'tcp',h.port),first=local.trace[0]?.portIds[0],cluster=publication.kind==='kubernetes'&&publication.policy==='Cluster';
   const beforeNAT=structuredClone(packet);packet=destinationNAT(packet,ap.ip,Number(h.port));
   emit({nat:{kind:'DNAT · назначение',before:beforeNAT,after:structuredClone(packet)},type:'publish',nodeId:owner.id,fromNode:owner.id,toNode:owner.id,fromPort:forward.targetPort,toPort:first,portIds:[forward.targetPort,first].filter(Boolean),linkIds:[],bindingIds:[],kernelPathId:publication.id,kernelPhase:'dnat',stage:publication.kind==='kubernetes'?'Kubernetes · NodePort / DNAT':'Ubuntu · публикация / DNAT',label:'Публикация '+dst+':'+port+' → '+ap.ip+':'+h.port+' · правила ядра '+owner.name});
   if(cluster){const before=structuredClone(packet);packet=sourceNAT(packet,local.sourceIP||hostInterfaces(s,owner.id).find(p=>p.ip)?.ip,packet.source.port);emit({type:'publish',nodeId:owner.id,portIds:[first].filter(Boolean),linkIds:[],bindingIds:[],kernelPathId:publication.id,kernelPhase:'snat',stage:'Kubernetes · MASQUERADE / SNAT',nat:{kind:'SNAT · источник',before,after:structuredClone(packet)},label:'Cluster / iptables MASQUERADE: источник '+before.source.ip+':'+before.source.port+' → '+packet.source.ip+':'+packet.source.port+'; ответ должен вернуться на входной Node. Выбранный Pod: '+app.name})}
   emit({type:'kernel-route',nodeId:owner.id,fromNode:owner.id,toNode:owner.id,fromPort:forward.targetPort,toPort:first,portIds:[forward.targetPort,first].filter(Boolean),linkIds:[],bindingIds:[],kernelPathId:publication.id,kernelPhase:'route',stage:'Ubuntu · маршрутизация / FORWARD',label:'После DNAT ядро выбирает выход к '+ap.ip+' через '+(hostInterfaces(s,owner.id).find(p=>p.id===first)?.name||'сетевой интерфейс')+(publication.remote?'; CNI next-hop '+publication.backendHost?.interfaces.find(p=>p.ip)?.ip+' → физическая LAN → другой worker':'; FORWARD → мост L2 → veth. Между интерфейсами нет кабеля.')});
   if(!local.ok&&local.trace.length)local.trace.at(-1).label='Публикация: нет двусторонней связи с контейнером/Pod. '+local.trace.at(-1).label;if(!append(local,publication.remote?'CNI · межузловой запрос':'Контейнер · запрос'))return finish(false);
   if(publication.kind==='kubernetes'){emit({type:'namespace',nodeId:app.id,portIds:[ap.id],linkIds:[],bindingIds:[],stage:'Pod · eth0',label:app.name+': пакет доставлен в общий сетевой namespace Pod'});emit({type:'runtime',nodeId:serviceApp.parent,portIds:[ap.id],linkIds:[],bindingIds:[],stage:'Контейнер Pod',label:'Контейнер использует сетевой namespace Pod; отдельного NIC и кабеля нет'})}
   packet=reversePacket(packet);emit({type:'service',nodeId:serviceApp.id,portIds:[ap.id],linkIds:[],bindingIds:[],stage:'Приложение',label:serviceApp.name+': сформирован HTTP 200'});
   if(!append(route(s,graph,app.id,cluster?packet.destination.ip:local.sourceIP,'tcp',h.port),publication.remote?'CNI · межузловой ответ':'Контейнер · ответ'))return finish(false);
   if(cluster){const before=structuredClone(packet);packet=destinationNAT(packet,clientRequest.source.ip,clientRequest.source.port);emit({type:'publish',nodeId:owner.id,portIds:[first].filter(Boolean),linkIds:[],bindingIds:[],kernelPathId:publication.id,kernelPhase:'reverse-snat',stage:'Conntrack · обратный SNAT',nat:{kind:'Обратный SNAT · назначение',before,after:structuredClone(packet)},label:'Ответ вернулся на входной Node: conntrack восстанавливает назначение клиента '+packet.destination.ip+':'+packet.destination.port})}
   const beforeReverse=structuredClone(packet);packet=sourceNAT(packet,dst,Number(port));emit({nat:{kind:'Обратный DNAT · источник',before:beforeReverse,after:structuredClone(packet)},type:'publish',nodeId:owner.id,fromNode:owner.id,toNode:owner.id,fromPort:first,toPort:forward.targetPort,portIds:[first,forward.targetPort].filter(Boolean),linkIds:[],bindingIds:[],kernelPathId:publication.id,kernelPhase:'reverse',stage:'Ubuntu · обратная трансляция',label:'Ответ '+ap.ip+':'+h.port+' → клиент: conntrack меняет источник на '+dst+':'+port+' (обратная трансляция DNAT).'});
  }else {const serviceApp=listeningApplication(s,owner,port);if(!serviceApp)return fail(owner.id,[forward.targetPort],`TCP/${port}: служба не слушает`,'TCP · отказ');if(!applicationRunning(s,serviceApp))return fail(serviceApp.id,[forward.targetPort],'Приложение или среда остановлены','Приложение');packet=reversePacket(packet);emit({type:'service',nodeId:serviceApp.id,portIds:[forward.targetPort],linkIds:[],bindingIds:[],stage:'Приложение',label:serviceApp.name+': сформирован HTTP 200'});}
 }
 packet=reversePacket(clientRequest);if(!append(route(s,graph,owner.id,forward.sourceIP,protocol,port),protocol==='tcp'?'HTTP · ответ':'ICMP · Echo reply'))return finish(false);
 emit({type:'done',nodeId:source,portIds:hostInterfaces(s,source).filter(p=>p.ip===forward.sourceIP).map(p=>p.id),linkIds:[],bindingIds:[],stage:'Доставлено',label:protocol==='tcp'?'HTTP 200 · Учебный сайт доступен':'Echo reply · Обратный путь проверен'});
 return finish(true);
}
