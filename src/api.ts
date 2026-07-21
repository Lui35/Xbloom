export type MachineStatus = { connected:boolean; state:string; address?:string; weight?:number; temperature?:number; waterLevelOk?:boolean; waterVolume?:number; grinderRunning?:boolean; brewerRunning?:boolean; model?:string }
export type AIBeanProfile={brew_style:'hot'|'iced'|'cold';brewer:string;dose:number;target_water:number;country?:string;region?:string;producer?:string;species?:string;variety?:string;process?:string;altitude_masl?:number;roast_level?:string;roast_date?:string;tasting_notes?:string;desired_cup?:string}
export type AIRecipeResult={name:string;rationale:string;grind:number;rpm:60|70|80|90|100|110|120;dose:number;pours:Array<{volume:number;temp:number;flow:number;pauseAfter:number;pattern:'center'|'circular'|'spiral';agitationBefore:boolean;agitationAfter:boolean}>}
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
  generateRecipe:(bean:AIBeanProfile)=>call<AIRecipeResult>('/ai/generate-recipe',{method:'POST',body:JSON.stringify(bean)}),
  enhanceRecipe:(payload:{bean?:AIBeanProfile;recipe:unknown;feedback:string;rating?:number})=>call<AIRecipeResult>('/ai/enhance-recipe',{method:'POST',body:JSON.stringify(payload)}),
}
