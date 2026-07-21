export type MachineStatus = { connected:boolean; state:string; address?:string; weight?:number; temperature?:number; waterLevelOk?:boolean; waterVolume?:number; grinderRunning?:boolean; brewerRunning?:boolean; model?:string }
const API = 'http://127.0.0.1:8766/api'

async function call<T>(path:string, options?:RequestInit):Promise<T>{
  const response=await fetch(`${API}${path}`,{headers:{'Content-Type':'application/json'},...options})
  if(!response.ok){const body=await response.json().catch(()=>({detail:'Request failed'}));throw new Error(body.detail||'Request failed')}
  return response.json()
}
export const xbloomApi={
  health:()=>call<{ok:boolean}>('/health'),
  connect:()=>call<MachineStatus>('/connect',{method:'POST',body:'{}'}),
  disconnect:()=>call<MachineStatus>('/disconnect',{method:'POST'}),
  status:()=>call<MachineStatus>('/status'),
  stop:()=>call<{stopped:boolean}>('/stop',{method:'POST'}),
  brew:(recipe:unknown)=>call<{started:boolean}>('/brew',{method:'POST',body:JSON.stringify(recipe)}),
}
