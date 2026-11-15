export function deviceCamera(rect,viewport,world){
 if(!rect||viewport.w<=0||viewport.h<=0)return null;
 const h=Math.min(rect.h,Math.max(140,(rect.headH||72)+24));
 const zoom=Math.max(.65,Math.min(1.25,(viewport.w-80)/Math.max(1,rect.w),(viewport.h-80)/Math.max(1,h)));
 return {zoom,left:Math.max(0,Math.min(Math.max(0,world.w*zoom-viewport.w),(rect.x+rect.w/2)*zoom-viewport.w/2)),top:Math.max(0,Math.min(Math.max(0,world.h*zoom-viewport.h),(rect.y+h/2)*zoom-viewport.h/2))};
}
export function cameraFrame(from,to,fraction){const t=Math.max(0,Math.min(1,fraction)),ease=1-(1-t)**3;return Object.fromEntries(['zoom','left','top'].map(k=>[k,from[k]+(to[k]-from[k])*ease]))}
export function installFollowCamera(canvas){
 canvas.cancelCamera=function(){if(this.cameraFrameId!==undefined)cancelAnimationFrame(this.cameraFrameId);this.cameraFrameId=undefined;this.cameraEpoch=(this.cameraEpoch||0)+1};
 canvas.followTraffic=function(event){
  if(!event)return;const port=event.toPort||event.portIds?.at(-1),portOwner=this.g.ports.get(port)?.owner;
  const id=['service','runtime','namespace','service-rule'].includes(event.type)?this.visibleTraceNode(event.nodeId):event.type==='stop'?this.visibleTraceNode(event.nodeId):portOwner||this.visibleTraceNode(event.toNode||event.nodeId||event.fromNode);
  let focus=(event.kernelPathId&&this.g.kernelCards?.get(event.kernelPathId))||this.g.rects.get(id);
  if(focus&&event.kernelPathId&&event.kernelPhase!=='dnat'){const end=this.g.ports.get(event.kernelPhase==='reverse'?event.fromPort:event.toPort),r=end&&this.g.rects.get(end.owner);if(r){const x=Math.min(focus.x,r.x),y=Math.min(focus.y,r.y),w=Math.max(focus.x+focus.w,r.x+r.w)-x,h=Math.max(focus.y+focus.h,r.y+r.h)-y;focus={x,y,w,h,headH:h}}}
  const target=deviceCamera(focus,{w:this.viewport.clientWidth,h:this.viewport.clientHeight},{w:parseFloat(this.world.style.width),h:parseFloat(this.world.style.height)});if(!target)return;
  this.cancelCamera();const epoch=this.cameraEpoch,from={zoom:this.zoom,left:this.viewport.scrollLeft,top:this.viewport.scrollTop},start=performance.now();
  const tick=time=>{if(this.cameraEpoch!==epoch)return;const t=Math.min(1,(time-start)/320),c=cameraFrame(from,target,t);this.zoom=c.zoom;
   this.world.style.transform=`scale(${c.zoom})`;this.stage.style.width=Math.max(this.viewport.clientWidth,parseFloat(this.world.style.width)*c.zoom)+'px';this.stage.style.height=Math.max(this.viewport.clientHeight,parseFloat(this.world.style.height)*c.zoom)+'px';this.viewport.scrollLeft=c.left;this.viewport.scrollTop=c.top;document.getElementById('zoomtext').textContent=Math.round(c.zoom*100)+'%';if(this.packetCircle)this.packetCircle.setAttribute('r',6/c.zoom);
   if(t<1)this.cameraFrameId=requestAnimationFrame(tick);else{this.cameraFrameId=undefined;this.render();this.remember()}
  };this.cameraFrameId=requestAnimationFrame(tick);
 };
}
