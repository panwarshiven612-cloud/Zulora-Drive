import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix title
content = content.replace(
    '<title>Zulora Drive - Fast, Secure &amp; Free Cloud Storage Services</title>',
    '<title>Zulora Drive \u2013 Fast, Secure &amp; Free Next-Gen Cloud Storage</title>'
)
# 2. Fix meta name=title
content = content.replace(
    'name="title" content="Zulora Drive - Fast, Secure &amp; Free Cloud Storage Services"',
    'name="title" content="Zulora Drive \u2013 Fast, Secure &amp; Free Next-Gen Cloud Storage"'
)
# 3. Fix meta description
content = content.replace(
    'name="description" content="Zulora Drive offers lightning-fast free cloud storage and affordable paid storage plans starting at \u20b970/month. Store, sync, and share photos, videos, and documents securely. Official support: zulora.help@gmail.com | WhatsApp: +91 6395211325."',
    'name="description" content="Store, access, and share your files effortlessly with Zulora Drive. Secure end-to-end cloud storage with instant high-speed access. Get 10 GB free \u2014 plans from \u20b970/month."'
)
# 4. Fix OG title
content = content.replace(
    'property="og:title" content="Zulora Drive - High-Speed Secure Cloud Storage"',
    'property="og:title" content="Zulora Drive \u2013 Fast, Secure &amp; Free Next-Gen Cloud Storage"'
)
# 5. Fix OG description
content = content.replace(
    'property="og:description" content="Get fast free cloud storage and scalable paid plans with instant file encryption and priority WhatsApp billing support."',
    'property="og:description" content="Store, access, and share your files effortlessly with Zulora Drive. Secure end-to-end cloud storage with instant high-speed access. Get 10 GB free."'
)
# 6. Add OG image dimensions + site_name + locale
content = content.replace(
    '<meta property="og:image" content="https://drive.zulora.in/preview-banner.png">',
    '<meta property="og:image" content="https://drive.zulora.in/preview-banner.png">\n  <meta property="og:image:width" content="1200">\n  <meta property="og:image:height" content="630">\n  <meta property="og:site_name" content="Zulora Drive">\n  <meta property="og:locale" content="en_IN">'
)
# 7. Fix Twitter title
content = content.replace(
    'name="twitter:title" content="Zulora Drive - Free &amp; Premium Cloud Storage"',
    'name="twitter:title" content="Zulora Drive \u2013 Fast, Secure &amp; Free Next-Gen Cloud Storage"'
)
# 8. Fix Twitter description
content = content.replace(
    'name="twitter:description" content="Securely back up your digital files with Zulora Drive. High-performance cloud infrastructure."',
    'name="twitter:description" content="Store, access, and share your files effortlessly with Zulora Drive. Secure end-to-end cloud storage with instant high-speed access."'
)
# 9. Add twitter:creator after twitter:image
content = content.replace(
    '<meta name="twitter:image" content="https://drive.zulora.in/preview-banner.png">',
    '<meta name="twitter:image" content="https://drive.zulora.in/preview-banner.png">\n  <meta name="twitter:creator" content="@ZuloraAI">'
)
# 10. Upgrade SoftwareApplication JSON-LD to WebApplication
old_type = '"@type": "SoftwareApplication",'
new_block = '''"@type": "WebApplication",
    "url": "https://drive.zulora.in/",'''
content = content.replace(
    '"@type": "SoftwareApplication",\n    "name": "Zulora Drive",\n    "operatingSystem": "Web, Android, iOS, Windows",\n    "applicationCategory": "BusinessApplication",',
    '"@type": "WebApplication",\n    "name": "Zulora Drive",\n    "url": "https://drive.zulora.in/",\n    "applicationCategory": "UtilitiesApplication",\n    "operatingSystem": "Web, Android, iOS, Windows, macOS",\n    "browserRequirements": "Requires JavaScript",'
)
# 11. Upgrade JSON-LD description
content = content.replace(
    '"description": "Zulora Drive provides high-performance secure cloud storage, instant file encryption, dynamic storage tracking, and fast WhatsApp billing support."',
    '"description": "Store, access, and share your files effortlessly with Zulora Drive. Secure end-to-end cloud storage with instant high-speed access.",\n    "screenshot": "https://drive.zulora.in/preview-banner.png",\n    "featureList": "10 GB Free Storage, End-to-End Encryption, Real-time Sync, Multi-Device Access, File Preview, Referral Bonuses",\n    "inLanguage": "en-IN"'
)
# 12. Fix Organization logo URL
content = content.replace(
    '"logo": "https://drive.zulora.in/logo.png"',
    '"logo": "https://i.postimg.cc/VL9RBtWh/Elegant-AI-Agency-Logo-for-Zulora-20260208-153446-0000.png"'
)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('index.html SEO/meta patches applied successfully')

