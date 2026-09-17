from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]

# 1) Remove Staff quick access card from sign-in page.
auth_path = root / "src/routes/auth.tsx"
auth = auth_path.read_text(encoding="utf-8")
pattern = re.compile(r'\n\s*<Link to="/staff" className="mt-3[\s\S]*?</Link>')
auth, count = pattern.subn('', auth, count=1)
if count != 1:
    raise RuntimeError(f"Expected one Staff quick access block, removed {count}")
if 'Staff quick access' in auth or 'وصول الموظفين السريع' in auth or 'to="/staff"' in auth:
    raise RuntimeError("Staff quick access is still present in auth.tsx")
auth_path.write_text(auth, encoding="utf-8")

# 2) Replace generic Admin naming with professional restaurant-management terminology.
permissions_path = root / "src/lib/permissions.ts"
permissions = permissions_path.read_text(encoding="utf-8")
replacements = {
    'restaurant_admin: { en: "Admin", ar: "مدير المطعم" },': 'restaurant_admin: { en: "Restaurant Manager", ar: "مدير المطعم" },',
    'export const ACCESS_LEVEL_LABELS: Record<AccessLevel, { en: string; ar: string }> = { admin: { en: "Admin", ar: "مدير" }, member: { en: "Staff", ar: "موظف" } };': 'export const ACCESS_LEVEL_LABELS: Record<AccessLevel, { en: string; ar: string }> = { admin: { en: "Management", ar: "الإدارة" }, member: { en: "Team Member", ar: "عضو الفريق" } };',
}
for old, new in replacements.items():
    if old not in permissions:
        raise RuntimeError(f"Expected role label not found: {old}")
    permissions = permissions.replace(old, new, 1)

permissions_path.write_text(permissions, encoding="utf-8")
print("Removed Staff quick access and updated Admin role naming.")
