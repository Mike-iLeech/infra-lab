// Representative hardware catalogue, not a vendor-specific compatibility matrix.
export const MEDIA={copper:'Медь · витая пара RJ45',mmf:'Оптика MMF · LC duplex',smf:'Оптика SMF · LC duplex',bidi:'Оптика SMF · LC simplex / BiDi',dac:'Медь · DAC twinax',coax50:'Коаксиал 50 Ω · BNC',coax75:'Коаксиал 75 Ω · F / MoCA',virtual:'Виртуальный линк',adapter:'Адаптер ВМ ↔ гостевая ОС',model:'Учебный кабель без проверки среды'};
const profile=(name,media,speeds,max,extra={})=>({name,media,speeds,max,...extra});
export const PROFILES={
 virtual:profile('Виртуальный NIC / veth','virtual',[1000,10000],Infinity),
 rj45:profile('RJ45 · 10/100/1000BASE-T','copper',[10,100,1000],100),
 rj45_10g:profile('RJ45 · 100/1000/10GBASE-T','copper',[100,1000,10000],100),
 sfp_empty:profile('SFP · пустой слот','none',[],0),
 sfp_sx:profile('SFP · 1000BASE-SX · MMF 850 нм','mmf',[1000],550,{tx:850,rx:850}),
 sfp_lx:profile('SFP · 1000BASE-LX · SMF 1310 нм','smf',[1000],10000,{tx:1310,rx:1310}),
 sfp_bxu:profile('SFP · BX10-U · TX1310 / RX1490','bidi',[1000],10000,{tx:1310,rx:1490}),
 sfp_bxd:profile('SFP · BX10-D · TX1490 / RX1310','bidi',[1000],10000,{tx:1490,rx:1310}),
 sfp_t:profile('SFP · 1000BASE-T · RJ45','copper',[1000],100),
 sfp10_sr:profile('SFP+ · 10GBASE-SR · MMF 850 нм','mmf',[10000],300,{tx:850,rx:850}),
 sfp10_lr:profile('SFP+ · 10GBASE-LR · SMF 1310 нм','smf',[10000],10000,{tx:1310,rx:1310}),
 sfp10_dac:profile('SFP+ · 10G DAC / twinax','dac',[10000],7),
 bnc:profile('BNC · 10BASE2 · 50 Ω','coax50',[10],185),
 moca:profile('F · MoCA 2.5 · 75 Ω','coax75',[2500],300),
 passive_rj45:profile('Пассивный RJ45 · патч-панель','copper',[],100,{passive:true}),
 passive_smf:profile('Пассивный LC duplex · SMF','smf',[],10000,{passive:true}),
 passive_mmf:profile('Пассивный LC duplex · MMF','mmf',[],550,{passive:true})
};
export const TRANSPARENT=['media_converter','moca_adapter','coax_repeater','hub','patch_panel','fiber_panel'];
export const PASSIVE=['patch_panel','fiber_panel'];
export const getProfile=p=>PROFILES[p.profile]||PROFILES[p.kind==='physical'?'rj45':'virtual'];
export function linkMedium(a,b){const p=getProfile(a),q=getProfile(b);return p.media===q.media?p.media:'model'}
export function physicalError(a,b,link={}){
  const p=getProfile(a),q=getProfile(b),medium=link.medium;
  // Old schemas keep their abstract cables; selecting a concrete medium enables validation.
  if(!medium||medium==='model')return '';
  if(medium==='adapter')return p.media==='virtual'&&q.media==='virtual'?'':'Гостевой адаптер требует два виртуальных интерфейса';
  if(p.media==='none'||q.media==='none')return 'SFP-слот пуст: установите модуль';
  if(p.media!==medium||q.media!==medium)return `Среда ${MEDIA[medium]||medium} несовместима с ${p.name} ↔ ${q.name}`;
  if(!p.passive&&!q.passive&&!p.speeds.some(v=>q.speeds.includes(v)))return 'Нет общей скорости интерфейсов';
  if(p.tx&&q.tx&&(p.tx!==q.rx||q.tx!==p.rx))return 'Несовместимые длины волн TX/RX; BiDi требует пару U ↔ D';
  const length=Number(link.length??3);if(!Number.isFinite(length)||length<0)return 'Некорректная длина кабеля';
  if(length>Math.min(p.max,q.max))return 'Длина кабеля превышает учебный предел выбранных модулей';
  return '';
}
export function physicalIssues(s){
  const all=s.nodes.flatMap(n=>n.interfaces.map(p=>({n,p}))),issues=[];
  for(const n of s.nodes.filter(n=>n.type==='media_converter'))if(n.interfaces.length===2&&n.interfaces.every(p=>s.links.some(l=>l.a===p.id||l.b===p.id))){const [a,b]=n.interfaces.map(getProfile);if(!a.speeds.some(v=>b.speeds.includes(v)))issues.push(`${n.name}: медиаконвертер без преобразования скорости требует общую скорость обоих портов`)}
  for(const l of s.links){const a=all.find(x=>x.p.id===l.a),b=all.find(x=>x.p.id===l.b);if(a&&b){const error=physicalError(a.p,b.p,l);if(error)issues.push(`${a.n.name}/${a.p.name} ↔ ${b.n.name}/${b.p.name}: ${error}`)}}
  // Follow paired passive panels end-to-end to check wavelengths, speed and total reach.
  const pairs=new Map();for(const n of s.nodes.filter(n=>PASSIVE.includes(n.type)))for(let i=0;i+1<n.interfaces.length;i+=2){pairs.set(n.interfaces[i].id,n.interfaces[i+1].id);pairs.set(n.interfaces[i+1].id,n.interfaces[i].id)}
  const checked=new Set();for(const entry of all.filter(x=>!getProfile(x.p).passive)){
    let id=entry.p.id,length=0,steps=0,lastLink=null;const seen=new Set();
    while(steps++<100){const l=s.links.find(l=>l.a===id||l.b===id);if(!l||!l.medium||l.medium==='model'||seen.has(l.id))break;seen.add(l.id);lastLink=l;length+=Number(l.length??3);const next=l.a===id?l.b:l.a,other=all.find(x=>x.p.id===next);if(!other)break;if(!getProfile(other.p).passive){const key=[entry.p.id,next].sort().join('|');if(!checked.has(key)&&seen.size>1){checked.add(key);const err=physicalError(entry.p,other.p,{...lastLink,length});if(err)issues.push(`Через пассивную панель: ${err}`)}break}id=pairs.get(next);if(!id)break}
  }
  return issues;
}
export function parseVlans(text){const vlans=[...new Set(String(text).split(',').map(x=>x.trim()).filter(Boolean).map(Number))];if(!vlans.length||vlans.length>128||vlans.some(v=>!Number.isInteger(v)||v<1||v>4094))throw Error('VLAN: 1–4094, список через запятую, до 128 значений');return vlans}
