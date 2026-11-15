export function commonRouteBounds(g,a,b){
 const ar=g.rects.get(a.owner),br=g.rects.get(b.owner);if(!ar||!br)return null;const bpath=new Set([...br.ancestors,br.id]);return[...ar.ancestors,ar.id].reverse().map(id=>g.rects.get(id)).find(r=>bpath.has(r.id))||null;
}
export function inwardPort(p,bounds){if(!bounds)return p;if(p.x<=bounds.x+6&&p.side<0)return{...p,side:1};if(p.x>=bounds.x+bounds.w-6&&p.side>0)return{...p,side:-1};return p}
export function insideRouteBounds(points,bounds){return !bounds||points.every((p,i)=>{const margin=i===0||i===points.length-1?-6:0;return p.x>=bounds.x+margin&&p.x<=bounds.x+bounds.w-margin&&p.y>=bounds.y+margin&&p.y<=bounds.y+bounds.h-margin})}
export function routeRecordBounds(canvas,source){
 const a=canvas.g.ports.get(source.dataset.start),b=canvas.g.ports.get(source.dataset.end);if(a&&b)return commonRouteBounds(canvas.g,a,b);
 const appId=source.parentElement.dataset.kernelId,app=canvas.getState().nodes.find(n=>n.id===appId);return app?canvas.g.rects.get(app.services.http.publishHost)||null:null;
}
