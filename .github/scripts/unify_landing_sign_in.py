from pathlib import Path

path = Path("src/routes/index.tsx")
text = path.read_text(encoding="utf-8")

old_header = '''            ) : (\n              <>\n                <Button asChild variant="outline" size="sm" className="h-10">\n                  <Link to="/staff">{lang === "ar" ? "الموظفين" : "Staff"}</Link>\n                </Button>\n                <Button asChild size="sm" className="h-10">\n                  <Link to="/auth">{lang === "ar" ? "الإدارة" : "Admin"}</Link>\n                </Button>\n              </>\n            )}'''
new_header = '''            ) : (\n              <Button asChild size="sm" className="h-10 px-4">\n                <Link to="/auth">{lang === "ar" ? "تسجيل الدخول" : "Sign in"}</Link>\n              </Button>\n            )}'''

old_hero = '''            ) : (\n              <>\n                <Button asChild size="lg">\n                  <Link to="/auth">{lang === "ar" ? "دخول الإدارة" : "Admin sign in"}</Link>\n                </Button>\n                <Button asChild variant="outline" size="lg">\n                  <Link to="/staff">{lang === "ar" ? "دخول الموظفين بالرمز" : "Staff sign in with PIN"}</Link>\n                </Button>\n              </>\n            )}'''
new_hero = '''            ) : (\n              <Button asChild size="lg" className="min-w-32">\n                <Link to="/auth">{lang === "ar" ? "تسجيل الدخول" : "Sign in"}</Link>\n              </Button>\n            )}'''

old_footer = '''            <Link to="/staff" className="hover:text-foreground">\n              {lang === "ar" ? "دخول الموظفين" : "Staff sign in"}\n            </Link>\n'''

for label, old, new in [
    ("header sign-in split", old_header, new_header),
    ("hero sign-in split", old_hero, new_hero),
    ("footer staff sign-in", old_footer, ""),
]:
    if text.count(old) != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {text.count(old)}")
    text = text.replace(old, new, 1)

# Regression guardrails: the public landing page must expose one auth entry only.
for forbidden in ["Admin sign in", "Staff sign in with PIN", '<Link to="/staff">', '"Staff"}</Link>', '"Admin"}</Link>']:
    if forbidden in text:
        raise RuntimeError(f"Forbidden split sign-in UI remains: {forbidden}")

if text.count('<Link to="/auth">{lang === "ar" ? "تسجيل الدخول" : "Sign in"}</Link>') != 2:
    raise RuntimeError("Expected exactly two unified Sign in links (header + hero)")

path.write_text(text, encoding="utf-8")
print("Unified landing sign-in applied.")
