export const CLIENT_TCP_PORT=49152,CLIENT_DNS_PORT=53000;
export function packetTuple(protocol,sourceIP,sourcePort,destinationIP,destinationPort){return{protocol:protocol.toUpperCase(),source:{ip:sourceIP||null,port:protocol==='icmp'?null:sourcePort},destination:{ip:destinationIP||null,port:protocol==='icmp'?null:destinationPort}}}
export function reversePacket(p){return p?{protocol:p.protocol,source:{...p.destination},destination:{...p.source}}:null}
export function destinationNAT(p,ip,port){return{...p,source:{...p.source},destination:{ip,port}}}
export function sourceNAT(p,ip,port){return{...p,source:{ip,port},destination:{...p.destination}}}
const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const endpointText=e=>e?`${e.ip||'—'}${e.port===null||e.port===undefined?'':':'+e.port}`:'—';
export function packetSummary(p){return p?`${p.protocol} · ${endpointText(p.source)} → ${endpointText(p.destination)}`:'Пакет ещё не сформирован'}
export function packetCompactHTML(e){return e.nat?`<b>${esc(e.nat.kind)}</b><br><small>До</small> ${esc(packetSummary(e.nat.before))}<br><small>После</small> ${esc(packetSummary(e.nat.after))}`:esc(packetSummary(e.packet))}
export function packetDetailsHTML(e){
 if(!e.packet)return '<span>Пакет ещё не сформирован: сначала должна пройти настройка адресации и DNS.</span>';
 const row=(label,p,before)=>`<tr><th>${label}</th>${['source','destination'].map(side=>`<td>${['ip','port'].map(key=>`<span class="packet-field ${before&&p[side][key]!==before[side][key]?'packet-changed':''}">${key==='port'&&p[side][key]!==null?':':''}${esc(p[side][key])}</span>`).join('')}</td>`).join('')}</tr>`;
 return `<div class="packet-heading">${esc(e.packet.protocol)} · ${e.nat?esc(e.nat.kind):'заголовок пакета на этом шаге'}</div><table><thead><tr><th></th><th>Источник · IP / порт</th><th>Назначение · IP / порт</th></tr></thead><tbody>${e.nat?row('До NAT',e.nat.before)+row('После NAT',e.nat.after,e.nat.before):row('Сейчас',e.packet)}</tbody></table><small>${e.packet.protocol==='ICMP'?'У ICMP нет TCP/UDP-портов.':e.nat?'Цветом отмечены изменившиеся поля. Остальные поля сохранены.':'Порты клиента для демо: TCP 49152, DNS/UDP 53000.'}</small>`;
}
