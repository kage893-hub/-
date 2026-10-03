"""試遊版（claude.ai アーティファクト）用に、すべてを1枚の HTML にまとめる。
使い方: python3 tools/bundle.py <出力先.html>
"""
import re, base64, glob, os, sys
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'leopa-together.html'
b64 = lambda f: base64.b64encode(open(R + f, 'rb').read()).decode()
h = open(R + 'index.html').read()
h = h.replace('<link rel="stylesheet" href="style.css">', '<style>' + open(R + 'style.css').read() + '</style>')
h = re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?', '', h)
h = re.sub(r'<picture>.*?</picture>', '<img src="data:image/webp;base64,%s" alt="レオパといっしょ" width="720" height="178">' % b64('assets/logo.webp'), h, flags=re.S)
h = h.replace('<script src="js/vendor/three.min.js"></script>',
              '<script>window.LEOPA_MODEL_B64="%s";window.LEOPA_KIT_B64="%s";</script>\n<script src="js/vendor/three.min.js"></script>' % (b64('assets/gecko.glb'), b64('assets/decor-kit.bin')))
h = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>' + open(R + m.group(1)).read().replace('</script>', '<\\/script>') + '</script>', h)
# 画像はパスで読めないので data URI に
for d in ('img', 'expo'):
    for f in glob.glob(R + 'assets/%s/*.webp' % d):
        n = os.path.basename(f)
        h = h.replace('assets/%s/%s' % (d, n), 'data:image/webp;base64,' + b64('assets/%s/%s' % (d, n)))
h = h.replace('src="assets/expo/trophy${t.rank}.webp"', 'src="${EXPO_IMG[t.rank]}"').replace('src="assets/expo/trophy${rank}.webp"', 'src="${EXPO_IMG[rank]}"')
h = h.replace('<script>window.LEOPA_MODEL_B64', '<script>window.EXPO_IMG=[0,' + ','.join('"data:image/webp;base64,%s"' % b64('assets/expo/trophy%d.webp' % i) for i in (1, 2, 3)) + '];</script>\n<script>window.LEOPA_MODEL_B64', 1)
open(OUT, 'w').write(h)
print(OUT, os.path.getsize(OUT), 'bytes')
