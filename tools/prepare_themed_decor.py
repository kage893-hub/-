"""Blender用：CC0モデルをケージ用25点に調整する。
blender -b --python tools/prepare_themed_decor.py -- <sources> <plan.json> <output>
元モデル・画像を保持し、軽量化したglTFだけを出力する。出典は別途manifestに保存する。
"""
import bpy,bmesh,json,sys,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
args=sys.argv[sys.argv.index('--')+1:];src,plan_file,out=map(Path,args[:3]);only=set(args[3].split(',')) if len(args)>3 else None
plan=json.loads(plan_file.read_text());out.mkdir(parents=True,exist_ok=True)
META=[]
def active(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def meshes():return [o for o in bpy.context.scene.objects if o.type=='MESH']
def bounds(objects):
 # glTFの境界箱はメッシュ編集直後に古いことがあるため、実頂点から測る。
 pts=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
 return Vector([min(v[k] for v in pts) for k in range(3)]),Vector([max(v[k] for v in pts) for k in range(3)])
def normalize(objects,width,height=None,depth=None):
 lo,hi=bounds(objects);size=hi-lo;center=(lo+hi)*.5;center.z=lo.z
 k=width/max(size.x,size.y);scale=Vector([k,k,height/size.z if height else k])
 if depth:scale=Vector([width/size.x,depth/size.y,height/size.z])
 for o in objects:
  for v in o.data.vertices:v.co=Vector([(v.co[i]-center[i])*scale[i] for i in range(3)])
  o.data.update()

def decimate(o,target):
 active(o);tri=sum(len(p.vertices)-2 for p in o.data.polygons)
 if tri>target:
  mod=o.modifiers.new('スマホ向け軽量化','DECIMATE');mod.ratio=max(.002,min(1,target/tri));mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)

def join(objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();return bpy.context.object

def seal(o):
 bm=bmesh.new();bm.from_mesh(o.data)
 # glTFはUVの切れ目で頂点を分ける。穴埋め前に接合しないと表裏が逆転する。
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
 edges=[e for e in bm.edges if e.is_boundary]
 if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=0)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()

def boolean(o,cutter,inner):
 cutter.data.materials.clear();cutter.data.materials.append(inner);active(o)
 m=o.modifiers.new('入口と内側をくりぬく','BOOLEAN');m.operation='DIFFERENCE';m.solver='EXACT';m.object=cutter
 if hasattr(m,'material_mode'):m.material_mode='TRANSFER'
 bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(cutter,do_unlink=True)

def remesh_surface(o):
 original=o.copy();original.data=o.data.copy();bpy.context.collection.objects.link(original);active(o)
 mod=o.modifiers.new('器の表面を接合','REMESH');mod.mode='VOXEL';mod.voxel_size=.018;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 if not o.data.uv_layers:o.data.uv_layers.new(name=original.data.uv_layers.active.name)
 mod=o.modifiers.new('木目と模様を戻す','DATA_TRANSFER');mod.object=original;mod.use_loop_data=True;mod.data_types_loops={'UV'};mod.loop_mapping='POLYINTERP_NEAREST';bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(original,do_unlink=True)

def solid_envelope(o,flat_base=False):
 # 薄い器や板組みのモデルを、屋根・背面の閉じた飼育用の外形にする。
 original=o.copy();original.data=o.data.copy();bpy.context.collection.objects.link(original)
 bm=bmesh.new();bm.from_mesh(o.data)
 if flat_base:
  # 自然の岩の斜めの底を、隠れ家として地面にすわる平らな底へ延ばす。
  for point in [v.co.copy() for v in bm.verts]:bm.verts.new((point.x,point.y,0))
 res=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
 bm.verts.ensure_lookup_table();bm.verts.index_update()
 verts=[list(v.co) for v in bm.verts];faces=[[v.index for v in f.verts] for f in res['geom'] if isinstance(f,bmesh.types.BMFace)]
 me=bpy.data.meshes.new('閉じた外形');me.from_pydata(verts,[],faces);me.update()
 for mat in original.data.materials:me.materials.append(mat)
 me.uv_layers.new(name='UVMap');o.data=me;bm.free();active(o)
 mod=o.modifiers.new('外形を整える','REMESH');mod.mode='VOXEL';mod.voxel_size=.035;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
 mod=o.modifiers.new('原素材の模様を戻す','DATA_TRANSFER');mod.object=original;mod.use_loop_data=True;mod.data_types_loops={'UV'};mod.loop_mapping='POLYINTERP_NEAREST';bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.data.objects.remove(original,do_unlink=True)

def cube(loc,scale):
 bpy.ops.mesh.primitive_cube_add(size=2,location=loc);o=bpy.context.object;o.scale=scale;active(o);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return o

def cut_top(o,z):
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,z),plane_no=(0,0,1),clear_outer=True,clear_inner=False);bm.to_mesh(o.data);bm.free();seal(o)

def water_points(o,height,maxr=1.6,center=(0,0)):
 # 水面をくぼみの内側に収める。真上からの表面の高さで縁を測る。
 coords=[]
 for i in range(64):
  a=i*math.tau/64;dx,dy=math.cos(a),math.sin(a);end=.05
  for n in range(1,81):
   r=maxr*n/80;hit,point,_,_=o.ray_cast(Vector([center[0]+dx*r,center[1]+dy*r,5]),Vector([0,0,-1]))
   if not hit or point.z>=height-.005:break
   end=r
  coords.append([round(center[0]+dx*max(.02,end-.015),5),round(-center[1]-dy*max(.02,end-.015),5)])
 return coords

def carve_reservoir(o,id):
 # 別の器を重ねず、元モデルの屋根そのものを削って水ためを作る。
 # 各素材に合わせ、丸み・輪郭・位置を変える。XYはBlenderの床面。
 cfg={
  'wetZen':(.93,.59,0,.06,2.5,.012),
  'wetRain':(.83,.55,-.04,.08,2.0,.009),
  'wetCoast':(.87,.55,0,.36,2.2,.070),
  'wetLoft':(1.04,.71,0,.05,5.2,0),
  'wetBirch':(.83,.61,-.015,.06,2.1,.040),
 }[id]
 rx,ry,cx,cy,power,organic=cfg;N=80
 def outline(a,scale=1):
  c,s=math.cos(a),math.sin(a);noise=1+organic*(math.sin(a*3+.3)+.45*math.cos(a*5+1.2))
  return (cx+rx*scale*noise*math.copysign(abs(c)**(2/power),c),cy+ry*scale*noise*math.copysign(abs(s)**(2/power),s))
 # 屋根の低い部分へ水面が飛び出さない大きさ・高さを実形状から決める。
 for attempt in range(10):
  border=[]
  for n in range(N):
   x,y=outline(n*math.tau/N,1.04);hit,pt,_,_=o.ray_cast(Vector((x,y,5)),Vector((0,0,-1)))
   border.append(pt.z if hit else 0)
  water=min(border)-(.16 if id=='wetLoft' else .10)
  if water>=1.43:break
  rx*=.95;ry*=.95
 assert water>=1.43,(id,'屋根の厚みが足りない',water)
 floor=water-.18
 # 元の屋根の画像を、削った面へ真上から投影するための写し。
 original=o.data.copy();original.calc_loop_triangles();verts=[v.co.copy() for v in original.vertices];triangles=list(original.loop_triangles)
 bvh=BVHTree.FromPolygons(verts,[list(t.vertices) for t in triangles],all_triangles=True)
 material=o.data.materials[0].copy();material.name='本体を削った水ため';material.diffuse_color=(.35,.25,.15,1)
 node=material.node_tree.nodes.get('Principled BSDF')
 if node and not node.inputs['Roughness'].is_linked:node.inputs['Roughness'].default_value=.9
 # 丸い底、傾斜した内壁、屋根へつながるなだらかな口元を一続きにくりぬく。
 rings=[(.58,floor),(.73,floor+.025),(.87,floor+.085),(.94,water+.035),(1.03,water+.16),(1.07,3.5)]
 points=[(*outline(n*math.tau/N,scale),z) for scale,z in rings for n in range(N)]
 faces=[tuple(reversed(range(N)))]
 for k in range(len(rings)-1):
  for n in range(N):
   q=(n+1)%N;faces.append((k*N+n,k*N+q,(k+1)*N+q,(k+1)*N+n))
 faces.append(tuple((len(rings)-1)*N+n for n in range(N)))
 mesh=bpy.data.meshes.new('水ための切削形');mesh.from_pydata(points,[],faces);mesh.update();cutter=bpy.data.objects.new('水ための切削形',mesh);bpy.context.collection.objects.link(cutter)
 boolean(o,cutter,material);index=o.data.materials.find(material.name)
 # くぼみと本体の境界だけを丸める。独立した縁や受け皿は追加しない。
 bm=bmesh.new();bm.from_mesh(o.data);weights=bm.edges.layers.float.new('bevel_weight_edge')
 for edge in bm.edges:
  if len(edge.link_faces)==2 and sum(f.material_index==index for f in edge.link_faces)==1:edge[weights]=1
 bm.to_mesh(o.data);bm.free();active(o)
 bevel=o.modifiers.new('彫り口を丸める','BEVEL');bevel.limit_method='WEIGHT';bevel.width=.045;bevel.segments=3;bevel.material=index;bpy.ops.object.modifier_apply(modifier=bevel.name)
 uv=o.data.uv_layers.active.data;source_uv=original.uv_layers.active.data
 for face in o.data.polygons:
  if face.material_index!=index:continue
  for loop_index in face.loop_indices:
   at=o.data.vertices[o.data.loops[loop_index].vertex_index].co;hit,_,tri,_=bvh.ray_cast(Vector((at.x,at.y,5)),Vector((0,0,-1)))
   if hit is None:continue
   t=triangles[tri];p=[verts[k] for k in t.vertices];u=[Vector((*source_uv[k].uv,0)) for k in t.loops];value=barycentric_transform(hit,*p,*u);uv[loop_index].uv=(value.x,value.y)
 bpy.data.meshes.remove(original)
 return {'water':{'y':round(water,5),'r':round(max(rx,ry),5),'center':[cx,-cy]},'floorY':round(floor,5),'rimY':round(min(border),5),'center':[cx,-cy]}

for theme in plan:
 for id,label,role,asset in theme['items']:
  if only and id not in only:continue
  bpy.ops.wm.read_factory_settings(use_empty=True);file=src/asset/'prepared.gltf';file=file if file.exists() else src/asset/(asset+'.gltf');bpy.ops.import_scene.gltf(filepath=str(file))
  objects=meshes()
  for o in objects:
   world=o.matrix_world.copy();o.parent=None;o.matrix_world=world;active(o);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.rotation_mode='XYZ'
  # セットで配られている岩・シダ・根から、1つの株を選ぶ。
  if id in ['zenMossRock','birchMossRock','rainFern','birchRoots']:
   keep=max(objects,key=lambda o:o.dimensions.x*o.dimensions.y*max(.01,o.dimensions.z))
   for o in objects:
    if o!=keep:bpy.data.objects.remove(o,do_unlink=True)
   objects=[keep]
  if id=='dishRain':
   for o in objects[:]:
    if 'lid' in o.name:bpy.data.objects.remove(o,do_unlink=True);objects.remove(o)
  if id in ['rainBranch','coastWood']:
   for o in objects:o.rotation_euler.y=math.pi/2;active(o);bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
  if id in ['wetZen','wetRain']:
   for o in objects:o.rotation_euler.x=math.pi;active(o);bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
  if id=='wetLoft':
   for o in objects:o.rotation_euler.z=math.pi/2;active(o);bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
  # 土の高密度メッシュや大きな地形を先に軽くする。
  for o in objects:decimate(o,10000 if role in ['dish','wet'] else 6500)
  meta={'id':id,'name':label,'role':role,'source':asset,'theme':theme['theme']}
  if role in ['dish','wet']:
   o=join(objects);seal(o)
   if id in ['dishCoast','dishLoft']:
    lo,hi=bounds([o]);cut_top(o,lo.z+(hi.z-lo.z)*.68)
   if role=='dish':
    normalize([o],2.0,height=.34);seal(o)
    if id=='dishLoft':remesh_surface(o)
    inner=bpy.data.materials.new('内側');inner.diffuse_color=(.18,.14,.10,1);inner.use_nodes=True
    node=inner.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(.18,.14,.10,1);node.inputs['Roughness'].default_value=.8
    # 元の器のくぼみを保ちつつ、ふたを外した器にも水が入る内側を作る。
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.72,depth=1.0,location=(0,0,.59));boolean(o,bpy.context.object,inner)
    if id=='dishLoft':
     # 切断面に元の鍋の写真を引き伸ばさず、磨いた真ちゅうのふちにする。
     rim=bpy.data.materials.new('磨いた真ちゅうのふち');rim.use_nodes=True;n=rim.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(.36,.23,.095,1);n.inputs['Metallic'].default_value=.8;n.inputs['Roughness'].default_value=.38
     o.data.materials.append(rim);index=len(o.data.materials)-1
     for face in o.data.polygons:
      if face.normal.z>.55 and face.center.z>.22:face.material_index=index
    water_y=.17 if id=='dishBirch' else .235
    meta['water']={'y':water_y,'points':water_points(o,water_y),'r':.72}
   else:
    W,D,H=(3.3,2.8,1.8) if id!='wetCoast' else (3.4,2.9,2.0)
    normalize([o],W,height=H,depth=D);seal(o)
    solid_envelope(o,flat_base=id=='wetCoast')
    if id=='wetBirch':
     # 根元は保ち、上部を低い切り株らしい広い肩に整える。
     for vertex in o.data.vertices:
      if vertex.co.z>.35:
       u=min(1,(vertex.co.z-.35)/(H-.35));vertex.co.z=.35+(H-.35)*(1-(1-u)**1.9)
     o.data.update()
    inner=bpy.data.materials.new('隠れ家の内側');inner.use_nodes=True;node=inner.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(.085,.065,.045,1);node.inputs['Roughness'].default_value=.95
    if id=='wetLoft':cutter=cube((0,0,.46),(W*.37,D*.36,.74))
    else:
     bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=(0,0,.36));cutter=bpy.context.object;cutter.scale=(W*.37,D*.36,.74);active(cutter);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    boolean(o,cutter,inner)
    boolean(o,cube((0,-D*.38,.24),(.72,D*.36,.5)),inner)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.72,depth=D*.58,location=(0,-D*.43,.55),rotation=(math.pi/2,0,0));boolean(o,bpy.context.object,inner)
    reservoir=carve_reservoir(o,id);meta['water']=reservoir['water'];meta['reservoir']={k:v for k,v in reservoir.items() if k!='water'};meta['roofY']=reservoir['rimY'];meta['entrance']={'width':1.44,'height':1.27,'front':round(D/2,5)}
   decimate(o,4200)
   if role=='wet':
    cx,cz=meta['water']['center'];meta['water']['points']=water_points(o,meta['water']['y'],maxr=1.5,center=(cx,-cz))
   for poly in o.data.polygons:poly.use_smooth=True
  else:
   sizes={'zenLantern':1.0,'zenMossRock':2.2,'zenVase':.85,'rainPlant':1.65,'rainFern':1.65,'rainBranch':3.4,'coastShell':1.5,'coastRock':2.4,'coastWood':3.7,'loftLamp':1.15,'loftCrate':1.9,'loftToolbox':1.8,'birchStump':2.3,'birchRoots':2.6,'birchMossRock':2.0}
   normalize(objects,sizes[id]);
   if role=='climb':
    lo,hi=bounds(objects);limit=.65 if id not in ['rainBranch','coastWood'] else .85
    if hi.z>limit:
     for o in objects:
      for v in o.data.vertices:v.co.z*=limit/hi.z
   total=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
   target=6000 if role=='plant' else 4000
   for o in objects:decimate(o,max(150,int(target*sum(len(p.vertices)-2 for p in o.data.polygons)/total)))
  objects=meshes();lo,hi=bounds(objects);meta['bounds']=[list(lo),list(hi)];meta['triangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
  if role=='wet':assert lo.z>-.02 and hi.z<2.05,(id,'切削後の不要な突起',list(lo),list(hi))
  if role=='wet':
   hit,back,_,_=o.ray_cast(Vector((0,-3,.45)),Vector((0,1,0)))
   assert hit and back.y>.15,(id,'隠れ家の背面の壁が閉じていない')
  folder=out/id;folder.mkdir(exist_ok=True);bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.ops.export_scene.gltf(filepath=str(folder/'model.gltf'),export_format='GLTF_SEPARATE',use_selection=True,export_yup=True,export_image_format='AUTO',export_materials='EXPORT',export_cameras=False,export_lights=False)
  (folder/'meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2));META.append(meta);print('DONE_ITEM',id,meta['triangles'],flush=True)
all_meta=[json.loads(p.read_text()) for p in sorted(out.glob('*/meta.json'))]
(out/'items.json').write_text(json.dumps(all_meta,ensure_ascii=False,indent=2));print('ALL_ITEMS',len(all_meta),flush=True)
