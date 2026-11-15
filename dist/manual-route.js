const clone=points=>points.map(({x,y})=>({x,y}));
const same=(a,b)=>a.x===b.x&&a.y===b.y;
export function cleanRoute(points){
 const out=[];for(const p of points){if(out.length&&same(out.at(-1),p))continue;while(out.length>=2){const a=out.at(-2),b=out.at(-1);if((a.x===b.x&&b.x===p.x&&(b.y-a.y)*(p.y-b.y)>=0)||(a.y===b.y&&b.y===p.y&&(b.x-a.x)*(p.x-b.x)>=0))out.pop();else break}out.push({x:p.x,y:p.y})}return out;
}
function repair(points,horizontal=true){const out=[points[0]];for(const p of points.slice(1)){const a=out.at(-1);if(a.x!==p.x&&a.y!==p.y)out.push(horizontal?{x:p.x,y:a.y}:{x:a.x,y:p.y});out.push(p);horizontal=!horizontal}return cleanRoute(out)}
export function resolveManualRoute(saved,start,end){
 let p=clone(saved.points),a=p[0],b=p.at(-1),dx=start.x-a.x,dy=start.y-a.y;
 if(Math.abs(dx-(end.x-b.x))<.001&&Math.abs(dy-(end.y-b.y))<.001)return p.map(p=>({x:p.x+dx,y:p.y+dy}));
 const firstH=p[0].y===p[1].y,lastH=p.at(-1).y===p.at(-2).y;p[0]={x:start.x,y:start.y};p[p.length-1]={x:end.x,y:end.y};
 if(p.length>2){if(firstH)p[1].y=start.y;else p[1].x=start.x;if(lastH)p.at(-2).y=end.y;else p.at(-2).x=end.x}
 return repair(p,firstH);
}
export function moveRouteSegment(points,index,value){
 const p=clone(points),a=p[index],b=p[index+1],h=a.y===b.y,key=h?'y':'x',other=h?'x':'y',aa={...a,[key]:value},bb={...b,[key]:value};
 const before=p[index-1],after=p[index+2],perpBefore=before&&before[other]===a[other],perpAfter=after&&after[other]===b[other];
 if(perpBefore&&perpAfter){p[index]=aa;p[index+1]=bb;return cleanRoute(p)}
 const sign=Math.sign(b[other]-a[other])||1,stub=Math.min(26,Math.abs(b[other]-a[other])/3),head=perpBefore?[]:[{...a,[other]:a[other]+sign*stub},{...aa,[other]:a[other]+sign*stub}],tail=perpAfter?[]:[{...bb,[other]:b[other]-sign*stub},{...b,[other]:b[other]-sign*stub}];
 return cleanRoute([...p.slice(0,index),...(perpBefore?[aa]:[a,...head]),...(perpAfter?[bb]:tail),...p.slice(index+1)]);
}
export function moveRouteBend(points,index,target){
 const p=clone(points),a=p[index-1],old=p[index],b=p[index+1],inH=a.y===old.y,outH=b.y===old.y;p[index]={x:target.x,y:target.y};
 if(index>1){if(inH)p[index-1].y=target.y;else p[index-1].x=target.x}
 if(index<p.length-2){if(outH)p[index+1].y=target.y;else p[index+1].x=target.x}
 let head=p.slice(0,index),tail=p.slice(index+1);
 if(index===1){const key=inH?'x':'y',sign=Math.sign(old[key]-a[key])||1,stub={...a,[key]:a[key]+sign*Math.min(26,Math.abs(old[key]-a[key])/2)},corner=inH?{x:stub.x,y:target.y}:{x:target.x,y:stub.y};head=[a,stub,corner]}
 if(index===p.length-2){const key=outH?'x':'y',sign=Math.sign(old[key]-b[key])||1,stub={...b,[key]:b[key]+sign*Math.min(26,Math.abs(old[key]-b[key])/2)},corner=outH?{x:stub.x,y:target.y}:{x:target.x,y:stub.y};tail=[corner,stub,b]}
 return repair([...head,p[index],...tail],p[0].y===p[1].y);
}
export function validateWireRoutes(routes){if(routes===undefined)return;if(!Array.isArray(routes)||routes.length>4000)throw Error('Некорректные ручные маршруты');const ids=new Set();for(const r of routes){if(!r||typeof r.id!=='string'||r.id.length>1024||!(/^[A-Za-z0-9_.:-]+$/).test(r.id)||ids.has(r.id)||!Array.isArray(r.points)||r.points.length<2||r.points.length>96||r.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e7||Math.abs(p.y)>1e7))throw Error('Некорректный ручной маршрут');for(let i=1;i<r.points.length;i++)if(r.points[i].x!==r.points[i-1].x&&r.points[i].y!==r.points[i-1].y)throw Error('Ручной маршрут должен быть ортогональным');ids.add(r.id)}}
export function insertRoutePoint(points,target){
 if(points.length>=96)throw Error('Максимум 96 точек маршрута');let best=null;
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],p=a.y===b.y?{x:Math.max(Math.min(a.x,b.x),Math.min(Math.max(a.x,b.x),target.x)),y:a.y}:{x:a.x,y:Math.max(Math.min(a.y,b.y),Math.min(Math.max(a.y,b.y),target.y))},distance=Math.hypot(p.x-target.x,p.y-target.y);if(!best||distance<best.distance)best={index:i,p,distance}}
 if(!best||points.some(p=>Math.hypot(p.x-best.p.x,p.y-best.p.y)<2))throw Error('В этом месте уже есть точка');const result=clone(points);result.splice(best.index+1,0,best.p);return result;
}
export function removeRoutePoint(points,index){
 if(index<=0||index>=points.length-1)throw Error('Концы закреплены на контактах');const p=clone(points),a=p[index-1],c=p[index],b=p[index+1];
 if(a.x===b.x||a.y===b.y){p.splice(index,1);return cleanRoute(p)}
 if(index>1){if(a.y===c.y)p[index-1].y=b.y;else p[index-1].x=b.x}
 else if(index<p.length-2){if(c.y===b.y)p[index+1].y=a.y;else p[index+1].x=a.x}
 else throw Error('Единственный изгиб нужен для прямых углов между контактами. Его можно переместить.');
 p.splice(index,1);return cleanRoute(p);
}
