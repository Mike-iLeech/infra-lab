import {validateCni} from './cni.js';
// Runtime containment and cluster membership are separate from network connectivity.
export const clusterType=n=>n.type==='proxmox'?'proxmox_cluster':n.type==='k8s_node'?'k8s_cluster':null;
export function networkRuntime(s,n){
 const seen=new Set();while(n&&!seen.has(n.id)){seen.add(n.id);if(n.type==='application'||n.type==='k8s_container')n=s.nodes.find(p=>p.id===n.parent);else return n}return null;
}
export function applications(s,runtime){return s.nodes.filter(n=>n.type==='application'&&networkRuntime(s,n)?.id===runtime.id)}
export function listeningApplication(s,runtime,port){return applications(s,runtime).find(n=>Number(n.services.http?.port)===Number(port))||(!runtime.applicationModel&&runtime.services.http&&Number(runtime.services.http.port)===Number(port)?runtime:null)}
export function applicationRunning(s,app){let n=app;const seen=new Set();while(n&&!seen.has(n.id)){seen.add(n.id);if(n.services.runtime?.status==='stopped'||n.services.pod?.status==='stopped'||n.services.http?.enabled===false)return false;n=s.nodes.find(a=>a.id===n.parent)}return true}
export function migrateApplications(s){
 for(const n of [...s.nodes])if(n.type==='container'&&!n.applicationModel){
  n.applicationModel=true;n.services.runtime??={image:'nginx:alpine',status:'running',restart:'unless-stopped',command:'',environment:'',volumes:'',cpu:'1',memory:'256MiB',network:'bridge'};
  if(n.services.http){let id='application:'+n.id;while(s.nodes.some(a=>a.id===id))id+='-';s.nodes.push({id,type:'application',parent:n.id,x:24,y:110,w:280,h:150,name:n.name,collapsed:false,interfaces:[],services:{http:{port:n.services.http.port,enabled:true},process:{command:'nginx -g daemon off;'}},rules:{blockICMP:false,blockedPorts:[]}});n.name='Docker контейнер · '+n.name}
 }
}
export function validateWorkloads(s){
 for(const n of s.nodes){
  validateCni(n.services.cni);if(n.services.pod?.ready!==undefined&&typeof n.services.pod.ready!=='boolean')throw Error('Готовность Pod должна быть boolean');
  if(n.type==='k8s_node'){n.services.kubernetes??={role:'worker',runtime:'containerd',version:'',cni:'',podCIDR:''};if(!['worker','control-plane'].includes(n.services.kubernetes.role))throw Error('Неизвестная роль Kubernetes');if(s.nodes.find(p=>p.id===n.parent)?.type==='windows'&&n.services.kubernetes.role==='control-plane')throw Error('Control plane Kubernetes требует Linux')}
  if(n.type==='k8s_service'){const p=n.services.nodeport;if(!p||!['Local','Cluster'].includes(p.externalTrafficPolicy)||!Number.isInteger(p.nodePort)||p.nodePort<30000||p.nodePort>32767||![p.port,p.targetPort].every(v=>Number.isInteger(v)&&v>0&&v<65536)||typeof p.selector!=='string'||typeof p.namespace!=='string')throw Error('Service: NodePort 30000–32767, TCP-порты 1–65535, policy Local/Cluster')}
  if(n.type==='pod')n.services.pod??={namespace:'default',status:'running',labels:''};
  if(n.type==='application'){n.services.http??={port:80,enabled:true};n.services.process??={command:''}}
  if(n.clusterId){const c=s.nodes.find(a=>a.id===n.clusterId);if(!c||c.type!==clusterType(n))throw Error('Недопустимое членство в кластере')}
  if(['application','k8s_node','k8s_cluster','proxmox_cluster','k8s_container','k8s_service'].includes(n.type)&&n.interfaces.length)throw Error('У этой сущности нет собственного сетевого интерфейса');
  const h=n.services.http;if(h){for(const k of ['port','publishPort'])if(h[k]!==undefined&&(!Number.isInteger(h[k])||h[k]<1||h[k]>65535))throw Error('Порт приложения вне диапазона 1–65535');if(h.publishHost&&!s.nodes.some(a=>a.id===h.publishHost&&['ubuntu','debian','windows'].includes(a.type)))throw Error('Хост публикации не найден')}
  if(n.services.runtime?.status&&!['running','stopped'].includes(n.services.runtime.status))throw Error('Неизвестное состояние среды');
 }
}
export function workloadIssues(s){const ports=new Map(),issues=[];for(const n of s.nodes.filter(n=>n.type==='application'&&applicationRunning(s,n))){const host=networkRuntime(s,n),port=n.services.http?.port,key=host?.id+':'+port;if(ports.has(key))issues.push(n.name+': TCP/'+port+' уже занят приложением '+ports.get(key)+' в общем сетевом namespace');else ports.set(key,n.name)}return issues}
export function clusterConnections(s){return s.nodes.filter(n=>n.clusterId).map(n=>({member:n,cluster:s.nodes.find(c=>c.id===n.clusterId&&c.type===clusterType(n))})).filter(e=>e.cluster)}
export function cleanupWorkloads(s){const ids=new Set(s.nodes.map(n=>n.id));for(const n of s.nodes){if(n.clusterId&&!ids.has(n.clusterId))delete n.clusterId;if(n.services.nodeport?.preferredPod&&!ids.has(n.services.nodeport.preferredPod))n.services.nodeport.preferredPod=''}}
