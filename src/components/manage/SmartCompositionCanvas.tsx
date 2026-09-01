import { Camera, Move } from "lucide-react";
import type { MenuTheme } from "@/lib/menu-theme";

export type CompositionElement = { id:string; type:string; x:number; y:number; w:number; h:number; rotation?:number; opacity?:number; text?:string; image?:string; color?:string; fontSize?:number; fontFamily?:string; fontWeight?:number; letterSpacing?:number; lineHeight?:number; align?:"left"|"center"|"right"; shape?:"square"|"rounded"|"circle"|"organic"; z?:number; animation?:string };

type Props={theme:MenuTheme;composition?:{concept?:string;artDirection?:string;background?:{color?:string;texture?:string};elements?:CompositionElement[]};selectedId?:string;onSelect:(id:string)=>void};

export function SmartCompositionCanvas({theme,composition,selectedId,onSelect}:Props){
 const elements=[...(composition?.elements??[])].sort((a,b)=>(a.z??0)-(b.z??0));
 return <div className="mx-auto w-full max-w-[960px] overflow-hidden rounded-[1.5rem] shadow-2xl" style={{background:composition?.background?.color??theme.bg,color:theme.text}}>
  <div className="relative aspect-[4/3] min-h-[520px] max-h-[760px] overflow-hidden">
   <div className="absolute inset-0 opacity-[.07]" style={{backgroundImage:composition?.background?.texture?`url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.7' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E\")`:undefined}} />
   {!elements.length&&<div className="absolute inset-0 grid place-items-center p-8 text-center"><div><div className="text-5xl font-black" style={{color:theme.primary}}>MENU</div><p className="mt-3 text-sm opacity-50">Generate a concept to activate the art-directed canvas.</p></div></div>}
   {elements.map(el=>{const selected=selectedId===el.id;const shape=el.shape??"square";const animation=el.animation??"none";return <button key={el.id} type="button" onClick={()=>onSelect(el.id)} className={`absolute overflow-hidden text-left ${selected?"ring-2 ring-offset-2 ring-black/60":"hover:ring-1 hover:ring-black/20"}`} style={{left:`${el.x}%`,top:`${el.y}%`,width:`${el.w}%`,height:`${el.h}%`,zIndex:el.z??0,transform:`rotate(${el.rotation??0}deg)`,opacity:el.opacity??1,borderRadius:shape==="circle"?"999px":shape==="rounded"?`${Math.max(8,theme.radius)}px`:shape==="organic"?"34% 66% 48% 52% / 58% 42% 58% 42%":"10px",background:el.color??(el.type==="image"?`linear-gradient(135deg, ${theme.primary}55, ${theme.accent}44)`:"transparent"),animation:animation!=="none"?`${animation} 900ms ease both`:undefined}}>
    {el.type==="image"?<div className="grid h-full w-full place-items-center bg-black/5">{el.image?<img src={el.image} alt="" className="h-full w-full object-cover"/>:<Camera className="size-7 opacity-20"/>}</div>:el.type==="shape"?<div className="h-full w-full"/>:<div className="flex h-full w-full items-center px-3" style={{justifyContent:el.align==="center"?"center":el.align==="right"?"flex-end":"flex-start",textAlign:el.align??"left"}}><span style={{fontSize:el.fontSize?`${el.fontSize}px`:undefined,fontFamily:el.fontFamily,color:el.color&&el.type!=="shape"?el.color:undefined,fontWeight:el.fontWeight,letterSpacing:el.letterSpacing!==undefined?`${el.letterSpacing}px`:undefined,lineHeight:el.lineHeight}}>{el.text||el.type}</span></div>}
    {selected&&<span className="absolute bottom-1 right-1 rounded-full bg-black/75 p-1 text-white"><Move className="size-3"/></span>}
   </button>})}
  </div>
 </div>;
}
