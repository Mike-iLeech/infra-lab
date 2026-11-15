const OS=['ubuntu','debian','windows','proxmox'];
export const validControlEndpoint=value=>typeof value==='string'&&value.length<=256&&(/^(unix:\/\/\/\S+)$/.test(value)||/^(npipe:\/\/\.\/pipe\/\S+)$/.test(value));
export function controlHost(s,n){const seen=new Set();while(n&&!seen.has(n.id)){seen.add(n.id);if(OS.includes(n.type))return n;n=s.nodes.find(p=>p.id===n.parent)}return null}
export function runtimeCandidates(s,n){const host=controlHost(s,n);return host?s.nodes.filter(r=>r.type==='containerd'&&controlHost(s,r)?.id===host.id):[]}
export function nodeRuntime(s,node){return runtimeCandidates(s,node).find(r=>r.id===node.services.kubernetes?.runtimeId)||null}
export function provisionControl(s,create){
 for(const node of [...s.nodes].filter(n=>n.type==='k8s_node'&&!n.services.kubernetes?.controlModel)){
  const k=node.services.kubernetes??={role:'worker',runtime:'containerd',version:'',cni:'',podCIDR:''};k.controlModel=1;
  if(k.runtime!=='containerd')continue;
  let runtime=s.nodes.find(r=>r.type==='containerd'&&r.parent===node.id);
  if(!runtime){runtime=create('containerd',node.id,270,100,{state:s});runtime.services.daemon.endpoint=controlHost(s,node)?.type==='windows'?'npipe://./pipe/containerd-containerd':'unix:///run/containerd/containerd.sock';s.nodes.push(runtime)}
  k.runtimeId=runtime.id;
  if(!s.nodes.some(r=>r.type==='kubelet'&&r.parent===node.id))s.nodes.push(create('kubelet',node.id,24,100,{state:s}));
  for(const pod of s.nodes.filter(n=>n.parent===node.id&&n.type==='pod'))pod.y=Math.max(pod.y,240);
 }
}
export function controlConnections(s){const edges=[];
 for(const agent of s.nodes.filter(n=>n.type==='kubelet')){const group=s.nodes.find(n=>n.id===agent.parent&&n.type==='k8s_node'),runtime=group?nodeRuntime(s,group):runtimeCandidates(s,agent).find(r=>r.id===agent.services.agent?.runtimeId);if(runtime)edges.push({id:'control:'+agent.id+':'+runtime.id,source:agent,target:runtime,kind:'cri',label:'УПРАВЛЕНИЕ · CRI / '+(runtime.services.daemon.endpoint.startsWith('npipe:')?'named pipe':'Unix socket'),detail:'kubelet → containerd: запросы CRI (gRPC). Не Ethernet, не veth и не путь HTTP-пакета.'})}
 for(const container of s.nodes.filter(n=>n.type==='k8s_container')){const pod=s.nodes.find(p=>p.id===container.parent),node=s.nodes.find(p=>p.id===pod?.parent&&p.type==='k8s_node'),runtime=node&&nodeRuntime(s,node);if(runtime)edges.push({id:'control:'+runtime.id+':'+container.id,source:runtime,target:container,kind:'lifecycle',label:'УПРАВЛЕНИЕ · запуск / остановка',detail:'containerd управляет жизненным циклом контейнера через shim / OCI runtime (эти детали свёрнуты). Контейнер остаётся внутри Pod и использует его сетевой namespace.'})}
 return edges;
}
export function validateControl(s){for(const n of s.nodes){
 if(n.type==='kubelet')n.services.agent??={runtimeId:'',version:''};
 if(n.services.kubernetes?.controlModel!==undefined&&n.services.kubernetes.controlModel!==1)throw Error('Неизвестная версия модели управления runtime');
 if(['containerd','kubelet'].includes(n.type)&&n.interfaces.length)throw Error('У службы управления нет собственного NIC');
 if(n.type==='containerd'){const d=n.services.daemon;if(!d||!validControlEndpoint(d.endpoint))throw Error('containerd: endpoint должен быть Unix socket или named pipe')}
 const id=n.type==='k8s_node'?n.services.kubernetes?.runtimeId:n.type==='kubelet'?n.services.agent?.runtimeId:null;
 if(id&&!runtimeCandidates(s,n).some(r=>r.id===id))throw Error('Runtime управления должен быть containerd в той же ОС');
}}
export function cleanupControl(s){const ids=new Set(s.nodes.map(n=>n.id));for(const n of s.nodes){if(n.services.kubernetes?.runtimeId&&!ids.has(n.services.kubernetes.runtimeId))delete n.services.kubernetes.runtimeId;if(n.services.agent?.runtimeId&&!ids.has(n.services.agent.runtimeId))delete n.services.agent.runtimeId}}
