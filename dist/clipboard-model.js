export function copyObjects(s,selection){
 const ids=new Set([...selection].filter(id=>s.nodes.some(n=>n.id===id)));if(!ids.size)return null;
 let count;do{count=ids.size;for(const n of s.nodes)if(ids.has(n.parent))ids.add(n.id)}while(count!==ids.size);
 const nodes=s.nodes.filter(n=>ids.has(n.id)),ports=new Set(nodes.flatMap(n=>n.interfaces.map(p=>p.id))),links=s.links.filter(l=>ports.has(l.a)&&ports.has(l.b));
 const keys=new Set([...links.map(l=>'link:'+l.id),...nodes.filter(n=>n.type==='bridge').flatMap(n=>(n.members||[]).filter(p=>ports.has(p)).map(p=>'binding:member:'+n.id+':'+p)),...nodes.filter(n=>n.services.http).flatMap(n=>['dnat','route'].map(phase=>'kernel:'+n.id+':'+phase))]);
 return structuredClone({infraLabClipboard:1,nodes,links,wireRoutes:(s.wireRoutes||[]).filter(r=>keys.has(r.id))});
}
export function pasteObjects(s,clip,allowed,targetParent=null,uid=()=>crypto.randomUUID()){
 if(clip?.infraLabClipboard!==1||!Array.isArray(clip.nodes)||!clip.nodes.length||clip.nodes.length>400||!Array.isArray(clip.links)||clip.links.length>2000)throw Error('В буфере нет объектов Infra Lab');
 const nodes=structuredClone(clip.nodes),links=structuredClone(clip.links),oldNodes=new Set(nodes.map(n=>n.id)),roots=nodes.filter(n=>!oldNodes.has(n.parent)),target=s.nodes.find(n=>n.id===targetParent),useTarget=target&&roots.every(n=>allowed[target.type]?.includes(n.type)),ids=new Map(),portIds=new Map(),wireIds=new Map();
 for(const n of nodes){ids.set(n.id,uid());if(!Array.isArray(n.interfaces))throw Error('Некорректный буфер объектов');for(const p of n.interfaces)portIds.set(p.id,uid())}
 for(const n of nodes){const oldId=n.id,root=roots.includes(n),oldParent=n.parent;n.id=ids.get(oldId);n.parent=ids.get(oldParent)||null;
  if(root){const parent=useTarget?target:s.nodes.find(p=>p.id===oldParent);if(parent&&allowed[parent.type]?.includes(n.type)){n.parent=parent.id;if(useTarget&&parent.id!==oldParent){n.x=32;n.y=100}else{n.x+=32;n.y+=32}}else if(allowed.root.includes(n.type)){n.parent=null;n.x+=32;n.y+=32}else throw Error('Выберите подходящий родительский объект для вставки');n.name+=' · копия'}
  n.interfaces.forEach(p=>p.id=portIds.get(p.id));if(n.clusterId)n.clusterId=ids.get(n.clusterId)||n.clusterId;if(n.members){for(const id of n.members)if(portIds.has(id))wireIds.set('binding:member:'+oldId+':'+id,'binding:member:'+n.id+':'+portIds.get(id));n.members=n.members.filter(id=>portIds.has(id)).map(id=>portIds.get(id))}
  for(const key of ['kubernetes','agent'])if(n.services?.[key]?.runtimeId)n.services[key].runtimeId=ids.get(n.services[key].runtimeId)||(s.nodes.some(a=>a.id===n.services[key].runtimeId)?n.services[key].runtimeId:'');
  if(n.services?.nodeport?.preferredPod)n.services.nodeport.preferredPod=ids.get(n.services.nodeport.preferredPod)||n.services.nodeport.preferredPod;
  if(n.services?.http){const original=n.services.http.publishHost;n.services.http.publishHost=ids.get(original)||(s.nodes.some(n=>n.id===original)?original:'');for(const phase of ['dnat','route'])wireIds.set('kernel:'+oldId+':'+phase,'kernel:'+n.id+':'+phase)}
 }
 for(const l of links){const old=l.id;l.id=uid();l.a=portIds.get(l.a);l.b=portIds.get(l.b);if(!l.a||!l.b)throw Error('Некорректные внутренние кабели буфера');wireIds.set('link:'+old,'link:'+l.id)}
 const wireRoutes=structuredClone(clip.wireRoutes||[]).filter(r=>wireIds.has(r.id)).map(r=>({...r,id:wireIds.get(r.id)}));
 return{nodes,links,wireRoutes,rootIds:roots.map(n=>n.id)};
}
