from pathlib import Path

p = Path('src/routes/_authenticated/automations.tsx')
text = p.read_text(encoding='utf-8')
old = '<Field label={ar ? "الحدث" : "Event"><Select'
new = '<Field label={ar ? "الحدث" : "Event"}><Select'
if text.count(old) != 1:
    raise RuntimeError(f'Expected one JSX syntax target, got {text.count(old)}')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Automation JSX syntax repaired.')
