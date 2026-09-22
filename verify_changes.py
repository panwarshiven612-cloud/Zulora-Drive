with open('public/index.html','r',encoding='utf-8') as f:
    c = f.read()
checks = [
    ('Title CTR', 'Zulora Drive \u2013 Fast, Secure'),
    ('OG image:width', 'og:image:width'),
    ('twitter:creator', 'twitter:creator'),
    ('WebApplication JSON-LD', 'WebApplication'),
    ('aria-label on main', 'id="mainContent"'),
    ('aria-label preview btn', 'aria-label="Preview file"'),
    ('font-display swap URL', 'display=swap'),
    ('defer on app.js', 'src="app.js" defer'),
    ('sidebar nav aria-label', 'aria-label="File navigation"'),
]
for label, token in checks:
    status = 'OK  ' if token in c else 'MISS'
    print(f'  [{status}] HTML: {label}')

with open('public/style.css','r',encoding='utf-8') as f:
    css = f.read()
css_checks = [
    ('background-clip standard', 'background-clip: text;'),
    ('font-face Inter', "font-family: 'Inter';"),
    ('font-face src url', 'src: url('),
    ('font-display swap', 'font-display: swap;'),
    ('color: transparent gradient text', 'color: transparent;'),
]
for label, token in css_checks:
    status = 'OK  ' if token in css else 'MISS'
    print(f'  [{status}] CSS: {label}')

with open('public/app.js','r',encoding='utf-8') as f:
    js = f.read()
js_checks = [
    ('formatStorageSize 2dp MB', '.toFixed(2)} MB'),
    ('KB threshold boundary', 'if (b < MB)'),
    ('GB threshold', 'if (b < GB)'),
]
for label, token in js_checks:
    status = 'OK  ' if token in js else 'MISS'
    print(f'  [{status}] JS:  {label}')
print('\nAll checks done.')
