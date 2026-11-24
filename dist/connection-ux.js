import {connect} from './model.js';

// Use the same validation as a real connection, with an isolated link collection.
// connect reads nodes and appends only to links; the displayed topology stays intact.
export function connectionCheck(state,source,target,options={}){
 try{connect({...state,links:[...state.links]},source,target,options);return{compatible:true,reason:''}}
 catch(error){return{compatible:false,reason:error.message}}
}

export function completeConnection(canvas,target){
 const source=canvas.pending;if(!source)return false;
 try{connect(canvas.getState(),source,target)}
 catch(error){canvas.pending=source;canvas.connectionError=error.message;canvas.notify(error.message);canvas.render();return false}
 canvas.pending=null;canvas.pointer=null;canvas.connectionError=null;canvas.commit();canvas.notify('Контакты соединены');return true;
}

export function installConnectionUX(canvas){
 if(!document.getElementById('connection-styles')){const link=document.createElement('link');link.id='connection-styles';link.rel='stylesheet';link.href=new URL('./connection.css',import.meta.url).href;document.head.append(link)}
 const banner=document.createElement('div');banner.className='connection-banner';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 const copy=document.createElement('div'),label=document.createElement('strong'),hint=document.createElement('small'),cancel=document.createElement('button');
 copy.append(label,hint);cancel.type='button';cancel.textContent='Отмена · Esc / ПКМ';cancel.addEventListener('click',()=>{const source=canvas.pending;canvas.cancelActiveAction();[...canvas.host.querySelectorAll('[data-port]')].find(el=>el.dataset.port===source)?.focus({preventScroll:true})});banner.append(copy,cancel);canvas.viewport.before(banner);
 canvas.updateConnectionUX=function(){
  const state=this.getState(),owner=state.nodes.find(n=>n.interfaces.some(p=>p.id===this.pending)),port=owner?.interfaces.find(p=>p.id===this.pending);
  if(this.pending&&!port){this.pending=null;this.pointer=null;this.connectionError=null}
  banner.hidden=!this.pending;banner.classList.toggle('connection-error',!!this.connectionError);
  if(port){const title=owner.name+' / '+port.name+' → выберите второй контакт',detail=this.connectionError||'Подсвеченные контакты совместимы · можно выбрать мышью или клавиатурой';if(label.textContent!==title)label.textContent=title;if(hint.textContent!==detail)hint.textContent=detail}
  for(const el of this.host.querySelectorAll('[data-port]')){
   if(!this.pending||el.dataset.port===this.pending)continue;
   const result=connectionCheck(state,this.pending,el.dataset.port);el.classList.add(result.compatible?'connection-compatible':'connection-incompatible');
   const reason=result.compatible?'Можно соединить с выбранным контактом':result.reason;el.dataset.connectionReason=reason;el.title+='\n'+reason;el.setAttribute('aria-description',reason);
  }
 };
 // Capture before the app's context menu: cancellation also works over a port or wire.
 canvas.viewport.addEventListener('contextmenu',e=>{if(!canvas.pending&&!canvas.cableDrag)return;e.preventDefault();e.stopImmediatePropagation();canvas.cancelActiveAction();const menu=document.getElementById('menu');if(menu)menu.hidden=true},true);
}
