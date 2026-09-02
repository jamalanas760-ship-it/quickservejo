import { useEffect, useMemo, useState } from "react";
import { Camera, Check, Move, Sparkles, Utensils } from "lucide-react";
import type { MenuTheme } from "@/lib/menu-theme";

export type CompositionElement = { id:string; type:string; x:number; y:number; w:number; h:number; rotation?:number; opacity?:number; text?:string; image?:string; color?:string; fontSize?:number; fontFamily?:string; fontWeight?:number; letterSpacing?:number; lineHeight?:number; align?:"left"|"center"|"right"; shape?:"square"|"rounded"|"circle"|"organic"; z?:number; animation?:string };
type MenuItem = { name_en?:string|null; name_ar?:string|null; description_en?:string|null; description_ar?:string|null; price?:number|string|null; image_url?:string|null };
type CompositionShape={concept?:string;artDirection?:string;background?:{color?:string;texture?:string};elements?:CompositionElement[];responsive?:{mobile?:string;tablet?:string;desktop?:string};motion?:{entrance?:string;hover?:string;scroll?:string}};
type Props={theme:MenuTheme;composition?:CompositionShape|undefined;selectedId?:string|undefined;onSelect:(id:string)=>void;menuItems?:MenuItem[];restaurantName?:string};

const textTypes = new Set(["title", "eyebrow", "copy", "category", "price", "product"]);
const buildStages = ["Visual foundation", "Typography hierarchy", "Composition & imagery", "Spacing & alignment", "Final polish"];
const clamp = (value:number,min:number,max:number) => Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : min;
const fontMap: Record<string,string> = { sans:"ui-sans-serif,system-ui,sans-serif", serif:"Georgia,'Times New Roman',serif", rounded:"'Trebuchet MS',sans-serif", display:"'Palatino Linotype',Georgia,serif", condensed:"'Arial Narrow',Impact,sans-serif", script:"'Brush Script MT',cursive", mono:"ui-monospace,monospace" };

export function SmartCompositionCanvas({theme,composition,selectedId,onSelect,menuItems=[],restaurantName="Restaurant"}:Props){
 const elements=useMemo(()=>[...(composition?.elements??[])].sort((a,b)=>(a.z??0)-(b.z??0)),[composition?.elements]);
 const hasRealMenu=menuItems.length>0;
 const displayItems=menuItems.slice(0,6);
 const title=elements.find(e=>e.type==="title")?.text || restaurantName;
 const category=elements.find(e=>e.type==="category")?.text || "SIGNATURE MENU";
 const surfaceBg=composition?.background?.color??theme.bg;
 const [stage,setStage]=useState(elements.length?1:0);

 useEffect(()=>{
  if(!elements.length){setStage(0);return;}
  setStage(1);
  let current=1;
  const timer=window.setInterval(()=>{
   current+=1;
   setStage(current);
   if(current>=buildStages.length) window.clearInterval(timer);
  },280);
  return ()=>window.clearInterval(timer);
 },[composition?.concept,elements.length]);

 const revealCount=Math.ceil(elements.length*Math.min(1,stage/buildStages.length));
 const visibleElements=elements.slice(0,revealCount);
 const currentStage=stage>=buildStages.length?"Final design ready":buildStages[Math.max(0,stage-1)];

 return <div className="smart-menu-canvas mx-auto w-full max-w-[960px] overflow-hidden rounded-[24px] border border-black/10 shadow-[0_24px_70px_rgba(0,0,0,.18)]" style={{background:surfaceBg,color:theme.text}}>
  <div className="border-b border-black/10 bg-white/85 px-3 py-2.5 backdrop-blur-xl sm:px-4">
   <div className="flex items-center justify-between gap-3">
    <div className="min-w-0"><div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.18em] text-black/45"><Sparkles className="size-3"/>AI live renderer</div><div className="mt-0.5 truncate text-xs font-semibold text-black/75">{composition?.concept||"Live menu design"}</div></div>
    <div className="shrink-0 text-[9px] font-semibold text-black/45">{currentStage}</div>
   </div>
   <div className="mt-2 grid grid-cols-5 gap-1">
    {buildStages.map((item,index)=><div key={item} className="min-w-0"><div className="h-1 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-black transition-[width] duration-500" style={{width:`${stage>index?100:stage===index?42:0}%`}}/></div><div className="mt-0.5 hidden truncate text-[7px] text-black/35 sm:block">{item}</div></div>)}
   </div>
  </div>
  <div className="smart-menu-canvas-surface relative aspect-[4/3] w-full overflow-hidden" style={{fontFamily:fontMap[theme.bodyFont],background:surfaceBg}}>
   <div className="pointer-events-none absolute inset-0 opacity-[.06]" style={{backgroundImage:composition?.background?.texture?`url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.7' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E\")`:undefined}} />
   <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(255,255,255,.12),transparent_32%),linear-gradient(135deg,transparent_45%,rgba(0,0,0,.08))]" />
   {!elements.length&&<div className="absolute inset-0 grid place-items-center p-8 text-center"><div><Utensils className="mx-auto size-9 opacity-30"/><div className="mt-3 text-2xl font-black" style={{color:theme.primary}}>{restaurantName}</div><p className="mt-2 text-xs opacity-50">Generate a concept to activate the live menu.</p></div></div>}
   {visibleElements.map(el=>{
    const selected=selectedId===el.id;
    const shape=el.shape??"square";
    const animation=el.animation??"none";
    const isText=textTypes.has(el.type);
    const left=clamp(el.x,0,100), top=clamp(el.y,0,100);
    const width=clamp(el.w,1,100-left), height=clamp(el.h,1,100-top);
    const textSize=el.fontSize ? clamp(el.fontSize,10,72) : undefined;
    const isImage=el.type==="image";
    const isProduct=el.type==="product";
    return <button key={el.id} type="button" aria-label={`Edit ${el.type}`} onClick={()=>onSelect(el.id)} className={`smart-menu-element absolute overflow-hidden border-0 bg-transparent p-0 text-left transition-[opacity,transform,box-shadow] duration-500 ${selected?"ring-2 ring-offset-1 ring-black/60":"hover:ring-1 hover:ring-black/20"}`} style={{left:`${left}%`,top:`${top}%`,width:`${width}%`,height:`${height}%`,zIndex:el.z??0,transform:`rotate(${el.rotation??0}deg)`,opacity:el.opacity??1,borderRadius:shape==="circle"?"999px":shape==="rounded"?`${Math.max(8,theme.radius)}px`:shape==="organic"?"34% 66% 48% 52% / 58% 42% 58% 42%":"10px",background:el.color??(isImage?`linear-gradient(135deg,${theme.primary}66,${theme.accent}55)`:"transparent"),animation:animation!=="none"?`${animation} 900ms ease both`:undefined}}>
      {isImage?<div className="relative h-full w-full overflow-hidden bg-black/10">{el.image?<img src={el.image} alt="Menu food" className="h-full w-full object-cover" style={{filter:"saturate(1.03) contrast(1.02)"}}/>:<div className="grid h-full w-full place-items-center"><Camera className="size-7 opacity-20"/></div>}<div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/15"/></div>
      :isProduct?<div className="flex h-full w-full min-w-0 items-center gap-3 rounded-[inherit] border border-black/10 bg-white/90 p-2 shadow-sm backdrop-blur-sm"><div className="h-full aspect-square shrink-0 overflow-hidden rounded-lg bg-black/10">{el.image?<img src={el.image} alt="" className="h-full w-full object-cover"/>:<div className="grid h-full w-full place-items-center"><Camera className="size-4 opacity-20"/></div>}</div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-bold" style={{color:el.color??theme.text}}>{el.text||"Menu item"}</div><div className="mt-1 h-1.5 w-3/4 rounded-full bg-black/10"/><div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-black/5"/></div></div>
      :el.type==="shape"?<div className="h-full w-full" style={{background:el.color??theme.primary}}/>:<div className="flex h-full w-full min-w-0 items-center px-2 sm:px-3" style={{justifyContent:el.align==="center"?"center":el.align==="right"?"flex-end":"flex-start",textAlign:el.align??"left"}}><span className="block max-w-full overflow-hidden text-ellipsis" style={{fontSize:textSize?`clamp(10px,${Math.min(textSize,48)}px,${textSize}px)`:undefined,fontFamily:el.fontFamily||fontMap[theme.headingFont],color:el.color&&el.type!=="shape"?el.color:undefined,fontWeight:el.fontWeight,letterSpacing:el.letterSpacing!==undefined?`${clamp(el.letterSpacing,-2,12)}px`:undefined,lineHeight:el.lineHeight?clamp(el.lineHeight,.8,2):1.15,whiteSpace:isText?"normal":"nowrap",overflowWrap:"anywhere",wordBreak:"normal"}}>{el.text||el.type}</span></div>}
      {selected&&<span className="absolute bottom-1 right-1 rounded-full bg-black/75 p-1 text-white"><Move className="size-3"/></span>}
    </button>;
   })}
   {hasRealMenu&&stage>=3&&<div className="pointer-events-none absolute inset-x-[7%] bottom-[6%] z-[20] grid grid-cols-2 gap-2 sm:gap-3 transition-opacity duration-700" style={{opacity:stage>=3?1:0}}>
    {displayItems.map((item,index)=><div key={`live-${index}`} className="overflow-hidden rounded-xl border border-black/10 bg-white/90 p-1.5 shadow-sm backdrop-blur-sm"><div className="flex items-center gap-2"><div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/10">{item.image_url?<img src={item.image_url} alt="Menu item" className="h-full w-full object-cover"/>:<div className="grid h-full w-full place-items-center"><Camera className="size-3 opacity-20"/></div>}</div><div className="min-w-0 flex-1"><div className="truncate text-[9px] font-bold" style={{color:theme.text}}>{item.name_en||item.name_ar||"Menu item"}</div><div className="mt-0.5 truncate text-[7px]" style={{color:theme.muted}}>{item.description_en||item.description_ar||"Freshly prepared"}</div></div><div className="shrink-0 text-[8px] font-bold" style={{color:theme.primary}}>{item.price!=null?`${item.price} JOD`:""}</div></div></div>)}
   </div>}
   {hasRealMenu&&stage>=2&&<div className="pointer-events-none absolute left-[7%] top-[6%] z-[21] max-w-[55%] transition-opacity duration-500" style={{opacity:stage>=2?1:0}}><div className="text-[8px] font-bold uppercase tracking-[.22em]" style={{color:theme.accent}}>{restaurantName}</div><div className="mt-1 truncate text-[clamp(18px,4vw,42px)] font-black leading-none" style={{fontFamily:fontMap[theme.headingFont],color:theme.text}}>{title}</div><div className="mt-1 text-[8px] font-bold uppercase tracking-[.18em]" style={{color:theme.muted}}>{category}</div></div>}
   {stage>=buildStages.length&&elements.length>0&&<div className="pointer-events-none absolute bottom-3 right-3 z-[120] flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[9px] font-bold text-black/60 shadow-sm backdrop-blur-md"><Check className="size-3"/>Final render ready</div>}
  </div>
 </div>;
}
