"""Build script.

  python3 build.py          -> dist/gangstar.html  (single file, game embedded; needs game/gangstar.jar)
  python3 build.py app      -> docs/               (installable web app WITHOUT game files, for GitHub Pages)
                               dist/gangstar-datos.zip (private data package: jar + translations; never commit it)
"""
import base64, io, json, pathlib, sys, zipfile, hashlib

root = pathlib.Path(__file__).parent
SCRIPTS = [('INFLATE', 'inflate.js'), ('JVM', 'jvm.js'), ('MIDP', 'midp.js'), ('AUDIO', 'audio.js'),
           ('WIDE', 'wide.js'), ('GANGSTAR', 'gangstar.js'), ('SAVESTATE', 'savestate.js'),
           ('SATELLITE', 'satellite.js'), ('TOUCHMENU', 'touchmenu.js'), ('ARTJS', 'art.js')]


def art_files():
    # promotional art: only in the private data package / the single-file build, never in the repo
    d = root / 'art'
    return sorted(d.glob('*.webp')) if d.exists() else []


def assemble(jar_b64, langs, favicon_b64, head_extra='', art=None):
    html = (root / 'src/shell.html').read_text()
    for tag, f in SCRIPTS:
        html = html.replace('/*%s*/' % tag, (root / 'src' / f).read_text())
    html = html.replace('/*JAR*/', jar_b64).replace('/*ICON*/', favicon_b64).replace('/*LANGS*/', json.dumps(langs))
    html = html.replace('/*ARTPACK*/', json.dumps(art or {}))
    if head_extra:
        html = html.replace('</head>', head_extra + '\n</head>', 1)
    return html


def single():
    jar = (root / 'game/gangstar.jar').read_bytes()
    langs = {}
    if (root / 'lang/o_es.bin').exists():
        langs['es'] = base64.b64encode((root / 'lang/o_es.bin').read_bytes()).decode()
    icon = base64.b64encode((root / 'icons/favicon.png').read_bytes()).decode()
    out = root / 'dist/gangstar.html'
    out.parent.mkdir(exist_ok=True)
    art = {'art/' + p.name: base64.b64encode(p.read_bytes()).decode() for p in art_files()}
    out.write_text(assemble(base64.b64encode(jar).decode(), langs, icon, art=art))
    print(out, out.stat().st_size)


def app():
    docs = root / 'docs'
    docs.mkdir(exist_ok=True)
    (docs / 'icons').mkdir(exist_ok=True)
    for f in ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'favicon.png']:
        (docs / 'icons' / f).write_bytes((root / 'icons' / f).read_bytes())
    head = '''<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>'''
    icon = base64.b64encode((root / 'icons/favicon.png').read_bytes()).decode()
    html = assemble('', {}, icon, head)
    (docs / 'index.html').write_text(html)
    manifest = {
        'name': 'Gangstar · Crime City', 'short_name': 'Gangstar', 'lang': 'es',
        'start_url': './', 'scope': './', 'display': 'fullscreen', 'orientation': 'any',
        'background_color': '#111113', 'theme_color': '#111113',
        'icons': [
            {'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
            {'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
            {'src': 'icons/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
    }
    (docs / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    version = hashlib.sha1(html.encode()).hexdigest()[:10]
    sw = (root / 'src/sw.js').read_text().replace('__VERSION__', version)
    (docs / 'sw.js').write_text(sw)
    (docs / '.nojekyll').write_text('')
    print('app ->', docs, 'version', version, (docs / 'index.html').stat().st_size)
    # private data package
    jarp = root / 'game/gangstar.jar'
    if jarp.exists():
        out = root / 'dist/gangstar-datos.zip'
        out.parent.mkdir(exist_ok=True)
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
            z.write(jarp, 'gangstar.jar')
            for p in sorted((root / 'lang').glob('o_*.bin')):
                z.write(p, 'lang/' + p.name)
            for p in art_files():
                z.write(p, 'art/' + p.name)
        print('data package ->', out, out.stat().st_size)


if __name__ == '__main__':
    app() if 'app' in sys.argv[1:] else single()
