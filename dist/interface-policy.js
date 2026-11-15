import {PROFILES,PASSIVE} from './physical.js';
import {nextPassiveIdentity} from './interfaces.js';
import {interfaceOwner} from './ownership.js';
const FIXED={media_converter:['rj45','sfp_lx'],moca_adapter:['rj45','moca'],coax_repeater:['bnc','bnc']};
const blocked={containerd:'containerd — управляющий daemon. Собственного NIC нет; CRI использует локальный Unix socket / named pipe.',kubelet:'kubelet — агент ОС. Для CRI не нужен сетевой порт: связь с runtime идёт по локальному socket.',k8s_service:'Service задаёт правило пересылки. Сетевой интерфейс принадлежит Pod и ОС.',application:'Приложение использует сеть ОС или контейнера.',k8s_node:'Узел Kubernetes использует сеть своей ОС. Сеть Pod настраивается отдельно.',k8s_cluster:'Кластер — логическая группа, без собственного NIC.',proxmox_cluster:'Кластер — логическая группа, без собственного NIC.',k8s_container:'Контейнер Pod использует общий сетевой namespace и интерфейсы Pod.',rack:'У стойки нет сетевого интерфейса. Добавьте сервер или сетевое оборудование.',docker:'Docker Engine управляет сетью. Интерфейсы создаются у ОС, мостов и контейнеров.'};
const physicalProfiles=Object.keys(PROFILES).filter(k=>!['virtual','passive_rj45','passive_smf','passive_mmf','bnc','moca'].includes(k));
function nextName(prefix,start,interfaces){const names=new Set(interfaces.map(p=>p.name.split(' · ')[0]));let i=start;while(names.has(prefix+i))i++;return prefix+i}
export function interfaceAction(n){if(blocked[n.type])return{enabled:false,label:'＋ Интерфейс',reason:blocked[n.type]};if(n.type==='bridge'&&n.interfaces.length)return{enabled:true,label:'＋ Участник моста',attach:true,reason:'У Linux-моста один собственный интерфейс. Присоедините к нему существующий NIC или veth хоста.'};const max=FIXED[n.type]?.length||32;if(n.interfaces.length>=max)return{enabled:false,label:'＋ Интерфейс',reason:'Все разъёмы устройства уже созданы'};return{enabled:true,label:PASSIVE.includes(n.type)?'＋ Пара IN/OUT':n.type==='bridge'?'＋ Интерфейс моста':'＋ Интерфейс',reason:'Создать интерфейс соответствующего типа'}}
export function interfaceDefaults(n,{state,preset}={}){
 if(blocked[n.type])throw Error(blocked[n.type]);if(n.interfaces.length>=32)throw Error('Максимум 32 интерфейса');
 const fixed=FIXED[n.type];if(fixed){if(n.interfaces.length>=fixed.length)throw Error('Все разъёмы устройства уже созданы');const occupied=new Set(n.interfaces.map((p,i)=>p.hardwareSlot??(fixed[0]!==fixed[1]?fixed.indexOf(p.profile):i)));let slot=0;while(occupied.has(slot))slot++;if(slot>=fixed.length)throw Error('Все разъёмы устройства уже созданы');return{kind:'physical',profile:fixed[slot],hardwareSlot:slot,interfaceRole:'hardware',name:n.type==='media_converter'?(slot?'SFP':'RJ45'):n.type==='moca_adapter'?(slot?'MoCA':'Ethernet'):'BNC '+(slot+1)}}
 if(PASSIVE.includes(n.type)){const pair=nextPassiveIdentity(n),profile=n.type==='patch_panel'?'passive_rj45':n.interfaces.at(-1)?.profile==='passive_mmf'?'passive_mmf':'passive_smf';return{kind:'physical',profile,interfaceRole:'passive',...pair,name:'PORT '+pair.pairIndex+' '+(pair.pairSide==='out'?'OUT':'IN')}}
 if(n.type==='bridge'){if(n.interfaces.length)throw Error('У моста один собственный интерфейс. Используйте «Участники моста»');const host=state&&interfaceOwner(state,n),prefix=host?.type==='proxmox'?'vmbr':'br',others=state?[...(host?.interfaces||[]),...state.nodes.filter(b=>b.type==='bridge'&&b.id!==n.id&&interfaceOwner(state,b).id===host?.id).flatMap(b=>[...b.interfaces,{name:b.name.split(' · ')[0]}])]:[],requested=n.name.split(' · ')[0],useName=/^[a-zA-Z][\w.-]{0,14}$/.test(requested)&&!others.some(p=>p.name===requested);return{kind:'virtual',profile:'virtual',interfaceRole:'bridge-l3',mode:'manual',name:useName?requested:nextName(prefix,0,others)}}
 if(n.type==='pod')return{kind:'virtual',profile:'virtual',interfaceRole:'container-nic',name:nextName('eth',0,n.interfaces)};
 if(n.type==='vm')return{kind:'virtual',profile:'virtual',interfaceRole:'vm-nic',name:nextName('net',0,n.interfaces)};
 if(n.type==='container')return{kind:'virtual',profile:'virtual',interfaceRole:'container-nic',name:nextName('eth',0,n.interfaces)};
 const parent=state?.nodes.find(p=>p.id===n.parent);
 if(['ubuntu','debian','windows','proxmox'].includes(n.type)){
  if(preset==='veth'){if(n.type==='windows')throw Error('veth относится к Linux');return{kind:'virtual',profile:'virtual',interfaceRole:'veth',mode:'manual',name:nextName('veth',0,n.interfaces)}}
  const physical=n.type!=='proxmox'&&(parent?.type==='server'||!parent&&n.interfaces[0]?.kind==='physical');return{kind:physical?'physical':'virtual',profile:physical?'rj45':'virtual',interfaceRole:physical?'physical-nic':'guest-nic',name:n.type==='proxmox'?nextName('mgmt',0,n.interfaces):n.type==='windows'?nextName('Ethernet ',1,n.interfaces):nextName(physical?'eno':'eth',physical?1:0,n.interfaces)};
 }
 if(['dns','dhcp'].includes(n.type)){const virtual=!!n.parent;return{kind:virtual?'virtual':'physical',profile:virtual?'virtual':'rj45',interfaceRole:'service-nic',name:nextName('eth',0,n.interfaces)}}
 return{kind:'physical',profile:'rj45',interfaceRole:n.type==='switch'||n.type==='hub'?'hardware':'physical-nic',name:nextName(n.type==='server'?'eno':['switch','hub'].includes(n.type)?'port':'eth',n.type==='server'?1:0,n.interfaces)};
}
export function allowedInterfaceProfiles(n,p){
 if(PASSIVE.includes(n.type))return n.type==='patch_panel'?['passive_rj45']:['passive_smf','passive_mmf'];
 if(n.type==='media_converter'){const optical=p.hardwareSlot===1||p.profile?.startsWith('sfp');return optical?physicalProfiles.filter(k=>k.startsWith('sfp')&&!['sfp_t'].includes(k)):['rj45','rj45_10g']}
 if(n.type==='moca_adapter')return p.hardwareSlot===1||p.profile==='moca'?['moca']:['rj45','rj45_10g'];if(n.type==='coax_repeater')return['bnc'];
 if(['bridge','vm','container','proxmox','pod'].includes(n.type)||['veth','guest-nic','bridge-l3','vm-nic','container-nic'].includes(p.interfaceRole))return['virtual'];
 if(['ubuntu','debian','windows'].includes(n.type)&&!p.interfaceRole)return p.kind==='virtual'?['virtual']:physicalProfiles;
 if(['dns','dhcp'].includes(n.type)&&n.parent)return['virtual'];return physicalProfiles;
}
