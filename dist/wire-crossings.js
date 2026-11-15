const numberPattern=/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi;
export function polylinePoints(d){const n=(d.match(numberPattern)||[]).map(Number),out=[];for(let i=0;i+1<n.length;i+=2)out.push({x:n[i],y:n[i+1]});return out}
// Crossing policy is geometric: horizontal wires jump over vertical ones, independent of zoom.
export function crossingPaths(routes,radius=7){
 const vertical=routes.flatMap((r,route)=>r.points.slice(1).flatMap((b,i)=>{const a=r.points[i];return a.x===b.x&&a.y!==b.y?[{route,x:a.x,min:Math.min(a.y,b.y),max:Math.max(a.y,b.y)}]:[]}));
 return routes.map((r,route)=>{const hops=[];let d=r.points.length?`M${r.points[0].x},${r.points[0].y}`:'';
  for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i];
   if(a.y===b.y&&a.x!==b.x){const up=r.bounds?a.y-r.bounds.y-2:Infinity,down=r.bounds?r.bounds.y+r.bounds.h-a.y-2:Infinity,bulgeDown=up<radius&&down>up,riseLimit=Math.max(0,Math.min(radius,bulgeDown?down:up));const sign=Math.sign(b.x-a.x),min=Math.min(a.x,b.x),max=Math.max(a.x,b.x),centres=[...new Set(vertical.filter(v=>v.route!==route&&v.x>min+2&&v.x<max-2&&a.y>=v.min&&a.y<=v.max).map(v=>v.x))].sort((x,y)=>x-y),clusters=[];
    for(const x of centres){const reach=Math.min(riseLimit,x-min-1,max-x-1),last=clusters.at(-1);if(last&&x-reach<=last.end+2){last.end=x+reach;last.rise=Math.max(last.rise,reach)}else clusters.push({start:x-reach,end:x+reach,rise:reach})}
    if(sign<0)clusters.reverse();
    for(const c of clusters){const start=sign>0?c.start:c.end,end=sign>0?c.end:c.start,rx=(c.end-c.start)/2,arc=`A${rx},${c.rise} 0 0 ${(sign>0)!==bulgeDown?1:0} ${end},${a.y}`;d+=` L${start},${a.y} ${arc}`;hops.push(`M${start},${a.y} ${arc}`)}
   }d+=` L${b.x},${b.y}`;
  }return{...r,d,hops};
 });
}
export function installWireCrossings(canvas){
 canvas.decorateCrossings=function(){const paths=[...this.svg.querySelectorAll('.cable > .wire,.kernel-wire > .kernel-line')],routes=paths.map((source,i)=>({source,id:i,points:polylinePoints(source.getAttribute('d')),bounds:this.routeRecords?.get(source.parentElement.dataset.routeKey)?.bounds})),ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'g');overlay.classList.add('wire-crossovers');this.crossingOverlays=[];
  for(const r of crossingPaths(routes,14)){r.source.dataset.polyline=JSON.stringify(r.points);r.source.setAttribute('d',r.d);r.source.parentElement.querySelector('.wire-hit')?.setAttribute('d',r.d);
   for(const d of r.hops){const group=document.createElementNS(ns,'g'),halo=document.createElementNS(ns,'path'),over=document.createElementNS(ns,'path');halo.setAttribute('d',d);halo.classList.add('wire-hop-halo');over.setAttribute('d',d);over.classList.add('wire-hop-over');group.append(halo,over);overlay.append(group);this.crossingOverlays.push({source:r.source,group,over})}
  }this.svg.append(overlay);this.syncCrossings();
 };
 canvas.syncCrossings=function(){for(const {source,group,over} of this.crossingOverlays||[]){const style=getComputedStyle(source);over.style.stroke=style.stroke;over.style.strokeWidth=style.strokeWidth;over.style.opacity=style.opacity;group.style.opacity=getComputedStyle(source.parentElement).opacity}};
}
