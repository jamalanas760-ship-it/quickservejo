"""Generate QuickServe's 32 independent, offline vector avatar portraits."""
from pathlib import Path
import re
from html import escape
catalog = Path('src/lib/avatar-presets.ts').read_text().split('// Keep every previously')[0]
ids = re.findall(r'id: "([a-z0-9-]+)"', catalog)
assert len(ids) == len(set(ids)) == 32
skins = ['#e6ad84', '#bd805b', '#89573e', '#f2c6a2']
hairs = ['#302522', '#58372b', '#1f2632', '#8a5937']
uniforms = ['#233e65', '#447b70', '#92513e', '#5c577f', '#35748a', '#775b40', '#374c61', '#8e4764']
backgrounds = ['#f5e1ce', '#dfebe8', '#e2e7f4', '#f1e1e7']
for i, key in enumerate(ids):
    female = key.endswith('female')
    skin, hair, shirt, bg = skins[i % 4], hairs[(i // 2) % 4], uniforms[(i // 2) % 8], backgrounds[(i // 4) % 4]
    role = key.rsplit('-', 1)[0].replace('-2', '')
    label = escape(key.replace('-', ' ').title())
    long_hair = f'<path d="M63 105Q58 39 128 39Q195 40 193 110L202 183H54Z" fill="{hair}"/>' if female else ''
    fringe = f'<path d="M76 99Q65 40 127 43Q186 39 181 104L163 75Q124 96 93 72L88 107Z" fill="{hair}"/>' if i % 4 < 2 else f'<path d="M76 101Q63 46 127 42Q189 44 181 105L166 84L160 62Q119 88 88 84L87 108Z" fill="{hair}"/>'
    accessory = ''
    if role in ('chef', 'kitchen'):
        accessory = '<path d="M82 67Q55 62 67 41Q76 28 94 36Q102 14 126 23Q146 10 160 32Q185 23 193 43Q201 65 175 70L174 83H83Z" fill="#fffaf2" stroke="#ded8ce" stroke-width="2"/><path d="M83 69H174V83H83Z" fill="#ece7de"/>'
    elif role in ('hr', 'finance', 'owner', 'manager', 'operations', 'procurement'):
        accessory = '<g fill="none" stroke="#293545" stroke-width="3"><rect x="87" y="101" width="33" height="22" rx="8"/><rect x="136" y="101" width="33" height="22" rx="8"/><path d="M120 109H136M79 105H87M169 105H177"/></g>'
    elif role in ('server', 'cashier', 'host'):
        accessory = '<path d="M177 105Q198 108 189 135L170 142" fill="none" stroke="#293545" stroke-width="4"/><circle cx="169" cy="142" r="4" fill="#293545"/>'
    tie = '<path d="M118 193H138L133 205L139 239H117L123 205Z" fill="#d78d50"/>' if role in ('owner', 'manager', 'finance', 'hr') else '<path d="M118 194H138V244H118Z" fill="#fffaf2" opacity=".85"/><circle cx="128" cy="210" r="2" fill="#556270"/><circle cx="128" cy="226" r="2" fill="#556270"/>'
    earrings = '<circle cx="79" cy="127" r="4" fill="#d8a54e"/><circle cx="177" cy="127" r="4" fill="#d8a54e"/>' if female else ''
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title"><title id="title">{label} cartoon avatar</title><defs><clipPath id="portrait"><rect width="256" height="256" rx="44"/></clipPath></defs><g clip-path="url(#portrait)"><path fill="{bg}" d="M0 0H256V256H0Z"/>{long_hair}<path d="M34 256V220Q40 187 99 179H157Q215 187 222 220V256Z" fill="{shirt}"/><path d="M109 155V185Q128 203 147 185V155Z" fill="{skin}"/><path d="M109 165Q128 182 147 165V177Q128 189 109 177Z" fill="#8a4b35" opacity=".18"/><path d="M99 179L128 195L109 211L92 183M157 179L128 195L147 211L164 183" fill="#fffaf2"/>{tie}<ellipse cx="80" cy="115" rx="10" ry="15" fill="{skin}"/><ellipse cx="176" cy="115" rx="10" ry="15" fill="{skin}"/><path d="M80 91Q80 53 128 53Q176 53 176 91V125Q174 166 128 178Q82 166 80 125Z" fill="{skin}"/>{fringe}<path d="M94 96Q104 91 115 96M141 96Q152 91 163 96" fill="none" stroke="{hair}" stroke-width="4" stroke-linecap="round"/><ellipse cx="105" cy="111" rx="3.5" ry="4.5" fill="#25303b"/><ellipse cx="151" cy="111" rx="3.5" ry="4.5" fill="#25303b"/><path d="M128 114L123 130H132" fill="none" stroke="#965d42" stroke-width="2.5" stroke-linecap="round"/><path d="M112 143Q128 155 144 143" fill="none" stroke="#884933" stroke-width="3" stroke-linecap="round"/><ellipse cx="99" cy="132" rx="9" ry="5" fill="#ce7a67" opacity=".22"/><ellipse cx="157" cy="132" rx="9" ry="5" fill="#ce7a67" opacity=".22"/>{earrings}{accessory}</g></svg>'''
    Path(f'public/avatars/{key}.svg').write_text(svg + '\n')
print(f'Generated {len(ids)} standalone SVG avatars')
