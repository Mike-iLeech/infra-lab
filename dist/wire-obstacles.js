import {cableObstacles,segmentHits} from './geometry.js';
import {publicationPaths} from './kernel-path.js';
export function routeHitsObstacles(points,obstacles){return points.slice(1).some((b,i)=>obstacles.some(r=>segmentHits(points[i],b,{x:r.x+.5,y:r.y+.5,w:Math.max(0,r.w-1),h:Math.max(0,r.h-1)})))}
export function routeNodeObstacles(canvas,source){
 let a=canvas.g.ports.get(source.dataset.start),b=canvas.g.ports.get(source.dataset.end);
 if(!a||!b){const appId=source.parentElement.dataset.kernelId,app=canvas.getState().nodes.find(n=>n.id===appId),host=app&&canvas.getState().nodes.find(n=>n.id===app.services.http.publishHost),p=host&&publicationPaths(canvas.getState(),host).find(p=>p.id===appId);a=p&&canvas.g.ports.get(p.ingress?.id);b=p&&canvas.g.ports.get(p.egress?.id)}
 if(!a||!b)return[];let result=cableObstacles(canvas.g,a,b);
 if(source.parentElement.classList.contains('bridge-forward')){const r=canvas.g.rects.get(a.owner);result=result.map(o=>o.x===r.x&&o.y===r.y?{...o,h:48}:o)}return result;
}
