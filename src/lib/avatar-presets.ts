export type AvatarPreset = { id:string; label:string; role:string; url:string };
type AvatarStyle={id:string;label:string;role:string;gender:"male"|"female";skin:string;hair:string;uniform:string;accent:string;background:string;badge:string;hat?:"chef"|"cap"|"none"};

function escapeXml(value:string){return value.replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]??c));}
function avatarSvg(style:AvatarStyle){
  const female=style.gender==="female";
  const hair=female
    ? `<path d="M42 65c0-31 16-48 39-48 25 0 40 19 40 50 0 21-7 38-17 48l-11-10c8-11 11-23 10-38-1-19-8-30-23-30-14 0-22 11-23 30-1 16 3 29 11 39l-12 10C47 104 42 87 42 65Z" fill="${style.hair}"/>`
    : `<path d="M47 58c2-27 16-40 35-40 22 0 35 16 35 41-10-10-21-15-36-15-13 0-24 5-34 14Z" fill="${style.hair}"/><path d="M52 48c8-20 25-27 43-21 8 3 15 9 19 16-19-7-42-7-62 5Z" fill="${style.hair}" opacity=".86"/>`;
  const hat=style.hat==="chef"?`<path d="M49 34c-1-13 10-23 22-19 7-12 25-10 28 4 13-1 21 11 15 22H50c-1-2-1-4-1-7Z" fill="#fff" stroke="#d9dee6" stroke-width="2"/><rect x="55" y="38" width="54" height="13" rx="5" fill="#fff" stroke="#d9dee6" stroke-width="2"/>`:style.hat==="cap"?`<path d="M49 42c5-17 21-25 35-25 17 0 29 9 34 25H49Z" fill="${style.uniform}"/><path d="M84 40h42c-3 7-13 10-25 10H84Z" fill="${style.uniform}"/>`:"";
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="${escapeXml(style.label)}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${style.background}"/><stop offset="1" stop-color="#ffffff"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity=".13"/></filter><linearGradient id="u" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${style.uniform}"/><stop offset="1" stop-color="${style.accent}"/></linearGradient></defs>
  <rect width="160" height="160" rx="30" fill="url(#bg)"/>
  <circle cx="80" cy="73" r="34" fill="${style.skin}" filter="url(#s)"/>
  ${hair}${hat}
  <ellipse cx="67" cy="72" rx="3" ry="3.5" fill="#24303a"/><ellipse cx="93" cy="72" rx="3" ry="3.5" fill="#24303a"/>
  <path d="M80 74c-2 5-2 8 1 10" fill="none" stroke="#b46d57" stroke-width="2" stroke-linecap="round"/>
  <path d="M68 88c8 7 17 7 25 0" fill="none" stroke="#8b4f46" stroke-width="2.6" stroke-linecap="round"/>
  ${!female?`<path d="M57 84c3 20 15 27 24 27 13 0 23-7 27-28-6 11-15 16-27 16-10 0-18-5-24-15Z" fill="${style.hair}" opacity=".72"/>`:""}
  <path d="M27 160c3-35 22-56 53-56 31 0 51 21 54 56H27Z" fill="url(#u)" filter="url(#s)"/>
  <path d="M60 108l20 20 21-20-7-7c-8 6-20 7-28 0l-6 7Z" fill="#fff" opacity=".94"/>
  <path d="M80 128v31" stroke="#ffffff" stroke-opacity=".5" stroke-width="2"/>
  <circle cx="124" cy="126" r="22" fill="#fff" stroke="#e6eaf0" stroke-width="2.5"/><text x="124" y="134" text-anchor="middle" font-size="24">${style.badge}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const STYLES:AvatarStyle[]=[
 {id:"owner-male",label:"Owner · Male",role:"owner",gender:"male",skin:"#d59a72",hair:"#251d19",uniform:"#1f2937",accent:"#111827",background:"#fff1e8",badge:"★",hat:"none"},
 {id:"owner-female",label:"Owner · Female",role:"owner",gender:"female",skin:"#d9a17b",hair:"#3a241c",uniform:"#27364a",accent:"#182334",background:"#fff1e8",badge:"★",hat:"none"},
 {id:"manager-male",label:"Manager · Male",role:"manager",gender:"male",skin:"#c98965",hair:"#2b211d",uniform:"#334155",accent:"#1e293b",background:"#eaf2ff",badge:"M",hat:"none"},
 {id:"manager-female",label:"Manager · Female",role:"manager",gender:"female",skin:"#e5b08a",hair:"#4b2e25",uniform:"#334155",accent:"#1e293b",background:"#eaf2ff",badge:"M",hat:"none"},
 {id:"chef-male",label:"Chef · Male",role:"chef",gender:"male",skin:"#e8b48d",hair:"#33251f",uniform:"#f8fafc",accent:"#d8dee7",background:"#fff4e5",badge:"C",hat:"chef"},
 {id:"chef-female",label:"Chef · Female",role:"chef",gender:"female",skin:"#c98764",hair:"#2d201d",uniform:"#f8fafc",accent:"#d8dee7",background:"#fff4e5",badge:"C",hat:"chef"},
 {id:"waiter-male",label:"Waiter · Male",role:"waiter",gender:"male",skin:"#d49b77",hair:"#1e1a18",uniform:"#161b22",accent:"#05070a",background:"#eef7f2",badge:"W",hat:"none"},
 {id:"waiter-female",label:"Waiter · Female",role:"waiter",gender:"female",skin:"#edbd99",hair:"#3c2820",uniform:"#161b22",accent:"#05070a",background:"#eef7f2",badge:"W",hat:"none"},
 {id:"cashier-male",label:"Cashier · Male",role:"cashier",gender:"male",skin:"#c78b69",hair:"#33241d",uniform:"#6d4cc2",accent:"#4c2aa0",background:"#f1ecff",badge:"$",hat:"none"},
 {id:"cashier-female",label:"Cashier · Female",role:"cashier",gender:"female",skin:"#dca47e",hair:"#4a2d25",uniform:"#6d4cc2",accent:"#4c2aa0",background:"#f1ecff",badge:"$",hat:"none"},
 {id:"inventory-male",label:"Inventory · Male",role:"inventory",gender:"male",skin:"#dfaa84",hair:"#493226",uniform:"#52606d",accent:"#36424c",background:"#edf2f7",badge:"I",hat:"cap"},
 {id:"inventory-female",label:"Inventory · Female",role:"inventory",gender:"female",skin:"#c58968",hair:"#2d211c",uniform:"#52606d",accent:"#36424c",background:"#edf2f7",badge:"I",hat:"cap"},
 {id:"purchasing-male",label:"Purchasing · Male",role:"purchasing",gender:"male",skin:"#b97b5b",hair:"#241b18",uniform:"#0f766e",accent:"#0b5e58",background:"#e5faf7",badge:"P",hat:"none"},
 {id:"purchasing-female",label:"Purchasing · Female",role:"purchasing",gender:"female",skin:"#e7b08a",hair:"#5b3527",uniform:"#0f766e",accent:"#0b5e58",background:"#e5faf7",badge:"P",hat:"none"},
 {id:"kitchen-male",label:"Kitchen · Male",role:"kitchen",gender:"male",skin:"#d2936e",hair:"#30221e",uniform:"#b45309",accent:"#7c3807",background:"#fff5dc",badge:"K",hat:"cap"},
 {id:"kitchen-female",label:"Kitchen · Female",role:"kitchen",gender:"female",skin:"#dca27d",hair:"#3a2720",uniform:"#b45309",accent:"#7c3807",background:"#fff5dc",badge:"K",hat:"cap"},
 {id:"staff-male",label:"Staff · Male",role:"staff",gender:"male",skin:"#e3aa84",hair:"#372720",uniform:"#2563eb",accent:"#1649b8",background:"#edf4ff",badge:"S",hat:"none"},
 {id:"staff-female",label:"Staff · Female",role:"staff",gender:"female",skin:"#c98a68",hair:"#2b1f1b",uniform:"#2563eb",accent:"#1649b8",background:"#edf4ff",badge:"S",hat:"none"},
];
export const AVATAR_PRESETS:AvatarPreset[]=STYLES.map(style=>({id:style.id,label:style.label,role:style.role,url:avatarSvg(style)}));
const LEGACY:Record<string,string>={"role-manager":"manager-male","role-chef":"chef-male","role-waiter":"waiter-male","role-cashier":"cashier-female","role-purchasing":"purchasing-female","role-inventory":"inventory-male","role-kitchen":"kitchen-male","role-staff":"staff-male"};
export function avatarPresetUrl(id:string|null|undefined){const resolved=id?LEGACY[id]??id:null;return AVATAR_PRESETS.find(p=>p.id===resolved)?.url??null;}
