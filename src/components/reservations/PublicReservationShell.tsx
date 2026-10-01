import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { PublicStatus } from "@/components/public/PublicGuestShell";
import "./reservation-studio.css";

export function PublicReservationShell({children,logoUrl,coverUrl,brandName,title,description,status,footer}:{children:ReactNode;logoUrl?:string|null;coverUrl?:string|null;brandName?:string;title:ReactNode;description?:ReactNode;status?:{label:ReactNode;tone?:"green"|"orange"|"red"|"blue"|undefined};footer?:ReactNode;eyebrow?:ReactNode}){
  const {lang,setLang}=useI18n();
  return <main className="rs-public-shell" dir={lang==="ar"?"rtl":"ltr"}><section className="rs-public-card">
    {coverUrl?<img src={coverUrl} alt="" className="rs-restaurant-cover"/>:null}
    <header className="rs-public-header"><div className="rs-public-brand"><div>{logoUrl?<img src={logoUrl} alt=""/>:null}<strong>{brandName??"QuickServe"}</strong></div><div className="rs-language-switch" aria-label="Language">{(["en","ar"] as const).map(value=><button key={value} type="button" aria-pressed={lang===value} onClick={()=>setLang(value)}>{value.toUpperCase()}</button>)}</div></div><h1>{title}</h1>{description?<p>{description}</p>:null}{status?<div className="mt-3"><PublicStatus {...status}/></div>:null}</header>
    <div className="rs-public-body">{children}</div>{footer?<footer className="rs-public-footer">{footer}</footer>:null}
  </section><p className="rs-powered-by">QuickServe</p></main>;
}
