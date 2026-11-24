import {portConnection,compactProfile} from './port-status.js';
import {portView} from './port-view.js';
import {cableHTML} from './physical-ui.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function connectionInspector(state,l,lag){
 const ends=[l.a,l.b].map(id=>{const node=state.nodes.find(n=>n.interfaces.some(p=>p.id===id));return {node,p:node?.interfaces.find(p=>p.id===id)}});
 const health=ends.map(({p})=>portConnection(state,p,lag?.errors.get(p.id))).find(s=>s.error);
 const end=({node,p},i)=>`<section class="connection-endpoint"><small class="endpoint-tag">КОНЕЦ ${i?'B':'A'} · ${p.kind==='physical'?'ФИЗИЧЕСКИЙ':'ВИРТУАЛЬНЫЙ'}</small><b>${esc(node.name)}</b><p>${esc(portView(node,p).name)} · ${esc(p.ip||'без IP')}</p><small>${esc(compactProfile(p))}</small><button data-focus-end="${esc(node.id)}">⌖ Показать на схеме</button></section>`;
 return `<div class="eyebrow">СОЕДИНЕНИЕ</div><h2>Порт ↔ порт</h2><div class="connection-health ${health&&!['reserve'].includes(health.code)?'fault':''}">${health?'⚠ '+esc(health.description):'✓ Кабель подключён · ошибок среды на концах нет'}<br><small>Доступность приложения проверяется отдельно трассировкой.</small></div>${ends.map(end).join('')}${cableHTML(l)}<button id="delete-link" class="delete">Отключить кабель</button><div class="hint">Клик по линии — свойства. «Изменить прокладку» — ручки участков и изгибов. Пересечение линий не создаёт соединение.</div>`;
}
export function interfaceSummary(state,n,p,lag){
 const s=portConnection(state,p,lag?.errors.get(p.id));
 return `<summary class="interface-summary"><span class="summary-state ${s.code}"></span><span class="summary-name">${esc(portView(n,p).name)}</span><small class="summary-kind">${p.kind==='physical'?'ФИЗ':'ВИРТ'}</small></summary><div class="interface-status ${s.code}" title="${esc(s.description)}">${esc(s.label+' · '+(s.peer?s.node.name+' / '+s.peer.name:s.description))}${p.ip?'<br>'+esc(p.ip+'/'+p.prefix):''}</div>`;
}
