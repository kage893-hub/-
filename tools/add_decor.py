"""いまの decor-kit.bin に、glTF の家具を足す（もとの素材がなくても足せるように、中身は読みなおして書きもどす）。
使い方: python3 tools/add_decor.py <入力の kit> <出力の kit> <glTF>:<名前> ...
- Poly Haven（CC0）のモデルを gltfpack で軽くしたもの（-noq、量子化なし）を想定。
- ノードの位置・回転・大きさは頂点にかけてしまう。いちばん下を y=0、横の真ん中を 0 にそろえる。
- 色の画像は 512px にして、透明があれば PNG、なければ JPEG で入れる。
"""
import json, struct, sys, os, io, math
from PIL import Image

KIN, KOUT, SPECS = sys.argv[1], sys.argv[2], sys.argv[3:]
raw = open(KIN, 'rb').read()
assert raw[:4] == b'LKIT'
jl = struct.unpack_from('<I', raw, 4)[0]
kit = json.loads(raw[8:8 + jl])
blob = bytearray(raw[8 + jl:])
items, mats, images = kit['items'], kit['mats'], kit['images']

def put(b):
    while len(blob) % 4: blob.append(0)
    off = len(blob); blob.extend(b); return [off, len(b)]

def add_image(path):
    im = Image.open(path)
    alpha = im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 250
    im = im.convert('RGBA' if alpha else 'RGB').resize((512, 512), Image.LANCZOS)
    buf = io.BytesIO()
    if alpha: im.save(buf, 'PNG', optimize=True)
    else: im.save(buf, 'JPEG', quality=82)
    images.append({'mime': 'image/png' if alpha else 'image/jpeg', 'data': put(buf.getvalue())})
    return len(images) - 1, alpha

def mat4_mul(a, b):
    return [sum(a[r + 4 * k] * b[k + 4 * c] for k in range(4)) for c in range(4) for r in range(4)]

def node_matrix(n):
    if 'matrix' in n: return n['matrix']
    t = n.get('translation', [0, 0, 0]); q = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = q
    r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
         2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
         2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1]
    for c in range(3):
        for rr in range(3): r[c * 4 + rr] *= s[c]
    r[12], r[13], r[14] = t
    return r

for spec in SPECS:
    path, name = spec.rsplit(':', 1)
    j = json.load(open(path)); d = os.path.dirname(path)
    bin_ = open(os.path.join(d, j['buffers'][0]['uri']), 'rb').read()
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        fmt = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}[a['componentType']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride', struct.calcsize(fmt) * n)
        return [struct.unpack_from('<' + fmt * n, bin_, off + k * st) for k in range(a['count'])]
    # ノードをたどって、メッシュごとの変換をまとめる
    I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    todo = [(i, I4) for i in j['scenes'][j.get('scene', 0)]['nodes']]; parts = []
    while todo:
        i, pm = todo.pop(); n = j['nodes'][i]; m = mat4_mul(pm, node_matrix(n))
        if 'mesh' in n: parts.append((n['mesh'], m))
        todo += [(c, m) for c in n.get('children', [])]
    geo = []; lo = [1e9] * 3; hi = [-1e9] * 3
    for mi, m in parts:
        for p in j['meshes'][mi]['primitives']:
            P = [(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]) for x, y, z in acc(p['attributes']['POSITION'])]
            N = []
            for x, y, z in acc(p['attributes']['NORMAL']):
                v = (m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z)
                l = math.sqrt(sum(c * c for c in v)) or 1; N.append(tuple(c / l for c in v))
            U = acc(p['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in p['attributes'] else None
            for v in P:
                for c in range(3): lo[c] = min(lo[c], v[c]); hi[c] = max(hi[c], v[c])
            geo.append((p, P, N, U, [v[0] for v in acc(p['indices'])]))
    cx, cz, y0 = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2, lo[1]
    prims = []
    for p, P, N, U, idx in geo:
        mt = j['materials'][p.get('material', 0)]
        mname = name + '_' + mt.get('name', 'mat')
        if mname not in mats:
            ti = mt.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index')
            img, alpha = (None, False)
            if ti is not None:
                uri = j['images'][j['textures'][ti]['source']]['uri']
                if not uri.startswith('data:'): img, alpha = add_image(os.path.join(d, uri))
            mats[mname] = {'img': img, 'alpha': alpha or mt.get('alphaMode') == 'MASK', 'double': bool(mt.get('doubleSided'))}
            if mt.get('alphaMode') == 'BLEND': mats[mname]['glass'] = True
        big = len(P) > 65535
        prims.append({'mat': mname,
                      'pos': put(struct.pack('<%df' % (len(P) * 3), *[c for v in P for c in (v[0] - cx, v[1] - y0, v[2] - cz)])),
                      'nrm': put(struct.pack('<%df' % (len(N) * 3), *[c for v in N for c in v])),
                      'uv': put(struct.pack('<%df' % (len(U) * 2), *[c for v in U for c in v])) if U else None,
                      'idx': put(struct.pack('<%d%s' % (len(idx), 'I' if big else 'H'), *idx)), 'i32': big})
    items[name] = {'prims': prims, 'size': [round(hi[0] - lo[0], 3), round(hi[1] - lo[1], 3), round(hi[2] - lo[2], 3)]}
    print(name, sum(len(g[4]) // 3 for g in geo), 'tris', items[name]['size'])

head = json.dumps({'items': items, 'mats': mats, 'images': images}, ensure_ascii=False).encode()
while len(head) % 4: head += b' '
with open(KOUT, 'wb') as f:
    f.write(b'LKIT' + struct.pack('<I', len(head)) + head + bytes(blob))
print(KOUT, os.path.getsize(KOUT), 'bytes')
