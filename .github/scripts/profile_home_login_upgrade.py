from pathlib import Path

path = Path("src/routes/auth.tsx")
text = path.read_text(encoding="utf-8")

replacements = [
    ('import { roleDestination } from "@/lib/post-signin";\n', ''),
    ('import { safeSessionRedirect } from "@/lib/session-token";\n', ''),
    ('  const {t,lang,toggleLang}=useI18n(); const ar=lang==="ar"; const navigate=useNavigate(); const search=Route.useSearch(); const target=safeSessionRedirect(search.redirect);',
     '  const {t,lang,toggleLang}=useI18n(); const ar=lang==="ar"; const navigate=useNavigate(); const target="/dashboard";'),
    ('  useEffect(()=>{let cancelled=false;void(async()=>{try{const {getResilientAuthenticatedUser}=await import("@/lib/auth-resilience");const user=await getResilientAuthenticatedUser();if(!cancelled&&user){const destination=await roleDestination(target,user.id);if(!cancelled)await navigate({to:destination as never,replace:true})}}catch(error){console.warn("Unable to restore the existing session.",error)}})();return()=>{cancelled=true}},[navigate,target]);',
     '  useEffect(()=>{let cancelled=false;void(async()=>{try{const {getResilientAuthenticatedUser}=await import("@/lib/auth-resilience");const user=await getResilientAuthenticatedUser();if(!cancelled&&user)await navigate({to:target,replace:true})}catch(error){console.warn("Unable to restore the existing session.",error)}})();return()=>{cancelled=true}},[navigate,target]);'),
    ('if(data.session){const destination=await roleDestination(target,data.user?.id??data.session.user.id);navigate({to:destination as never,replace:true})}',
     'if(data.session){navigate({to:target,replace:true})}'),
    ('const destination=await roleDestination(target,data.user?.id??data.session.user.id);navigate({to:destination as never,replace:true})',
     'navigate({to:target,replace:true})'),
    ('const destination=await roleDestination(target);navigate({to:destination as never,replace:true})',
     'navigate({to:target,replace:true})'),
]

for old, new in replacements:
    if old not in text:
        raise RuntimeError(f"Expected auth pattern not found: {old[:100]}")
    text = text.replace(old, new, 1)

if "roleDestination" in text or "safeSessionRedirect" in text:
    raise RuntimeError("Legacy post-sign-in destination logic still present")
if 'const target="/dashboard";' not in text:
    raise RuntimeError("Dashboard destination was not installed")

path.write_text(text, encoding="utf-8")
print("Auth now always lands authenticated sign-ins on /dashboard.")
