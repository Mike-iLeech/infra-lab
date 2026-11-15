import {hostPublications} from './publications.js';
import {interfaceOwner} from './ownership.js';
export const KERNEL_CARD_HEIGHT=188;
export function publicationPaths(s,host){
 return hostPublications(s,host).map(publication=>{
  const app=publication.app;
  const service=publication.service,destination=app?.interfaces.find(p=>p.ip),members=new Set(s.nodes.filter(n=>n.type==='bridge').flatMap(n=>n.members||[]));
  const ingress=host.interfaces.find(p=>p.ip&&!members.has(p.id));
  const link=s.links.find(l=>destination&&(destination.id===l.a||destination.id===l.b));
  const peer=link&&(app?.interfaces.some(p=>p.id===link.a)?link.b:link.a);
  const backendHost=publication.backendHost||host,bridge=s.nodes.find(n=>n.type==='bridge'&&interfaceOwner(s,n).id===backendHost.id&&n.members?.includes(peer));
  const backendEgress=bridge?.interfaces.find(p=>p.ip===destination?.gateway)||bridge?.interfaces.find(p=>p.ip);
  const egress=publication.remote?ingress:backendEgress;
  return{...publication,host,app,service,ingress,destination,bridge,egress,backendEgress,ready:!!(ingress&&destination&&bridge&&egress)};
 });
}
export function kernelSpace(s,n){return n.collapsed?0:publicationPaths(s,n).length*KERNEL_CARD_HEIGHT}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function kernelCardsHTML(s,n,top){return publicationPaths(s,n).map((p,i)=>`<section class="kernel-card ${p.ready?'':'kernel-missing'}" data-kernel-card="${esc(p.id)}" style="top:${top+i*KERNEL_CARD_HEIGHT}px" aria-label="Публикация порта: ${esc(p.app?.name||p.entity?.name)}">
 <header><b>Ядро ${esc(n.name)} · внутренний путь L3</b><span>НЕ КАБЕЛЬ · ${p.kind==='kubernetes'?'kube-proxy / NodePort · '+p.policy:'правило Docker'}</span></header>
 <div class="kernel-flow"><div data-kernel-phase="ingress"><small>Вход через ${esc(p.ingress?.name||'интерфейс не задан')}</small><b>${esc(p.ingress?.ip||'нет IP')}:${esc(p.service.publishPort)}</b></div><em>→</em><div data-kernel-phase="dnat"><small>① ${p.kind==='kubernetes'?'NodePort → Pod · DNAT':'PREROUTING · DNAT'}</small><b>Назначение → ${esc(p.destination?.ip||'нет IP')}:${esc(p.service.port)}</b></div><em>→</em><div data-kernel-phase="route"><small>② Маршрутизация · FORWARD</small><b>${esc(p.remote?'eth0 → next-hop '+p.backendHost?.interfaces.find(a=>a.ip)?.ip:p.bridge?.name||'мост не подключён')} · ${esc(p.egress?.ip||'нет шлюза')}<span data-kernel-phase="snat">${p.policy==='Cluster'?'SNAT → '+esc(p.egress?.ip||'?'):'IP клиента сохранён'}</span></b></div></div>
 <p>${p.ready?p.remote?`Routed CNI → физическая LAN → ${esc(p.backendHost?.name)} → cni0 → veth → Pod. Это L3, не сквозной L2-мост.`:`Далее: мост L2 → хостовый veth ↔ eth0 ${p.kind==='kubernetes'?'Pod':'контейнера'}. Внешний eth0 не включён в этот мост.`:p.kind==='kubernetes'&&!p.app?'Нет готового endpoint для текущей политики Service.':'Нет полной bridge-связи: проверьте IP, veth и участников моста.'}</p>
 <p data-kernel-phase="reverse">← Ответ: conntrack ${p.policy==='Cluster'?'отменяет SNAT назначения и DNAT источника:':'выполняет обратную трансляцию источника'} ${esc(p.destination?.ip||'?')}:${esc(p.service.port)} → ${esc(p.ingress?.ip||'?')}:${esc(p.service.publishPort)}.</p>
 <span class="kernel-track-label">путь пакета внутри ядра</span></section>`).join('')}
