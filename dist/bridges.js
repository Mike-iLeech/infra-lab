// Internal L2 membership is separate from the one external cable on a NIC.
export const memberId=(bridge,port)=>`member:${bridge}:${port}`;
export function bridgeCandidates(s,b){
  let host=s.nodes.find(n=>n.id===b.parent);
  if(host?.type==='docker')host=s.nodes.find(n=>n.id===host.parent);
  if(!host)return[];
  const ids=new Set([host.id]);
  let count;do{count=ids.size;s.nodes.filter(n=>ids.has(n.parent)).forEach(n=>ids.add(n.id))}while(count!==ids.size);
  const parent=s.nodes.find(n=>n.id===host.parent);
  if(parent&&['server','vm'].includes(parent.type))ids.add(parent.id);
  return s.nodes.filter(n=>ids.has(n.id)&&n.id!==b.id&&!['bridge','switch','rack'].includes(n.type))
    .flatMap(node=>node.interfaces.map(p=>({node,p})));
}
export function bindings(s){return s.nodes.filter(n=>n.type==='bridge').flatMap(n=>(n.members||[]).map(id=>({id:memberId(n.id,id),a:id,b:memberId(n.id,id),bridge:n.id,internal:true})))}
export function migrateDocker(s,create){
  if(s.schemaVersion===2)return s;
  if(s.schemaVersion!==undefined)throw Error('Неизвестная версия сетевой модели');
  for(const n of [...s.nodes])if(n.type==='docker'){
    if(n.interfaces.length){const b=create('bridge',n.id,24,100);b.name='br-app · сеть контейнеров';b.interfaces=n.interfaces;b.members=[];s.nodes.push(b);n.interfaces=[]}
    if(['Docker bridge','Docker · br-app'].includes(n.name))n.name='Docker Engine';
  }
  s.schemaVersion=2;return s;
}
