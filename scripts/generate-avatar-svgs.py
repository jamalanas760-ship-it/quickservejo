"""Build the legacy SVG portraits. The approved reference-b WebP assets are maintained separately."""
from pathlib import Path
from html import escape
import re
catalog = Path('src/lib/avatar-presets.ts').read_text().split('// Keep every previously')[0]
ids = re.findall(r'id: "([a-z0-9-]+)"', catalog)
assert len(ids) == len(set(ids)) == 32
skins = ['#e8b18c', '#b97852', '#89543c', '#f0c3a0']
hairs = ['#242c32', '#513329', '#292421', '#70452f']
backgrounds = ['#ffe3d0', '#dfe6d2', '#e8dfd6', '#e1e9e6']
shirts = ['#303c40', '#6b8170', '#f4eadb', '#415b63']
for i, key in enumerate(ids):
    female = key.endswith('female')
    variant = i // 2
    skin, hair, bg, shirt = skins[variant % 4], hairs[(variant // 2) % 4], backgrounds[variant % 4], shirts[(variant // 3) % 4]
    hijab = female and variant % 4 == 3
    glasses = variant % 4 == 2
    beard = not female and variant % 3 != 2
    back = f'<path d="M61 128Q50 35 126 32Q204 30 196 133L201 199H56Z" fill="{hair}"/>' if female else ''
    if hijab:
        back = '<path d="M55 159Q52 37 127 31Q199 31 202 161L221 217H35Z" fill="#d0b99b"/>'
    fringe = f'<path d="M75 107Q57 48 111 39Q155 19 181 55Q196 77 180 111L169 87Q136 91 105 68Q95 93 75 107Z" fill="{hair}"/>'
    if female:
        fringe = f'<path d="M73 109Q59 38 128 35Q190 34 183 112L168 82Q132 89 107 63Q100 90 73 109Z" fill="{hair}"/>'
    if variant % 4 == 2:
        fringe = f'<path d="M72 105Q57 94 65 78Q53 57 76 51Q73 30 98 34Q112 18 131 31Q154 17 166 37Q191 33 190 54Q210 68 189 85L180 109L167 79Q124 90 90 77L83 108Z" fill="{hair}"/>'
    beard_shape = f'<path d="M80 127Q89 137 94 146L108 137Q129 130 149 138L163 145Q173 137 176 124V143Q165 177 128 180Q91 176 80 145Z" fill="{hair}"/>' if beard else ''
    smile = '<path d="M109 147Q128 158 147 147Q143 165 128 165Q114 165 109 147Z" fill="#fffaf4"/>'
    if female:
        smile = '<path d="M113 148Q128 153 144 146Q132 163 117 155Z" fill="#a65543"/>'
    glasses_shape = '<g fill="none" stroke="#303c40" stroke-width="3.5"><circle cx="104" cy="113" r="16"/><circle cx="152" cy="113" r="16"/><path d="M120 111H136M80 106L88 109M168 109L177 106"/></g>' if glasses else ''
    scarf = '<path d="M72 107Q62 49 126 39Q181 37 186 108L170 82Q163 53 127 53Q91 54 83 89Z" fill="#ddc8ad"/><path d="M70 106Q65 163 100 182L139 196L191 180L179 128Q176 163 147 175Q116 191 91 158L84 104Z" fill="#ddc8ad"/><path d="M92 173Q133 208 186 182" fill="none" stroke="#b29a7c" stroke-width="3"/>' if hijab else ''
    earrings = '<circle cx="77" cy="135" r="5" fill="#d5a54c"/><circle cx="179" cy="135" r="5" fill="#d5a54c"/>' if female and not hijab else ''
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title"><title id="title">{escape(key.replace('-', ' ').title())} modern vector avatar</title><defs><clipPath id="portrait"><rect width="256" height="256" rx="44"/></clipPath></defs><g clip-path="url(#portrait)"><path fill="{bg}" d="M0 0H256V256H0Z"/>{back}<path d="M24 256V226Q34 194 100 183H156Q222 194 232 226V256Z" fill="{shirt}"/><path d="M108 157V187Q127 207 148 187V157Z" fill="{skin}"/><path d="M108 164Q126 180 148 165V177Q128 193 108 177Z" fill="#7a4230" opacity=".2"/><path d="M97 185L125 207L111 218L88 189M157 185L130 207L145 218L168 189" fill="{shirt}" stroke="#b9b1a0" stroke-width="2"/><path d="M128 208V256" stroke="#151e23" stroke-width="2" opacity=".3"/><circle cx="135" cy="229" r="2" fill="#f5e4cc"/><ellipse cx="78" cy="117" rx="11" ry="16" fill="{skin}"/><ellipse cx="178" cy="117" rx="11" ry="16" fill="{skin}"/><path d="M79 91Q80 53 128 51Q177 53 177 93V127Q174 167 128 181Q82 167 79 127Z" fill="{skin}"/><path d="M157 74Q180 110 166 147L148 169Q178 153 177 126V94Q175 80 157 74Z" fill="#85523c" opacity=".1"/>{fringe}<path d="M92 99Q104 93 116 98M140 98Q153 92 164 98" fill="none" stroke="{hair}" stroke-width="4.5" stroke-linecap="round"/><path d="M95 113Q104 105 113 113M143 113Q152 105 161 113" fill="none" stroke="#303434" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="105" cy="114" rx="3" ry="4" fill="#242c32"/><ellipse cx="151" cy="114" rx="3" ry="4" fill="#242c32"/><path d="M128 115L123 133Q129 137 135 132" fill="none" stroke="#a1684c" stroke-width="2.5" stroke-linecap="round"/>{beard_shape}{smile}{glasses_shape}{earrings}{scarf}</g></svg>'''
    Path(f'public/avatars/{key}.svg').write_text(svg + '\n')
print(f'Generated {len(ids)} modern vector avatars')
