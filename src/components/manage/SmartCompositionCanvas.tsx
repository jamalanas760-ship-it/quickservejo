import { Camera, Move } from "lucide-react";
import type { MenuTheme } from "@/lib/menu-theme";
import { normalizeComposition } from "@/lib/menu-composition";

export type CompositionElement={id:string;type:string;x:number;y:number;w:number;h:number;rotation?:number;opacity?:number;text?:string;image?:string;color?:string;fontSize?:number;fontFamily?:string;fontWeight?:number;letterSpacing?:number;lineHeight?:number;align?:"left"|"center"|"right";shape?:"square"|"rounded"|"circle"|"organic";z?:number;animation?:string};
type CompositionShape={concept?:string;artDirection?:string;background?:{color?:string;texture?:string};elements?:CompositionElement[];responsive?:{mobile?:string;tablet?:string;desktop?:string};motion?:{entrance?:string;hover?:string;scroll?:string}};
type Props={theme:MenuTheme;composition?:CompositionShape|undefined;selectedId?:string|undefined;onSelect:(id:string)=>void};
const textTypes=new Set(["title","eyebrow","copy","category","price","product"]);
const clamp=(value:number,min:number,max:number)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):min;
const fallbackElements=(theme:MenuTheme):CompositionElement[]=>[
 {id:"fallback-title",type:"title",x:8,y:10,w:58,h:14,text:"MENU",fontSize:48,fontFamily:theme.headingFont,fontWeight:800,color:theme.text,z:2},
 {id:"fallback-rule",type:"shape",x:8,y:25,w:84,h:1.2,color:theme.primary,z:1},
 {id:"fallback-category",type:"category",x:8,y:31,w:44,h:8,text:"SIGNATURE",fontSize:20,fontFamily:theme.headingFont,fontWeight:700,color:theme.primary,z:2},
 {id:"fallback-item-1",type:"product",x:8,y:42,w:60,h:8,text:"Chef's Signature Dish",fontSize:18,fontFamily:theme.bodyFont,fontWeight:600,color:theme.text,z:2},
 {id:"fallback-price-1",type:"price",x:74,y:42,w:18,h:8,text:"12.50 JOD",fontSize:16,fontFamily:theme.bodyFont,fontWeight:700,color:theme.primary,align:"right",z:2},
 {id:"fallback-item-2",type:"product",x:8,y:54,w:60,h:8,text:"Seasonal House Special",fontSize:18,fontFamily:theme.bodyFont,fontWeight:600,color:theme.text,z:2},
 {id:"fallback-price-2",type:"price",x:74,y:54,w:18,h:8,text:"14.00 JOD",fontSize:16,fontFamily:theme.bodyFont,fontWeight:700,color:theme.primary,align:"right",z:2},
 {id:"fallback-item-3",type:"product",x:8,y:66,w:60,h:8,text:"Slow-Cooked Signature",fontSize:18,fontFamily:theme.bodyFont,fontWeight:600,color:theme.text,z:2},
 {id:"fallback-price-3",type:"price",x:74,y:66,w:18,h:8,text:"11.50 JOD",fontSize:16,fontFamily:theme.bodyFont,fontWeight:700,color:theme.primary,align:"right",z:2},
];
export function SmartCompositionCanvas({theme,composition,selectedId,onSelect}:Props){
 const normalized=normalizeComposition(composition);const elements=(normalized?.elements?.length?normalized.elements:fallbackElements(theme)).slice().sort((a,b)=>(a.z??0)-(b.z??0));
 const background=composition?.background?.color??theme.bg;
 return <div className="smart-menu-canvas mx-auto w-full max-w-[960px] overflow-hidden rounded-[24px] shadow-2xl" style={{background,color:theme.text}}>
  <div className="smart-menu-canvas-surface relative aspect-[4/3] w-full overflow-hidden">
   <div className="pointer-events-none absolute inset-0 opacity-[.07]" style={{backgroundImage:composition?.background?.texture?`url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.7' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E\")`:undefined}} />
   {elements.map(el=>{const selected=selectedId===el.id;const shape=el.shape??"square";const animation=el.animation??"none";const isText=textTypes.has(el.type);const left=clamp(el.x,0,100);const top=clamp(el.y,0,100);const width=clamp(el.w,2,100-left);const height=clamp(el.h,2,100-top);const textWidth=isText?Math.max(width,Math.min(44,100-left)):width;const textSize=el.fontSize?clamp(el.fontSize,10,72):undefined;return <button key={el.id} type="button" aria-label={`Edit ${el.type}`} onClick={()=>onSelect(el.id)} className={`smart-menu-element absolute overflow-hidden border-0 bg-transparent p-0 text-left ${selected?"ring-2 ring-offset-1 ring-black/60":"hover:ring-1 hover:ring-black/20"}`} style={{left:`${left}%`,top:`${top}%`,width:`${textWidth}%`,height:`${height}%`,zIndex:el.z??0,transform:`rotate(${el.rotation??0}deg)`,opacity:el.opacity??1,borderRadius:shape==="circle"?"999px":shape==="rounded"?`${Math.max(8,theme.radius)}px`:shape==="organic"?"34% 66% 48% 52% / 58% 42% 58% 42%":"10px",background:el.color??(el.type==="image"?`linear-gradient(135deg, ${theme.primary}55, ${theme.accent}44)`:"transparent"),animation:animation!=="none"?`${animation} 900ms ease both`:undefined}}>{el.type==="image"?<div className="h-full w-full"><img src={el.image??""} alt="" className="h-full w-full object-cover" onError={event=>{event.currentTarget.style.display="none"}}/>{!el.image&&<div className="grid h-full w-full place-items-center bg-black/5"><Camera className="size-7 opacity-20"/></div>}</div>:el.type==="shape"?<div className="h-full w-full"/>:<div className="flex h-full w-full min-w-0 items-center px-2 sm:px-3" style={{justifyContent:el.align==="center"?"center":el.align==="right"?"flex-end":"flex-start",textAlign:el.align??"left"}}><span className="block max-w-full overflow-hidden text-ellipsis" style={{fontSize:textSize?`clamp(10px, ${Math.min(textSize,48)}px, ${textSize}px)`:undefined,fontFamily:el.fontFamily,color:el.color&&el.type!=="shape"?el.color:undefined,fontWeight:el.fontWeight,letterSpacing:el.letterSpacing!==undefined?`${clamp(el.letterSpacing,-2,12)}px`:undefined,lineHeight:el.lineHeight?clamp(el.lineHeight,.8,2):1.15,whiteSpace:"normal",overflowWrap:"anywhere",wordBreak:"normal"}}>{el.text||el.type}</span></div>}</button>})}
  </div>
 </div>;
}
