from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

# Fix tables dragged outside zones without ever persisting NULL into the NOT NULL zone column.
path = 'src/components/manage/TablesManagerPro.tsx'
text = read(path)
text = replace_once(text,'const W=1000,H=700;\n','const W=1000,H=700;\nconst OUTSIDE_ZONE="__outside__";\n','outside-zone constant')
text = replace_once(text,'setForm({number:selected.table_number,name:selected.table_name??"",capacity:String(selected.capacity??4),floor,zone:selected.zone||floorConfig.zones[0]?.id||"main",shape:shapeOf(selected.shape),material:materialOf(selected),active:selected.is_active,rotation:String(Math.round((draft[selected.id]??layoutOf(selected,0)).rotation))});','const currentLayout=draft[selected.id]??layoutOf(selected,0);const physicalZone=zoneContaining(currentLayout,floorConfig.zones)?.id??OUTSIDE_ZONE;setForm({number:selected.table_number,name:selected.table_name??"",capacity:String(selected.capacity??4),floor,zone:floorConfig.zones.some(zone=>zone.id===selected.zone)?selected.zone!:physicalZone,shape:shapeOf(selected.shape),material:materialOf(selected),active:selected.is_active,rotation:String(Math.round(currentLayout.rotation))});','selected table zone form')
text = replace_once(text,'const zoneId=zoneContaining(layout,floor.zones)?.id??null;','const zoneId=zoneContaining(layout,floor.zones)?.id??OUTSIDE_ZONE;','persist layout outside zone')
text = replace_once(text,'const zone=targetZone?.id??null;const insideTarget=targetZone?zoneContaining(current,[targetZone])!==null:true;const next={...current,rotation,...(!insideTarget&&targetZone?{x:(targetZone.x+targetZone.width/2)*10,y:(targetZone.y+targetZone.height/2)*7}:{})};','const outsideZone=form.zone===OUTSIDE_ZONE;const zone=outsideZone?OUTSIDE_ZONE:(targetZone?.id??OUTSIDE_ZONE);const insideTarget=targetZone?zoneContaining(current,[targetZone])!==null:true;const next={...current,rotation,...(!outsideZone&&!insideTarget&&targetZone?{x:(targetZone.x+targetZone.width/2)*10,y:(targetZone.y+targetZone.height/2)*7}:{})};','save selected outside zone')
# Add an explicit inspector option if the current markup exposes the zone select in a recognizable shape.
needles = [
    '{floor.zones.map(z=><SelectItem key={z.id} value={z.id}>{ar?z.ar:z.en}</SelectItem>)}',
    '{currentFloor.zones.map(z=><SelectItem key={z.id} value={z.id}>{ar?z.ar:z.en}</SelectItem>)}',
]
for needle in needles:
    if needle in text:
        text = text.replace(needle, '<SelectItem value={OUTSIDE_ZONE}>{ar?"خارج المناطق":"Outside zones"}</SelectItem>' + needle, 1)
        break
write(path,text)

# Replace external cover sliders with direct manipulation inside the cover image itself.
path='src/components/profile/RestaurantProfileSettings.tsx'
text=read(path)
text=replace_once(text,'import { useState, type FormEvent } from "react";','import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";','react imports')
text=replace_once(text,'import { Crop, Image as ImageIcon, Move, Save, SlidersHorizontal } from "lucide-react";','import { Image as ImageIcon, Minus, Move, Plus, RotateCcw, Save, SlidersHorizontal } from "lucide-react";','cover icons')
start=text.index('function CoverComposer(')
text=text[:start]+r'''function CoverComposer({ ar, url, x, y, zoom, onChange }: { ar: boolean; url: string; x: number; y: number; zoom: number; onChange: (value: { coverPositionX?: number; coverPositionY?: number; coverZoom?: number }) => void }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const previewStyle = { objectPosition: `${x}% ${y}%`, transform: `scale(${zoom / 100})`, transformOrigin: `${x}% ${y}%` };
  const clampValue = (value: number) => Math.min(100, Math.max(0, value));
  const clampZoom = (value: number) => Math.min(220, Math.max(100, value));

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y };
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !rect) return;
    event.preventDefault();
    const dx = (event.clientX - drag.clientX) / rect.width * 100;
    const dy = (event.clientY - drag.clientY) / rect.height * 100;
    onChange({ coverPositionX: clampValue(drag.x - dx), coverPositionY: clampValue(drag.y - dy) });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
  }

  return <div className="space-y-2">
    <div
      ref={frameRef}
      role="application"
      aria-label={ar ? "اسحب صورة الغلاف لتغيير الجزء الظاهر" : "Drag the cover image to change the visible area"}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="group relative aspect-[16/6] touch-none select-none overflow-hidden rounded-2xl border border-border bg-muted shadow-sm cursor-grab active:cursor-grabbing"
    >
      <img src={url} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover transition-transform duration-150" style={previewStyle} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
      <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
        <span className="grid size-10 place-items-center rounded-full border border-white/70 bg-black/25 text-white backdrop-blur-sm"><Move className="size-4" /></span>
      </div>
      <div className="absolute start-3 top-3 flex items-center gap-1 rounded-xl border border-white/20 bg-black/55 p-1 text-white shadow-lg backdrop-blur-md">
        <button type="button" onClick={() => onChange({ coverZoom: clampZoom(zoom - 10) })} className="grid size-9 place-items-center rounded-lg transition hover:bg-white/15" aria-label={ar ? "تصغير" : "Zoom out"}><Minus className="size-4" /></button>
        <span className="min-w-12 text-center text-[10px] font-bold tabular-nums">{Math.round(zoom)}%</span>
        <button type="button" onClick={() => onChange({ coverZoom: clampZoom(zoom + 10) })} className="grid size-9 place-items-center rounded-lg transition hover:bg-white/15" aria-label={ar ? "تكبير" : "Zoom in"}><Plus className="size-4" /></button>
        <span className="mx-0.5 h-5 w-px bg-white/20" />
        <button type="button" onClick={() => onChange({ coverPositionX: 50, coverPositionY: 50, coverZoom: 100 })} className="grid size-9 place-items-center rounded-lg transition hover:bg-white/15" aria-label={ar ? "إعادة ضبط" : "Reset framing"}><RotateCcw className="size-4" /></button>
      </div>
      <div className="pointer-events-none absolute bottom-3 start-3 max-w-[78%] rounded-xl bg-black/55 px-3 py-2 text-[10px] font-semibold leading-4 text-white backdrop-blur-md">
        {ar ? "اسحب الصورة نفسها لاختيار الجزء الظاهر. استخدم + و− للتكبير والتصغير." : "Drag the image itself to choose what stays visible. Use + and − to zoom."}
      </div>
    </div>
    <p className="text-[10px] text-muted-foreground">{ar ? "يتم حفظ الموضع والتكبير عند حفظ إعدادات المؤسسة." : "The framing and zoom are saved with the organization settings."}</p>
  </div>;
}
'''
write(path,text)

checks={
 'src/components/manage/TablesManagerPro.tsx':['const OUTSIDE_ZONE="__outside__";','??OUTSIDE_ZONE','form.zone===OUTSIDE_ZONE'],
 'src/components/profile/RestaurantProfileSettings.tsx':['onPointerDown={beginDrag}','Drag the image itself','coverZoom: clampZoom(zoom + 10)'],
}
for filename,snippets in checks.items():
    body=read(filename)
    for snippet in snippets:
        if snippet not in body:
            raise RuntimeError(f'missing {snippet!r} in {filename}')
print('Zone outside + direct cover manipulation fixes applied.')
