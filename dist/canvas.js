import {controlWires} from './control-wires.js';
import {drawCniPaths} from './cni-canvas.js';
import {clusterWires,workloadFoot} from './workload-ui.js';
import {cancelCanvasAction} from './cancel-action.js';
import {installRouteEditor} from './route-editor.js';
import {installWireCrossings} from './wire-crossings.js';
import {attachedBridgePorts,localBridgePaths} from './bridge-view.js';
import {kernelSpace,kernelCardsHTML} from './kernel-path.js';
import {drawKernelPaths} from './kernel-canvas.js';
import {renderPort} from './port-render.js';
import {portView,portRow,lassoSelection,vlanColor} from './port-view.js';
import {lagStatus} from './lag.js';
import {moveNodes} from './geometry.js';
import { geometry, displayPorts, descendants, moveNode, zoomAt, routeCable, cableObstacles, pathData } from './geometry.js';
import { TYPES, bridgeTypes, connect } from './model.js';
import {bindings} from './bridges.js';
import {getProfile,MEDIA,physicalError} from './physical.js';
import {HELP} from './help.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class LabCanvas {
  constructor(options) {
    Object.assign(this,options);installWireCrossings(this);this.viewport=document.getElementById('viewport');this.world=document.getElementById('world');
    this.host=document.getElementById('nodes');this.svg=document.getElementById('wires');installRouteEditor(this);this.zoom=.75;this.pending=null;this.selectedLink=null;this.selection=new Set();this.vlanColors=localStorage.getItem('infra-lab-vlan-colors')==='true';
    this.stage=document.createElement('div');this.stage.id='stage';this.world.before(this.stage);this.stage.append(this.world);
    this.world.style.position='absolute';this.frame=null;this.drag=null;this.space=false;this.pointer=null;
    try{const c=JSON.parse(localStorage.getItem('infra-lab-camera'));if(c&&Number.isFinite(c.zoom)){this.zoom=Math.max(.2,Math.min(2,c.zoom));this.initialCamera=c}}catch{}
    this.host.addEventListener('click',e=>this.click(e));
    this.host.addEventListener('pointerdown',e=>{this.selectedWireRoute=null;this.down(e)});
    this.viewport.addEventListener('pointerdown',e=>{this.cancelCamera?.();if(e.button===0&&!this.space&&!e.target.closest('.node,[data-link],[data-binding],[data-route-key],[data-route-handle],button')){const r=this.world.getBoundingClientRect();this.selectedWireRoute=null;this.lasso={x:(e.clientX-r.left)/this.zoom,y:(e.clientY-r.top)/this.zoom,add:e.shiftKey||e.ctrlKey,base:[...this.selection]};e.preventDefault()}if(e.button===1||(e.button===0&&this.space)){this.pan={x:e.clientX,y:e.clientY,left:this.viewport.scrollLeft,top:this.viewport.scrollTop};this.viewport.classList.add('panning');e.preventDefault()}});
    window.addEventListener('pointermove',e=>this.move(e));window.addEventListener('pointerup',e=>this.up(e));
    window.addEventListener('blur',()=>{this.space=false;this.up()});
    this.viewport.addEventListener('wheel',e=>{e.preventDefault();if(e.shiftKey){this.viewport.scrollLeft+=e.deltaY;return}const r=this.viewport.getBoundingClientRect();this.setZoom(this.zoom*Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top})},{passive:false});
    this.viewport.addEventListener('scroll',()=>this.remember());
    document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if(e.code==='Space'){this.space=true;e.preventDefault()}if(e.key==='Escape'){if(this.cancelActiveAction())return;this.pending=null;this.pointer=null;this.lasso=null;this.selection.clear();this.selectNodes?.([]);this.render()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&document.activeElement?.closest('main')){e.preventDefault();this.selection=new Set(this.getState().nodes.filter(n=>!n.parent).map(n=>n.id));this.selectNodes?.([...this.selection]);this.render()}if(['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')this.fit();else this.setZoom(this.zoom*(e.key==='-'?1/1.2:1.2))}});
    document.addEventListener('keyup',e=>{if(e.code==='Space')this.space=false});
    this.svg.addEventListener('click',e=>{const member=e.target.closest('[data-binding]');if(member){e.stopPropagation();this.selectNode(member.dataset.binding);this.render();return}const l=e.target.closest('[data-link]');if(!l)return;e.stopPropagation();this.selectedLink=l.dataset.link;this.selectLink(this.selectedLink);this.render()});
    this.svg.addEventListener('pointerover',e=>{const l=e.target.closest('[data-link]');if(l)this.highlight(l.dataset.link)});
    this.svg.addEventListener('pointerout',()=>this.highlight(this.selectedLink));
  }
  cancelActiveAction(){return cancelCanvasAction(this)}
  remember(){try{localStorage.setItem('infra-lab-camera',JSON.stringify({zoom:this.zoom,left:this.viewport.scrollLeft,top:this.viewport.scrollTop}))}catch{}}
  setZoom(value,point={x:this.viewport.clientWidth/2,y:this.viewport.clientHeight/2}){
    this.cancelCamera?.();const c=zoomAt({zoom:this.zoom,left:this.viewport.scrollLeft,top:this.viewport.scrollTop},value,point);
    this.zoom=c.zoom;this.render();this.viewport.scrollLeft=c.left;this.viewport.scrollTop=c.top;this.remember();
  }
  fit(){this.cancelCamera?.();const g=geometry(this.getState()),roots=[...g.rects.values()].filter(r=>!r.ancestors.length);if(!roots.length){this.setZoom(1);return}
    const minX=Math.max(0,Math.min(...roots.map(r=>r.x))-40),minY=Math.max(0,Math.min(...roots.map(r=>r.y))-40);
    const maxX=Math.max(...roots.map(r=>r.x+r.w))+40,maxY=Math.max(...roots.map(r=>r.y+r.h))+40;
    this.zoom=Math.max(.2,Math.min(1.2,(this.viewport.clientWidth-20)/(maxX-minX),(this.viewport.clientHeight-20)/(maxY-minY)));
    this.render();this.viewport.scrollTo(minX*this.zoom,minY*this.zoom);this.remember();
  }
  focus(id){const r=geometry(this.getState()).rects.get(id);if(!r)return;this.setZoom(Math.max(.75,this.zoom));this.viewport.scrollTo({left:Math.max(0,r.x*this.zoom-40),top:Math.max(0,r.y*this.zoom-40),behavior:'smooth'})}
  render(){
    const state=this.getState();this.lag=lagStatus(state);this.g=geometry(state);const g=this.g;this.world.classList.toggle('vlan-colors',this.vlanColors);for(const id of this.selection)if(!state.nodes.some(n=>n.id===id))this.selection.delete(id);
    this.host.innerHTML='';
    const renderNode=(n,parent)=>{const d=g.sizes.get(n.id),el=document.createElement('div');el.className='node'+(this.selection.has(n.id)||this.getSelected()===n.id?' selected':'');el.dataset.id=n.id;el.dataset.type=n.type;
      Object.assign(el.style,{left:n.x+'px',top:n.y+'px',width:d.w+'px',height:d.h+'px'});
      const nested=state.nodes.filter(k=>k.parent===n.id),hidden=n.collapsed?descendants(state,n.id):new Set();
      const internal=n.collapsed?state.links.filter(l=>{const a=state.nodes.find(n=>n.interfaces.some(p=>p.id===l.a));const b=state.nodes.find(n=>n.interfaces.some(p=>p.id===l.b));return hidden.has(a?.id)&&hidden.has(b?.id)}).length:0;
      el.innerHTML=`<div class="nodehead"><span class="nodeicon">${TYPES[n.type][1]}</span><div class="nodename"><b>${esc(n.name)}</b><small>${esc(n.type==='k8s_node'?'kubelet / runtime · группа управления':TYPES[n.type][0])}${nested.length?' · '+nested.length+' внутри':''}</small></div><button class="collapse" aria-label="${n.collapsed?'Развернуть':'Свернуть'} ${esc(n.name)}" title="Свернуть / развернуть">${n.collapsed?'›':'⌄'}</button></div><div class="ports">${displayPorts(state,n).map(({p,node,proxy,member,attached,alias},i)=>this.portHTML(p,node,proxy,i,member,attached,alias)).join('')}</div><div class="nodefoot">${n.collapsed&&nested.length?`Скрыто ${hidden.size-1} объектов · ${internal} внутренних кабелей / ${(bindings(state).filter(l=>hidden.has(l.bridge)&&state.nodes.some(n=>hidden.has(n.id)&&n.interfaces.some(p=>p.id===l.a))).length)} привязок`:workloadFoot(state,n)?workloadFoot(state,n):['patch_panel','fiber_panel'].includes(n.type)?'Пары IN ↔ OUT · двунаправленная передача':n.type==='switch'?'L2 · access / trunk · VLAN':n.type==='bridge'?'L2 · настраиваемый мост':bridgeTypes.includes(n.type)?'Переход среды · прозрачный для VLAN':n.type==='rack'?'Размещение ≠ сетевое соединение':''}</div>`;
      if(!n.collapsed&&kernelSpace(state,n))el.insertAdjacentHTML('beforeend',kernelCardsHTML(state,n,48+Math.ceil(displayPorts(state,n).length/2)*portRow(n)+16));
      el.style.setProperty('--port-row',portRow(n)+'px');if(['patch_panel','fiber_panel'].includes(n.type)){const pairs=document.createElement('div');pairs.className='panel-pairs';pairs.innerHTML=n.interfaces.filter((p,i)=>i%2===0&&i+1<n.interfaces.length).map((p,i)=>'<span style="top:'+ (48+portRow(n)*(i+.5))+'px">⇄</span>').join('');el.append(pairs)}el.querySelector('.nodehead').title=HELP[n.type]?.text||'';const help=document.createElement('button');help.className='node-help';help.textContent='?';help.title='Что делает '+TYPES[n.type][0]+'?';help.setAttribute('aria-label','Пояснение: '+n.name);el.querySelector('.collapse').before(help);parent.append(el);if(!n.collapsed)nested.forEach(k=>renderNode(k,el));
    };
    state.nodes.filter(n=>!n.parent).forEach(n=>renderNode(n,this.host));
    const manualPoints=[...(state.wireRoutes||[]).flatMap(r=>r.points),...(this.routePreview?.points||[])];const maxX=Math.max(1200,...manualPoints.map(p=>p.x+80),...[...g.rects.values()].map(r=>r.x+r.w+180)),maxY=Math.max(1000,...manualPoints.map(p=>p.y+80),...[...g.rects.values()].map(r=>r.y+r.h+180));
    this.world.style.width=maxX+'px';this.world.style.height=maxY+'px';this.stage.style.width=Math.max(this.viewport.clientWidth,maxX*this.zoom)+'px';this.stage.style.height=Math.max(this.viewport.clientHeight,maxY*this.zoom)+'px';
    this.world.style.transform=`scale(${this.zoom})`;document.getElementById('zoomtext').textContent=Math.round(this.zoom*100)+'%';
    // Measure once in unscaled world coordinates. Scale-dependent rounding must not reroute wires.
    this.world.style.transform='none';
    const origin=this.world.getBoundingClientRect();
    for(const el of this.host.querySelectorAll('.node')){const r=el.getBoundingClientRect(),entry=g.rects.get(el.dataset.id);if(entry)Object.assign(entry,{x:r.left-origin.left,y:r.top-origin.top,w:r.width,h:r.height})}
    for(const el of this.host.querySelectorAll('[data-anchor]')){const r=el.querySelector('.port-dot').getBoundingClientRect(),entry=g.ports.get(el.dataset.anchor);if(entry)Object.assign(entry,{x:r.left+r.width/2-origin.left,y:r.top+r.height/2-origin.top})}
    for(const el of this.host.querySelectorAll('[data-alias]')){const p=g.ports.get(el.dataset.anchor);if(p)g.ports.set(el.dataset.alias,{...p,id:el.dataset.alias})}
    g.kernelCards=new Map();for(const el of this.host.querySelectorAll('[data-kernel-card]')){const r=el.getBoundingClientRect();g.kernelCards.set(el.dataset.kernelCard,{x:r.left-origin.left,y:r.top-origin.top,w:r.width,h:r.height})}
    this.world.style.transform=`scale(${this.zoom})`;this.drawWires();
    if(this.initialCamera){const c=this.initialCamera;this.initialCamera=null;this.viewport.scrollTo(Math.max(0,c.left||0),Math.max(0,c.top||0))}
  }
  portHTML(p,n,proxy,i,member=false,attached,alias){return renderPort(this,p,n,proxy,i,member,attached,alias)}
  drawWires(){
    const state=this.getState(),g=this.g;this.wireLanes=[];this.prepareRouteLanes();let html='',blocked=0;
    state.links.forEach((l,i)=>{const a=g.ports.get(l.a),b=g.ports.get(l.b);if(!a||!b||a.owner===b.owner&&(a.proxy||b.proxy))return;
      const ports=state.nodes.flatMap(n=>n.interfaces),fault=physicalError(ports.find(p=>p.id===l.a),ports.find(p=>p.id===l.b),l);const r=this.spacedRoute(a,b,cableObstacles(g,a,b),i,'link:'+l.id);this.wireLanes.push(r.points);blocked+=r.blocked?1:0;
      const label=id=>{const n=state.nodes.find(n=>n.interfaces.some(p=>p.id===id));return n.name+' / '+n.interfaces.find(p=>p.id===id).name};
      const desc=`${label(l.a)} ↔ ${label(l.b)} · ${MEDIA[l.medium]||MEDIA.model}${fault?' · '+fault:''}${r.blocked?' · мало места для кабеля: раздвиньте ноды':''}`;
      html+=`<g class="cable media-${l.medium||'model'} ${fault?'physical-fault':''} ${this.selectedLink===l.id?'selected':''} ${r.blocked?'crowded':''}" data-cable="${l.id}"><path class="wire-hit" data-link="${l.id}" d="${pathData(r.points)}"><title>${esc(desc)}</title></path><path class="wire" data-start="${l.a}" data-end="${l.b}" d="${pathData(r.points)}"/></g>`;
    });
    const moved=new Set(attachedBridgePorts(state).map(a=>a.p.id));
    bindings(state).filter(l=>!moved.has(l.a)).forEach((l,i)=>{const a=g.ports.get(l.a),b=g.ports.get(l.b);if(!a||!b||a.owner===b.owner&&(a.proxy||b.proxy))return;const r=this.spacedRoute(a,b,cableObstacles(g,a,b),i,'binding:'+l.id);this.wireLanes.push(r.points);blocked+=r.blocked?1:0;html+=`<g class="cable binding" data-binding-id="${l.id}"><path class="wire-hit" data-binding="${l.bridge}" d="${pathData(r.points)}"><title>Внутренняя привязка интерфейса к мосту · кабель сохраняется</title></path><path class="wire" data-start="${l.a}" data-end="${l.b}" d="${pathData(r.points)}"/></g>`});
    for(const p of localBridgePaths(state,g)){const d=pathData(p.points);html+=`<g class="cable bridge-forward" data-binding-id="${esc(p.alias)}"><path class="wire-hit" data-binding="${esc(p.bridge.id)}" d="${d}"><title>L2-коммутация внутри ${esc(p.bridge.name)}: интерфейс моста → ${esc(p.p.name)}. Это тот же интерфейс Ubuntu, показанный на мосту.</title></path><path class="wire" data-start="${esc(p.start.id)}" data-end="${esc(p.end.id)}" d="${d}"/><text class="bridge-forward-label" x="${p.label.x}" y="${p.label.y}" text-anchor="middle">L2 · мост ⇄ ${esc(p.p.name)}</text></g>`}
    if(this.pending&&this.pointer){const a=g.ports.get(this.pending);if(a)html+=`<path class="wire-preview" d="M${a.x},${a.y} H${a.x+a.side*28} V${this.pointer.y} H${this.pointer.x}"/>`}
    if(this.controlVisible!==false)html+=controlWires(state,g);html+=clusterWires(state,g);html+=drawKernelPaths(this);html+=drawCniPaths(this);this.svg.innerHTML=html;this.applyManualRoutes();this.decorateCrossings();this.updateVlanColors();this.highlight(this.selectedLink);this.applyTraffic?.();this.logicalView?.render();this.drawRouteHandles();
    const status=document.getElementById('link-status');if(status){status.textContent=blocked?`⚠ ${blocked} кабелей: раздвиньте ноды`:'Ортогональные кабели';status.classList.toggle('warning',!!blocked)}
  }
  highlight(id){this.svg.querySelectorAll('[data-cable]').forEach(el=>el.classList.toggle('highlighted',el.dataset.cable===id));const l=this.getState().links.find(l=>l.id===id);this.host.querySelectorAll('[data-port]').forEach(el=>el.classList.toggle('endpoint',!!l&&(l.a===el.dataset.port||l.b===el.dataset.port)));this.syncCrossings?.()}
  click(e){if(performance.now()<(this.ignoreClickUntil||0)){e.stopPropagation();return}const help=e.target.closest('.node-help');if(help){e.stopPropagation();this.selectNode(help.closest('.node').dataset.id);this.render();return}if(performance.now()<(this.ignoreClickUntil||0)){e.stopPropagation();return}const port=e.target.closest('[data-port]');if(port){e.stopPropagation();this.portClick(port.dataset.port);return}const collapse=e.target.closest('.collapse');if(collapse){e.stopPropagation();const n=this.getState().nodes.find(n=>n.id===collapse.closest('.node').dataset.id);n.collapsed=!n.collapsed;this.commit();return}}
  portClick(id){if(this.pending===id){this.pending=null;this.pointer=null;this.render();return}if(!this.pending){if(this.getState().links.some(l=>l.a===id||l.b===id)){const l=this.getState().links.find(l=>l.a===id||l.b===id);this.selectedLink=l.id;this.selectedWireRoute='link:'+l.id;this.cancelCamera?.();this.pauseTraffic?.();this.selectLink(l.id);this.render();return}this.pending=id;this.notify('Выберите второй контакт или тяните кабель мышью. Esc — отмена.');this.render();return}try{connect(this.getState(),this.pending,id);this.pending=null;this.pointer=null;this.commit();this.notify('Контакты соединены')}catch(err){this.notify(err.message);this.pending=null;this.pointer=null;this.render()}}
  down(e){if(e.button!==0||this.space)return;const port=e.target.closest('[data-port]');if(port){this.cableDrag={id:port.dataset.port,x:e.clientX,y:e.clientY,moved:false};return}const head=e.target.closest('.nodehead');if(!head||e.target.closest('button'))return;
    const id=head.closest('.node').dataset.id;if(e.shiftKey||e.ctrlKey||e.metaKey){if(this.selection.has(id))this.selection.delete(id);else this.selection.add(id);this.selectNodes?.([...this.selection]);this.ignoreClickUntil=performance.now()+150;this.render();return}if(!this.selection.has(id)){this.selection=new Set([id]);this.selectNode(id)}else if(this.selection.size>1)this.selectNodes?.([...this.selection]);this.dragSnapshot=this.getState().nodes.map(({id,x,y})=>({id,x,y}));this.drag={id,ids:[...this.selection],x:e.clientX,y:e.clientY,moved:false};e.preventDefault();
  }
  move(e){if(this.moveRoute(e))return;if(this.lasso){const r=this.world.getBoundingClientRect(),x=(e.clientX-r.left)/this.zoom,y=(e.clientY-r.top)/this.zoom,l=this.lasso;l.crossing=x<l.x;l.rect={x:Math.min(x,l.x),y:Math.min(y,l.y),w:Math.abs(x-l.x),h:Math.abs(y-l.y)};this.selection=new Set(lassoSelection(this.getState(),l.rect,this.g,l.base,l.add,l.crossing));this.renderLasso();this.host.querySelectorAll('.node').forEach(el=>el.classList.toggle('selected',this.selection.has(el.dataset.id)));return}if(this.pan){this.viewport.scrollLeft=this.pan.left+this.pan.x-e.clientX;this.viewport.scrollTop=this.pan.top+this.pan.y-e.clientY;return}
    if(this.cableDrag&&Math.hypot(e.clientX-this.cableDrag.x,e.clientY-this.cableDrag.y)>5){this.cableDrag.moved=true;this.pending=this.cableDrag.id}
    if(this.drag){const dx=(e.clientX-this.drag.x)/this.zoom,dy=(e.clientY-this.drag.y)/this.zoom;this.drag.moved||=Math.hypot(dx,dy)>1;moveNodes(this.getState(),this.drag.ids,dx,dy);this.drag.x=e.clientX;this.drag.y=e.clientY;this.schedule();return}
    if(this.pending){const wr=this.world.getBoundingClientRect();this.pointer={x:(e.clientX-wr.left)/this.zoom,y:(e.clientY-wr.top)/this.zoom};this.schedule()}
  }
  schedule(){if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.render()})}
  up(e){if(this.finishRoute(e))return;if(this.lasso){this.lasso=null;this.svg.querySelector('#lasso-box')?.remove();this.svg.querySelector('#lasso-mode')?.remove();this.selectNodes?.([...this.selection]);this.ignoreClickUntil=performance.now()+150;this.render()}if(this.pan){this.pan=null;this.viewport.classList.remove('panning');this.remember()}
    if(this.drag){const moved=this.drag.moved;this.drag=null;if(moved){this.ignoreClickUntil=performance.now()+150;this.commit()}}
    if(this.cableDrag){const d=this.cableDrag;this.cableDrag=null;if(d.moved&&e){const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-port]');if(target&&target.dataset.port!==d.id){this.portClick(target.dataset.port);this.ignoreClickUntil=performance.now()+100}else{this.pending=d.id;this.render()}}}
  }
  renderLasso(){let box=this.svg.querySelector('#lasso-box');if(!box){box=document.createElementNS('http://www.w3.org/2000/svg','rect');box.id='lasso-box';this.svg.append(box)}box.classList.toggle('crossing-lasso',this.lasso.crossing);let label=this.svg.querySelector('#lasso-mode');if(!label){label=document.createElementNS('http://www.w3.org/2000/svg','text');label.id='lasso-mode';this.svg.append(label)}const r=this.lasso.rect;label.setAttribute('x',r.x+8/this.zoom);label.setAttribute('y',r.y+16/this.zoom);label.setAttribute('font-size',11/this.zoom);label.textContent=this.lasso.crossing?'Пересечение · всё, чего касается рамка':'Окно · только целиком внутри';for(const [k,v] of Object.entries({x:r.x,y:r.y,width:r.w,height:r.h}))box.setAttribute(k,v)}
  setSelection(ids){this.selection=new Set(ids);this.render()}
  updateVlanColors(){const state=this.getState();let defs=this.svg.querySelector('defs');if(!defs){defs=document.createElementNS('http://www.w3.org/2000/svg','defs');this.svg.prepend(defs)}
   this.svg.querySelectorAll('[data-cable]').forEach(group=>{const link=state.links.find(l=>l.id===group.dataset.cable),path=group.querySelector('.wire');if(!link)return;const ends=state.nodes.flatMap(n=>n.interfaces.filter(p=>p.id===link.a||p.id===link.b).map(p=>({n,p}))),item=ends.find(x=>['switch','bridge'].includes(x.n.type));const vlans=item?portView(item.n,item.p).vlans:[];if(!this.vlanColors||!vlans.length){path.style.stroke='';return}if(vlans.length===1){path.style.stroke=vlanColor(vlans[0]);return}const gradient=document.createElementNS('http://www.w3.org/2000/svg','linearGradient'),id='vl-'+link.id;gradient.id=id;vlans.forEach((v,i)=>{for(const offset of [i/vlans.length,(i+1)/vlans.length]){const stop=document.createElementNS('http://www.w3.org/2000/svg','stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',vlanColor(v));gradient.append(stop)}});defs.append(gradient);path.style.stroke='url(#'+id+')'});
   const legend=document.getElementById('vlan-legend');if(legend){const values=[...new Set(state.nodes.filter(n=>['switch','bridge'].includes(n.type)).flatMap(n=>n.interfaces.flatMap(p=>portView(n,p).vlans)))].sort((a,b)=>a-b);legend.hidden=!this.vlanColors;legend.innerHTML=values.slice(0,32).map(v=>'<span style="--vlan-color:'+vlanColor(v)+'">VLAN '+v+'</span>').join('')}
  }

}
