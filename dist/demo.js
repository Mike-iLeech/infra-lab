import {migrateApplications} from './workloads.js';
import {empty,create,iface,connect} from './model.js';
export function buildDemo(){
 const s=empty();s.demoRevision=4;
 const add=(type,parent,x,y,name)=>{const n=create(type,parent?.id||null,x,y);n.name=name||n.name;s.nodes.push(n);return n};
 const rack=add('rack',null,520,100,'Стойка A · виртуализация'),server=add('server',rack,24,100,'SRV-01 · физический сервер');
 server.interfaces[0].name='eno1';server.interfaces[0].mode='manual';
 const px=add('proxmox',server,24,130,'Proxmox VE'),vmbr=add('bridge',px,24,100,'vmbr0 · мост Proxmox');vmbr.interfaces=vmbr.interfaces.slice(0,2);
 const vm=add('vm',px,360,100,'VM 101 · виртуальный NIC');iface(vm);vm.interfaces[0].name='net0 · virtio';vm.interfaces[0].mode='manual';
 vmbr.members=[server.interfaces[0].id,vm.interfaces[0].id];
 const os=add('ubuntu',vm,24,120,'Ubuntu · web-host'),dk=add('docker',os,24,120,'Docker Engine');
 iface(os);os.interfaces[1].name='veth101 · хостовый конец';
 const br=add('bridge',dk,24,100,'br-app · сеть контейнеров');br.interfaces=br.interfaces.slice(0,1);br.interfaces[0].name='br-app';br.members=[os.interfaces[1].id];
 const app=add('container',dk,360,100,'Nginx · учебный сайт');
 const sw=add('switch',null,40,270,'SW-01 · клиентский'),sw2=add('switch',null,40,540,'SW-02 · серверный');
 const panel=add('fiber_panel',null,40,810,'ODF · оптическая панель'),client=add('client',null,40,70,'Ноутбук ученика');
 const dhcp=add('dhcp',null,1840,70),dns=add('dns',null,1840,300),router=add('router',null,1840,530,'R1 · шлюз LAN'),fw=add('firewall',null,1840,760,'FW-01 · периметр');
 const config=(n,i,ip,gateway='',dns='')=>Object.assign(n.interfaces[i],{ip,prefix:24,gateway,dns,mode:'manual'});
 config(client,0,'10.10.0.100','10.10.0.1','10.10.0.53');client.interfaces[0].mode='auto';
 config(os,0,'10.10.0.10','10.10.0.1','10.10.0.53');config(os,1,'');config(br,0,'172.18.0.1');config(app,0,'172.18.0.2','172.18.0.1');
 config(dhcp,0,'10.10.0.2');config(dns,0,'10.10.0.53');config(router,0,'10.10.0.1');config(router,1,'10.20.0.1');config(fw,0,'10.20.0.2','10.20.0.1');config(fw,1,'10.30.0.1');
 app.services.http.publishHost=os.id;
 for(const p of [...sw.interfaces,...sw2.interfaces]){p.switchMode='access';p.accessVlan=10}
 for(const p of [sw.interfaces[1],sw2.interfaces[0]])Object.assign(p,{profile:'sfp10_lr',switchMode:'trunk',nativeVlan:1,allowedVlans:[1,10,20]});
 const wire=(a,i,b,j,medium='copper',length=3)=>{connect(s,a.interfaces[i].id,b.interfaces[j].id,{medium,length})};
 wire(client,0,sw,0);wire(sw,1,panel,0,'smf',50);wire(panel,1,sw2,0,'smf',50);
 wire(sw2,1,server,0);wire(sw2,2,dhcp,0);wire(sw2,3,dns,0);wire(sw2,4,router,0);wire(router,1,fw,0);
 wire(vm,0,os,0,'adapter',0);connect(s,os.interfaces[1].id,app.interfaces[0].id,{medium:'virtual',length:0,kind:'veth'});
 s.demoGuide=['Клиент: access VLAN 10 → SW-01','Оптический trunk VLAN 10/20: SFP+ LR → ODF → SW-02','SW-02 access 10 → физический eno1 сервера','vmbr0 объединяет eno1 и virtio net0 ВМ','net0 представлен в Ubuntu как eth0 (10.10.0.10)','Ubuntu: публикация :8080 → мост br-app (172.18.0.1) → veth-пара → eth0 контейнера :80. Docker Engine управляет сетью, но не является промежуточным NIC.'];
 delete app.applicationModel;migrateApplications(s);return s;
}
