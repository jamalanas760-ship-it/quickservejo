import { cloneElement, isValidElement, useId, type ReactNode, type ReactElement } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Label a single input; group composite pickers without relabelling their buttons. */
export function ReservationField({label,children,className}:{label:string;children:ReactNode;className?:string}){
  const id=useId();
  const isInput=isValidElement(children)&&(children.type===Input||children.type===Textarea);
  return <div className={cn("rs-field",className)}><label id={`${id}-label`} htmlFor={isInput?id:undefined}>{label}</label>{isInput?cloneElement(children as ReactElement<{id:string}>,{id}):<div role="group" aria-labelledby={`${id}-label`}>{children}</div>}</div>;
}
