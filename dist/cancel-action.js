export function cancelCanvasAction(canvas){
 const active=!!(canvas.pending||canvas.cableDrag||canvas.routeDrag||canvas.drag||canvas.lasso||canvas.pan);if(!active)return false;
 if(canvas.drag&&canvas.dragSnapshot){const positions=new Map(canvas.dragSnapshot.map(p=>[p.id,p]));for(const n of canvas.getState().nodes){const p=positions.get(n.id);if(p){n.x=p.x;n.y=p.y}}}
 if(canvas.lasso){canvas.selection=new Set(canvas.lasso.base);canvas.selectNodes?.([...canvas.selection])}
 if(canvas.pan){canvas.viewport.scrollLeft=canvas.pan.left;canvas.viewport.scrollTop=canvas.pan.top;canvas.viewport.classList.remove('panning')}
 for(const key of ['pending','pointer','cableDrag','routeDrag','routePreview','drag','dragSnapshot','lasso','pan'])canvas[key]=null;
 canvas.ignoreClickUntil=performance.now()+200;canvas.render();canvas.notify('Действие отменено');return true;
}
