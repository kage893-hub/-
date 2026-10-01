"""Quaternius Stylized Nature MegaKit (CC0) の glTF から、ゲームで使う家具だけを1つのファイルにまとめる。
使い方: python3 tools/pack_decor.py <glTFを展開したフォルダ> assets/decor-kit.bin
形式: 'LKIT' + uint32(JSON長) + JSON + バイナリ（4バイト境界）。
"""
import json, struct, sys, os, glob, io
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
PICK = sys.argv[3].split(',') if len(sys.argv) > 3 else None
# テクスチャは小さくして軽くする（葉や草は透明を残すので PNG、岩は JPEG）
TEX = {
    'Rocks_Diffuse.png': (512, 'jpg'), 'Rocks_Desert_Diffuse.png': (512, 'jpg'), 'PathRocks_Diffuse.png': (512, 'jpg'),
    'Leaves.png': (512, 'png'), 'Grass.png': (256, 'png'), 'Flowers.png': (512, 'png'),
    'Leaves_TwistedTree_C.png': (256, 'png'), 'Leaves_NormalTree_C.png': (256, 'png'), 'Mushrooms.png': (256, 'jpg'),
}
files = {os.path.basename(f): f for f in glob.glob(os.path.join(SRC, '**', '*'), recursive=True)}
blob = bytearray()
def put(b):
    while len(blob) % 4: blob.append(0)
    off = len(blob); blob.extend(b); return [off, len(b)]
images, img_index, mats, items = [], {}, {}, {}

def image(name):
    if name in img_index: return img_index[name]
    if name not in files or name not in TEX: return None
    size, fmt = TEX[name]
    im = Image.open(files[name])
    im = im.convert('RGBA' if fmt == 'png' else 'RGB').resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    if fmt == 'png': im.save(buf, 'PNG', optimize=True)
    else: im.save(buf, 'JPEG', quality=82)
    images.append({'mime': 'image/png' if fmt == 'png' else 'image/jpeg', 'data': put(buf.getvalue())})
    img_index[name] = len(images) - 1
    return img_index[name]

for name in PICK:
    # 「名前@テクスチャ」で、同じ形に別の模様をはった版を作る（例：赤茶の岩）
    tex_over = None
    if '@' in name: base, tex_over = name.split('@'); out_name = base + '_' + tex_over.split('_')[1]
    else: base = out_name = name
    path = files[base + '.gltf']
    j = json.load(open(path))
    bin_ = open(os.path.join(os.path.dirname(path), j['buffers'][0]['uri']), 'rb').read()
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        fmt = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}[a['componentType']]
        sz = struct.calcsize(fmt)
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', sz * n)
        out = []
        for k in range(a['count']):
            out.append(struct.unpack_from('<' + fmt * n, bin_, off + k * stride))
        return out, a['componentType']
    prims = []
    lo = [1e9] * 3; hi = [-1e9] * 3
    raw = []
    for p in j['meshes'][0]['primitives']:
        pos, _ = acc(p['attributes']['POSITION'])
        for v in pos:
            for c in range(3): lo[c] = min(lo[c], v[c]); hi[c] = max(hi[c], v[c])
        raw.append((p, pos))
    cx, cz, y0 = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2, lo[1]
    for p, pos in raw:
        nrm, _ = acc(p['attributes']['NORMAL'])
        uv, _ = acc(p['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in p['attributes'] else ([], 0)
        idx, ct = acc(p['indices'])
        m = j['materials'][p['material']]
        mname = m['name'] + ('_' + tex_over if tex_over else '')
        if mname not in mats:
            ti = m.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index')
            img = image(tex_over or j['images'][j['textures'][ti]['source']]['uri']) if (ti is not None or tex_over) else None
            mats[mname] = {'img': img, 'alpha': m.get('alphaMode') == 'MASK', 'double': bool(m.get('doubleSided'))}
        P = struct.pack('<%df' % (len(pos) * 3), *[x for v in pos for x in (v[0] - cx, v[1] - y0, v[2] - cz)])
        N = struct.pack('<%df' % (len(nrm) * 3), *[x for v in nrm for x in v])
        U = struct.pack('<%df' % (len(uv) * 2), *[x for v in uv for x in v])
        big = len(pos) > 65535
        I = struct.pack('<%d%s' % (len(idx), 'I' if big else 'H'), *[v[0] for v in idx])
        prims.append({'mat': mname, 'pos': put(P), 'nrm': put(N), 'uv': put(U) if uv else None, 'idx': put(I), 'i32': big})
    items[out_name] = {'prims': prims, 'size': [round(hi[0] - lo[0], 3), round(hi[1] - lo[1], 3), round(hi[2] - lo[2], 3)]}

head = json.dumps({'items': items, 'mats': mats, 'images': images}, ensure_ascii=False).encode()
while len(head) % 4: head += b' '
with open(OUT, 'wb') as f:
    f.write(b'LKIT' + struct.pack('<I', len(head)) + head + bytes(blob))
print(OUT, os.path.getsize(OUT), 'bytes', {k: v['size'] for k, v in items.items()})
