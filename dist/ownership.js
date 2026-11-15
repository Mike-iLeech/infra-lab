import {networkRuntime} from './workloads.js';
// A Linux bridge lives in its host kernel even when visually grouped under Docker.
export function interfaceOwner(s,node){if(node.type!=='bridge')return node;let p=s.nodes.find(n=>n.id===node.parent);while(p){if(['ubuntu','debian','windows','proxmox'].includes(p.type))return p;p=s.nodes.find(n=>n.id===p.parent)}return node}
export function hostInterfaces(s,id){const n=networkRuntime(s,s.nodes.find(n=>n.id===id));return n?[...n.interfaces,...s.nodes.filter(a=>a.type==='bridge'&&a.id!==id&&interfaceOwner(s,a).id===n.id).flatMap(a=>a.interfaces)]:[]}
