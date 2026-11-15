import {provisionControl} from './runtime-control.js';
import {empty,create,iface,connect} from './model.js';
import {settle} from './geometry.js';
export function buildClusterDemo(){
 const s=empty();s.demoRevision=5;
 const add=(type,parent,x,y,name)=>{const n=create(type,parent?.id||null,x,y,{state:s});n.name=name||n.name;s.nodes.push(n);return n};
 const config=(n,ip,gateway='',dns='')=>Object.assign(n.interfaces[0],{ip,prefix:24,gateway,dns,mode:'manual'});
 const wire=(a,b,medium='copper')=>connect(s,a.id,b.id,{medium,length:medium==='copper'?3:0,...(medium==='virtual'?{kind:'veth'}:{})});
 const client=add('client',null,40,100,'Клиент · браузер'),sw=add('switch',null,40,340,'SW-LAN · VLAN 10'),dns=add('dns',null,40,810,'DNS · site.lab');
 config(client,'10.10.0.100','','10.10.0.53');config(dns,'10.10.0.53');
 sw.interfaces.forEach(p=>Object.assign(p,{switchMode:'access',accessVlan:10}));wire(client.interfaces[0],sw.interfaces[0]);wire(dns.interfaces[0],sw.interfaces[1]);
 const pxCluster=add('proxmox_cluster',null,40,1080,'PVE-LAB · 3 хоста'),kubeCluster=add('k8s_cluster',null,40,1300,'K8S-LAB · 3 ВМ');
 const service=add('k8s_service',kubeCluster,24,100,'nginx-web · NodePort 30080');
 service.services.nodeport={namespace:'demo',selector:'app=nginx',port:80,targetPort:80,nodePort:30080,externalTrafficPolicy:'Local'};
 for(let i=0;i<3;i++){
  const worker=i>0,num=i+1,server=add('server',null,i===1?610:2350,i===2?730:100,`SRV-0${num} · Proxmox`),px=add('proxmox',server,24,120,`PVE-0${num}`);px.clusterId=pxCluster.id;
  const vmbr=add('bridge',px,24,100,'vmbr0 · LAN → ВМ'),vm=add('vm',px,370,100,`VM ${100+num} · ${worker?'worker-0'+i:'control-plane'}`);iface(vm,{state:s});vm.interfaces[0].name='net0 · virtio';vmbr.members=[server.interfaces[0].id,vm.interfaces[0].id];config(vmbr,`10.10.0.${11+i}`);
  const os=add('ubuntu',vm,24,120,`Ubuntu · ${worker?'worker-0'+i:'control-plane'}`);config(os,`10.10.0.${20+i}`);wire(vm.interfaces[0],os.interfaces[0],'adapter');
  const node=add('k8s_node',os,worker?500:24,100,worker?'worker-0'+i:'control-plane');node.clusterId=kubeCluster.id;Object.assign(node.services.kubernetes,{role:worker?'worker':'control-plane',runtime:'containerd',cni:'Linux bridge · учебная локальная CNI-сеть',podCIDR:`10.244.${i}.0/24`});
  wire(sw.interfaces[2+i],server.interfaces[0]);
  if(worker){
   const br=add('bridge',os,24,100,`cni0 · 10.244.${i}.0/24`);config(br,`10.244.${i}.1`);br.interfaces[0].name='cni0';
   const peer=iface(os,{state:s,preset:'veth'});peer.name='veth-nginx-'+i;br.members=[peer.id];
   const pod=add('pod',node,24,100,'nginx-'+i+' · demo / app=nginx');Object.assign(pod.services.pod,{namespace:'demo',labels:'app=nginx'});config(pod,`10.244.${i}.10`,`10.244.${i}.1`);
   const container=add('k8s_container',pod,24,120,'nginx · контейнер');container.services.runtime.image='nginx:alpine';container.services.runtime.command='nginx -g "daemon off;"';
   const app=add('application',container,24,100,'Nginx · учебный сайт');app.services.process.command='nginx -g "daemon off;"';wire(peer,pod.interfaces[0],'virtual');
  }
  if(i!==1)vm.collapsed=true;
 }
 dns.services.dns.records={'site.lab':'10.10.0.21','worker2.lab':'10.10.0.22'};
 s.demoRequest={target:'site.lab',protocol:'tcp',port:30080};
 s.demoGuide=['PVE-LAB: 3 физических хоста Proxmox; на каждом отдельная ВМ Kubernetes.','K8S-LAB: control-plane + worker-01 + worker-02. На каждом worker есть Pod Nginx.','Клиент 10.10.0.100 → DNS site.lab = 10.10.0.21 → SW-LAN VLAN 10.','Кабель → eno1 SRV-02 → vmbr0 → net0 VM 102 ≡ eth0 Ubuntu worker-01.','Service nginx-web: NodePort 30080, selector app=nginx, namespace demo, externalTrafficPolicy Local.','kube-proxy / ядро Ubuntu: DNAT 10.10.0.21:30080 → 10.244.1.10:80; IP клиента сохраняется.','Маршрутизация → cni0 (10.244.1.1) → veth-nginx-1 ↔ eth0 Pod → общий namespace Pod/контейнера → приложение Nginx.','HTTP 200 идёт назад; conntrack восстанавливает адрес источника 10.10.0.21:30080.','worker2.lab:30080 проверяет вторую реплику. Control-plane не принимает этот NodePort: Local требует локальный готовый Pod.','Штрихпунктир — членство в кластере; межузловой overlay, HA и scheduler здесь не эмулируются.'];
 provisionControl(s,create);settle(s);return s;
}
