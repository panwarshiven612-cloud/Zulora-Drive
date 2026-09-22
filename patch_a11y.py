with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Wrap <main class="app-main"> with proper role (already has semantic tag, just ensure it)
# The existing <main class="app-main"> is already a landmark; confirm it has aria-label
content = content.replace(
    '<main class="app-main">',
    '<main class="app-main" id="mainContent" aria-label="File workspace">'
)

# 2. Add aria-labels to all context-menu buttons
context_fixes = [
    ('class="context-item" data-action="preview">', 'class="context-item" data-action="preview" aria-label="Preview file">'),
    ('class="context-item" data-action="download">', 'class="context-item" data-action="download" aria-label="Download file">'),
    ('class="context-item" data-action="copy-link">', 'class="context-item" data-action="copy-link" aria-label="Copy file link">'),
    ('class="context-item" data-action="star">', 'class="context-item" data-action="star" aria-label="Toggle star">'),
    ('class="context-item" data-action="rename">', 'class="context-item" data-action="rename" aria-label="Rename file">'),
    ('class="context-item danger" data-action="trash">', 'class="context-item danger" data-action="trash" aria-label="Move to trash">'),
]
for old, new in context_fixes:
    content = content.replace(old, new)

# 3. Add role="navigation" to sidebar nav if not present
content = content.replace(
    '<nav class="sidebar-nav">',
    '<nav class="sidebar-nav" aria-label="File navigation">'
)

# 4. Ensure app.js script has defer (it already has type=module which implies defer, but be explicit)
# type=module already defers by default; this is already correct in the file.
# Verify the script line is correct as-is:
if '<script type="module" src="app.js" defer></script>' in content:
    print("app.js already has defer OK")
elif '<script type="module" src="app.js"></script>' in content:
    content = content.replace(
        '<script type="module" src="app.js"></script>',
        '<script type="module" src="app.js" defer></script>'
    )
    print("added defer to app.js")
else:
    print("app.js script tag not matched - check manually")

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('index.html accessibility and landmark patches applied')
