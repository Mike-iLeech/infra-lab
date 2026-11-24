import {getProfile,physicalError} from './physical.js';

export function portConnection(state,p,lagError=''){
 const link=state.links.find(l=>l.a===p.id||l.b===p.id);
 const peerId=link&&(link.a===p.id?link.b:link.a);
 const node=state.nodes.find(n=>n.interfaces.some(i=>i.id===peerId));
 const peer=node?.interfaces.find(i=>i.id===peerId);
 const fault=link&&peer?physicalError(p,peer,link):'';
 const error=fault||lagError;
 const reserve=!!link&&!fault&&!!lagError?.includes('ожидание');
 return {link,node,peer,error,code:!link?'free':reserve?'reserve':error?'fault':'connected',
  label:!link?'Свободен':reserve?'Резерв':error?'Ошибка':'Кабель',
  description:!link?'Нет внешнего кабеля':error||`Соединён с ${node?.name||'устройством'} / ${peer?.name||peerId}`};
}

export function compactProfile(p){
 const profile=getProfile(p);
 if(profile.media==='virtual')return 'Виртуальный NIC';
 if(p.profile==='sfp_empty')return 'SFP · без модуля';
 if(profile.passive)return profile.media==='copper'?'RJ45 · панель':`LC · ${profile.media.toUpperCase()}`;
 const speed=Math.max(...profile.speeds),rate=speed>=1000?`${speed/1000}G`:`${speed}M`;
 const connector=p.profile?.startsWith('sfp10')?'SFP+':p.profile?.startsWith('sfp')?'SFP':profile.media==='copper'?'RJ45':profile.media==='coax50'?'BNC':'F';
 return `${connector} · ${rate}${['mmf','smf','bidi','dac'].includes(profile.media)?' '+profile.media.toUpperCase():''}`;
}
