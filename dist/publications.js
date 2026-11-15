import {applicationRunning,listeningApplication} from './workloads.js';
export function labels(value){return Object.fromEntries(String(value||'').split(/[,\n]/).map(x=>x.trim().split('=')).filter(a=>a.length===2&&a[0]&&a[1]))}
export function hostPublications(s,host){
 const result=s.nodes.filter(n=>n.type==='container'&&n.services?.http?.publishHost===host.id).map(app=>({id:app.id,app,service:app.services.http,kind:'docker'}));
 for(const node of s.nodes.filter(n=>n.type==='k8s_node'&&n.parent===host.id&&n.clusterId))for(const entity of s.nodes.filter(n=>n.type==='k8s_service'&&n.parent===node.clusterId)){
  const spec=entity.services.nodeport,policy=spec.externalTrafficPolicy||'Local',selector=labels(spec.selector),nodes=s.nodes.filter(n=>n.type==='k8s_node'&&n.clusterId===node.clusterId),pods=s.nodes.filter(n=>n.type==='pod'&&nodes.some(a=>a.id===n.parent)&&(policy==='Cluster'||n.parent===node.id)&&n.services.pod?.namespace===spec.namespace&&Object.keys(selector).length&&Object.entries(selector).every(([k,v])=>labels(n.services.pod.labels)[k]===v));
  const candidates=pods.map(pod=>{const a=listeningApplication(s,pod,spec.targetPort),reason=pod.services.pod.status==='stopped'?'Pod остановлен':pod.services.pod.ready===false?'Pod NotReady':!a?'нет слушающего приложения':!applicationRunning(s,a)?'приложение или контейнер остановлены':!pod.interfaces.some(p=>p.ip)?'нет IP Pod':'';return{pod,ready:!reason,reason}}),ready=candidates.filter(c=>c.ready),app=(ready.find(c=>c.pod.id===spec.preferredPod)||ready[0])?.pod;
  const backendNode=nodes.find(n=>n.id===app?.parent),backendHost=s.nodes.find(n=>n.id===backendNode?.parent);
  result.push({id:'svc:'+entity.id+':'+host.id,app,candidates,readyEndpoints:ready.map(c=>c.pod),skipped:candidates.filter(c=>!c.ready),policy,backendNode,backendHost,remote:!!app&&backendHost?.id!==host.id,service:{port:spec.targetPort,publishPort:spec.nodePort,publishHost:host.id},entity,node,kind:'kubernetes'});
 }
 return result;
}
