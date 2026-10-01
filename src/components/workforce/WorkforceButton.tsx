import { Button, type ButtonProps } from "@/components/ui/button";

/** Scoped styling metadata keeps the Workforce control system isolated. */
export function WorkforceButton(props: ButtonProps) {
  return <Button data-slot="button" data-variant={props.variant ?? "default"} {...props} />;
}
