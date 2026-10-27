# 화면 색(테마) CSS 만들기: python3 scripts/theme-css.py app/globals.css  — app/globals.css 의 THEME-START ~ THEME-END 부분을 새로 씀
# 색을 바꾸려면 아래 THEMES 의 값을 고친 뒤 다시 실행 (lib/theme.ts 의 미리 보기 색도 함께)
import re, sys
K = [50,100,200,300,400,500,600,700,800,900,950]
def rgb(h):
    h = h.lstrip('#'); return f"{int(h[0:2],16)} {int(h[2:4],16)} {int(h[4:6],16)}"
def scale(vals): return dict(zip(K, vals.split()))
THEMES = {
 'sage': dict(page='#F3EEE6', white='#FFFDF9', card='#FFFDF9',
   stone=scale('#FAF7F2 #F3EEE6 #E7DFD3 #D4C9B8 #A99D8B #857A6A #685F52 #514A40 #3B352E #2A2621 #1A1714'),
   blue=scale('#F1F5EE #E1EAD9 #C5D5B8 #A3BB91 #7F9C6C #5F7D55 #4E6946 #40563A #354631 #2C3A29 #1D271B')),
 'ivory': dict(page='#F6F3EC', white='#FFFEFB', card='#FFFEFB',
   stone=scale('#FAF8F3 #F4F0E8 #E9E3D8 #D9D2C6 #B5AC9E #8E8577 #6D665B #524D45 #3B3833 #292724 #1A1917'),
   blue=scale('#FAF5EB #F3E8D2 #E6D1A9 #D3B57F #BD9A5F #A48248 #8B6D3C #715832 #5B4729 #493921 #2C2214')),
 'navy': dict(page='#F1F4F8', white='#FFFFFF', card='#FFFFFF',
   stone=scale('#F7F8FB #EFF2F6 #DDE2EA #C5CCD8 #98A2B3 #6F7A8C #545E70 #3F4757 #2C3341 #1C2231 #10141D'),
   blue=scale('#EEF2F8 #DCE4F0 #B8C6DC #8DA2C2 #5F7AA2 #2F4A75 #233A5E #192B49 #13223A #0E192C #08101D')),
 'burgundy': dict(page='#F6F2EE', white='#FFFDFB', card='#FFFDFB',
   stone=scale('#FCFAF7 #F6F1ED #EAE2DC #D9D2CC #B3A6A2 #8D7B7A #6F6060 #564A4B #403637 #30282A #1E1819'),
   blue=scale('#F9F0F2 #F1DEE2 #E2BCC4 #CB919E #A86676 #8A4A58 #713C47 #5E323B #4C2930 #3D2127 #261418')),
 'charcoal': dict(page='#18191C', white='#FFFDF9', card='#232428',
   stone=scale('#202125 #2A2B30 #36373D #4A4B52 #7A7A7F #9C9993 #B6B2AA #CBC7BF #DDD9D1 #EFEBE3 #F8F5EF'),
   blue=scale('#2A2620 #352F25 #4B4232 #6E5E42 #A88E5D #C9A96E #B89859 #DCC28F #E6D2A8 #F0E2C5 #F7EFDE')),
}
out = ["/* ---- 화면 색 (설정 → 화면 색, lib/theme.ts). tailwind.config.js 의 white·stone·blue 가 이 변수를 쓴다 ---- */",
       "/* 이 부분은 scripts/theme-css.py 로 만든 것 (직접 고치지 말고 스크립트의 색을 고친 뒤 다시 실행) */"]
for key, t in THEMES.items():
    sel = ':root, [data-theme="sage"]' if key == 'sage' else f'[data-theme="{key}"]'
    lines = [f"  --page: {rgb(t['page'])};", f"  --white: {rgb(t['white'])};", f"  --card: {rgb(t['card'])};"]
    for fam in ('stone', 'blue'):
        lines += [f"  --{fam}-{k}: {rgb(v)};" for k, v in t[fam].items()]
    out.append(f"{sel} {{\n" + "\n".join(lines) + "\n}")
out.append('html[data-theme="charcoal"] { color-scheme: dark; }')

# ---- 어두운 화면(차콜) 보정 ----
D = 'html[data-theme="charcoal"]'
def esc(c): return c.replace('/', '\\/').replace(':', '\\:')
dark = ["/* 어두운 화면: 흰 바탕 칸은 카드색으로 (글자 text-white 는 그대로 밝게) */"]
dark.append(f"{D} .bg-white {{ background-color: rgb(var(--card)); }}")
for a in (95, 90, 85, 80, 70, 60):
    dark.append(f"{D} .{esc(f'bg-white/{a}')} {{ background-color: rgb(var(--card) / {a/100}); }}")
dark.append(f"{D} :is(.border-white) {{ border-color: rgb(var(--card)); }}")
dark.append(f"{D} :is(.ring-white, .{esc('ring-white/90')}) {{ --tw-ring-color: rgb(var(--card)); }}")
dark.append(f"{D} .to-white {{ --tw-gradient-to: rgb(var(--card)) var(--tw-gradient-to-position); }}")
dark.append(f"{D} .from-white {{ --tw-gradient-from: rgb(var(--card)) var(--tw-gradient-from-position); --tw-gradient-to: rgb(var(--card) / 0) var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }}")
# 밝아진 '검은 단추'·주요 단추 위 글자는 어둡게
light_bgs = ['bg-stone-700', 'bg-stone-800', 'bg-stone-900', 'bg-stone-900/80', 'bg-stone-900/85', 'bg-stone-900/90', 'bg-stone-950',
             'bg-blue-400', 'bg-blue-500', 'bg-blue-600', 'bg-blue-700']
sel = ', '.join('.' + esc(c) for c in light_bgs)
dark.append("/* 어두운 화면에서 밝아지는 바탕(검은 단추·주요 단추) 위 글자는 어둡게 */")
dark.append(f"{D} :is({sel}) {{ color: rgb(var(--page)); }}")
whites = ['text-white', 'text-white/90', 'text-white/80', 'text-white/75', 'text-white/70', 'text-white/60', 'text-white/55', 'text-white/50']
wsel = ', '.join('.' + esc(c) for c in whites)
dark.append(f"{D} :is({sel}):is({wsel}), {D} :is({sel}) :is({wsel}) {{ color: rgb(var(--page) / var(--tw-text-opacity, 1)); }}")
for w in whites:
    if '/' in w:
        a = int(w.split('/')[1]) / 100
        dark.append(f"{D} :is({sel}).{esc(w)}, {D} :is({sel}) .{esc(w)} {{ color: rgb(var(--page) / {a}); }}")

# 다른 색 (연한 칸·테두리·글자)
PAL = {
 'amber': '#FBF6EC #F5EAD2 #EBD5A6 #DDB975 #CC9E4D #B98535 #9C6C2A #7D5524 #644522 #52391F #2E1F10',
 'violet': '#F6F3F8 #ECE6F1 #DACFE4 #BFADD0 #9F88B6 #85699E #6F5686 #5B476E #4B3B5B #3F334C #2A2233',
 'emerald': '#ecfdf5 #d1fae5 #a7f3d0 #6ee7b7 #34d399 #10b981 #059669 #047857 #065f46 #064e3b #022c22',
 'sky': '#f0f9ff #e0f2fe #bae6fd #7dd3fc #38bdf8 #0ea5e9 #0284c7 #0369a1 #075985 #0c4a6e #082f49',
 'red': '#fef2f2 #fee2e2 #fecaca #fca5a5 #f87171 #ef4444 #dc2626 #b91c1c #991b1b #7f1d1d #450a0a',
 'rose': '#fff1f2 #ffe4e6 #fecdd3 #fda4af #fb7185 #f43f5e #e11d48 #be123c #9f1239 #881337 #4c0519',
 'purple': '#faf5ff #f3e8ff #e9d5ff #d8b4fe #c084fc #a855f7 #9333ea #7e22ce #6b21a8 #581c87 #3b0764',
 'yellow': '#fefce8 #fef9c3 #fef08a #fde047 #facc15 #eab308 #ca8a04 #a16207 #854d0e #713f12 #422006',
}
dark.append("/* 연한 색 칸·테두리는 어두운 빛으로, 진한 색 글자는 밝게 */")
for fam, vals in PAL.items():
    p = scale(vals)
    for k, src, a in ((50, 950, 0.45), (100, 900, 0.45), (200, 800, 0.5)):
        cls = [f'bg-{fam}-{k}'] + [f'bg-{fam}-{k}/{x}' for x in (40, 50, 60, 70, 80)]
        dark.append(f"{D} :is({', '.join('.' + esc(c) for c in cls)}) {{ background-color: rgb({rgb(p[src])} / {a}); }}")
    for k, src in ((100, 900), (200, 800), (300, 700)):
        cls = [f'border-{fam}-{k}', f'border-{fam}-{k}/70']
        dark.append(f"{D} :is({', '.join('.' + esc(c) for c in cls)}) {{ border-color: rgb({rgb(p[src])} / 0.8); }}")
        dark.append(f"{D} :is(.{esc(f'ring-{fam}-{k}')}, .{esc(f'ring-{fam}-{k}/70')}) {{ --tw-ring-color: rgb({rgb(p[src])} / 0.8); }}")
    for k, src in ((600, 300), (700, 300), (800, 200), (900, 100), (950, 100)):
        dark.append(f"{D} .{esc(f'text-{fam}-{k}')} {{ color: rgb({rgb(p[src])}); }}")
        for x in (60, 70):
            dark.append(f"{D} .{esc(f'text-{fam}-{k}/{x}')} {{ color: rgb({rgb(p[src])} / {x/100}); }}")
    dark.append(f"{D} .{esc(f'from-{fam}-50')} {{ --tw-gradient-from: rgb({rgb(p[950])} / 0.5) var(--tw-gradient-from-position); --tw-gradient-to: rgb({rgb(p[950])} / 0) var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to); }}")
    dark.append(f"{D} .{esc(f'to-{fam}-50')} {{ --tw-gradient-to: rgb({rgb(p[950])} / 0.5) var(--tw-gradient-to-position); }}")

block = "\n".join(out + dark)
p = sys.argv[1]
s = open(p).read()
START, END = "/* THEME-START */", "/* THEME-END */"
if START in s:
    s = s[:s.index(START)] + START + "\n" + block + "\n" + s[s.index(END):]
else:
    s = s.rstrip() + "\n\n" + START + "\n" + block + "\n" + END + "\n"
open(p, 'w').write(s)
print(len(block), 'bytes')
