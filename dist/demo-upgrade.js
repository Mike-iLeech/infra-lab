// Upgrade only the recognizable old demo edge, preserving user-added devices and ports.
export function upgradeDockerPath(s){
 if(s.demoRevision!==3)return false;
 let changed=false;
 for(const docker of s.nodes.filter(n=>n.type==='docker')){
  const host=s.nodes.find(n=>n.id===docker.parent),peer=host?.interfaces.find(p=>p.name==='docker0'&&p.ip==='172.18.0.1');if(!peer)continue;
  const bridge=s.nodes.find(n=>n.parent===docker.id&&n.type==='bridge'),app=s.nodes.find(n=>n.parent===docker.id&&n.type==='container'&&n.services.http?.publishHost===host.id);if(!bridge||!app)continue;
  const gatewayLink=s.links.find(l=>(l.a===peer.id||l.b===peer.id)&&bridge.interfaces.some(p=>p.id===l.a||p.id===l.b)),containerLink=s.links.find(l=>(l.a===app.interfaces[0]?.id||l.b===app.interfaces[0]?.id)&&bridge.interfaces.some(p=>p.id===l.a||p.id===l.b));if(!gatewayLink||!containerLink)continue;
  const gateway=bridge.interfaces.find(p=>p.id===gatewayLink.a||p.id===gatewayLink.b);Object.assign(gateway,{ip:peer.ip,prefix:peer.prefix,gateway:'',dns:'',mode:'manual',name:'br-app'});peer.ip='';peer.gateway='';peer.dns='';peer.mode='manual';peer.name='veth101 · хостовый конец';bridge.members=[...new Set([...(bridge.members||[]),peer.id])];s.links=s.links.filter(l=>l.id!==gatewayLink.id);Object.assign(containerLink,{a:peer.id,b:app.interfaces[0].id,medium:'virtual',length:0,kind:'veth'});changed=true;
 }
 if(changed){s.demoRevision=4;if(s.demoGuide)s.demoGuide[s.demoGuide.length-1]='Ubuntu: публикация :8080 → Linux-мост br-app (172.18.0.1) → veth-пара → eth0 контейнера :80. У Docker Engine нет промежуточного NIC.'}
 return changed;
}
