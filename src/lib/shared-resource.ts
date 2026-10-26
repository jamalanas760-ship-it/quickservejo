const resources = new WeakMap<object,Map<string,{users:number;stop:()=>void}>>();
/** Multiple mounted hook consumers share one timer/channel per client and scope. */
export function retainResource(owner: object, scope: string, start: () => () => void): () => void {
  let map = resources.get(owner);
  if (!map) { map = new Map(); resources.set(owner,map); }
  let entry = map.get(scope);
  if (entry) entry.users++;
  else { entry = {users:1,stop:start()}; map.set(scope,entry); }
  let released=false;
  return () => {
    if (released) return;
    released=true;
    if (--entry.users===0) {map.delete(scope);entry.stop();}
  };
}
