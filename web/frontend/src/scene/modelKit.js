// modelKit.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the real-size kit every builder uses: fitArt, tags, cutaways, open boxes, holed slabs. Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import * as THREE from 'three'
import { solidBox } from './solids.js'
import { dims } from './dims.js'

  // METADATA ONLY (no geometry): tag a mesh that is NOT a rigid solid so the geometry
  // audit (src/scene/geometryAudit.js) leaves it out of contact / overlap checks —
  // 'fluid' (a liquid volume), 'effect' (steam, droplets, cells), 'decal' (a print or
  // overlay on a surface), 'granular' (crushed ice a vessel is pushed into).
  function fx(o, kind){ o.userData.fx=kind; return o; }
  // tag a builder's root with its dimensions.json id (what real object it depicts)
  // + its CANONICAL size (solids' extent as built: lids shut, caps on, before any motion)
  // — the relative-scale check compares this against the real size.
  /* ---- REAL SIZE: fit a builder's hand-drawn ART to its dimensions.json envelope ----
     Every builder draws its model in its own drawing units (the art below is unchanged:
     proportions, profiles, materials). fitArt measures that drawing's solid extent (as
     built: lids shut, caps on) and scales it so the model's world envelope IS the table's
     width × height × depth, then recentres it so the ORIGIN IS THE CENTRE OF ITS BASE.
     The drawing's numbers therefore set only shape; the only size is dims(id). A 'round'
     item keeps its x and z scale equal (a centrifuge stays round). Functional geometry
     that must fit a real vessel — bores, slots, stages — is authored in WORLD units from
     the table on the returned root, never in drawing units. Sprite labels move to the root
     (a non-uniformly scaled parent would squash them) and sit just above the model.
     Returns the root; root.userData carries the art's userData (hooks, state) and `fit`. */
  var LABEL_GAP = 0.25;   // world units a builder's name plate floats above its top
  /* CUTAWAY (scene convention, CLAUDE.md): when the station's subject sits INSIDE an opaque
     container, the container's NEAR WALL is rendered see-through so the subject is seen in
     place. It changes the wall's MATERIAL only (opacity) — the wall is still there, nothing
     moves, nothing is resized. A builder declares which meshes are its near wall. */
  var CUTAWAY_OPACITY=0.28;
  // meshes: the NEAR WALL — the parts between the camera and the seated subject. carrier
  // (optional): { node, meshes } — the part the subject RIDES in (a rotor: its disc and the
  // subject's own slot), cut away with the wall wherever it has turned to; node must hold the
  // sample socket (cutaway.test.js checks both).
  function declareCutaway(root, meshes, carrier){
    if(carrier){ meshes=meshes.concat(carrier.meshes); root.userData.cutCarrier=carrier; }
    root.userData.setCutaway=function(on){
      meshes.forEach(function(m){
        if(!m.userData.cutMats){ m.material=Array.isArray(m.material)?m.material.map(function(x){ return x.clone(); }):m.material.clone();
          m.userData.cutMats=(Array.isArray(m.material)?m.material:[m.material]).map(function(x){ return { m:x, t:x.transparent, o:x.opacity, dw:x.depthWrite }; }); }
        m.userData.cutMats.forEach(function(c){
          if(on){ c.m.transparent=true; c.m.opacity=Math.min(c.o, CUTAWAY_OPACITY); c.m.depthWrite=false; }
          else { c.m.transparent=c.t; c.m.opacity=c.o; c.m.depthWrite=c.dw; }
          c.m.needsUpdate=true;
        });
        // the cut wall is drawn BEFORE the vessels (it writes no depth): the subject behind it
        // draws over it whole — a cutaway never veils the subject
        if(m.userData.cutOrder==null) m.userData.cutOrder=m.renderOrder;
        m.renderOrder = on ? -1 : m.userData.cutOrder;
      });
      root.userData.cutaway=!!on;
    };
    return root;
  }
  function fitArt(art, id, opts){
    opts=opts||{};
    var d=dims(id);
    // opts.measure: the art nodes whose extent IS the table's envelope (a transilluminator's
    // box, not the camera mast drawn with it); default the whole art
    var b=new THREE.Box3();
    if(opts.measure){ opts.measure.forEach(function(n){ b.union(solidBox(n, art)); }); } else b=solidBox(art, art);
    var size=b.getSize(new THREE.Vector3()), c=b.getCenter(new THREE.Vector3());
    // opts.pivot:'origin' keeps the drawing's own x/z origin (a tool held by its tip)
    if(opts.pivot==='origin'){ c.x=0; c.z=0; }
    var tw=(opts.size&&opts.size.width)||d.width, th=(opts.size&&opts.size.height)||d.height, td=(opts.size&&opts.size.depth)||d.depth;
    var sx=tw/size.x, sy=th/size.y, sz=td/size.z;
    if(d.shape==='round'){ var sr=(tw+td)/(size.x+size.z); sx=sz=sr; }
    var root=new THREE.Group();
    var labels=art.children.filter(function(o){ return o.isSprite; });
    var topY=(solidBox(art, art).max.y-b.min.y)*sy;
    labels.forEach(function(l){ art.remove(l); root.add(l); l.position.set(0, topY+LABEL_GAP+(l.userData.worldH||0)/2, 0); });
    root.add(art);
    art.scale.set(sx,sy,sz);
    art.position.set(-c.x*sx, -b.min.y*sy, -c.z*sz);
    root.userData=art.userData;   // SHARED: the art's hooks keep reading their own userData
    var fit={ sx:sx, sy:sy, sz:sz, art:art,
      // a point in DRAWING units → the root's world-unit frame
      toWorld:function(x,y,z){ return new THREE.Vector3(x*sx+art.position.x, y*sy+art.position.y, z*sz+art.position.z); } };
    root.userData.fit=fit;
    if(opts.pivot==='origin') root.userData.pivotAt='tip';   // a tool: origin = its working tip
    return root;
  }
  // a box with NO top face (a tank, basin or liner you can see and lower things into) —
  // the old way hid the +y face with an invisible material, but its triangles were still
  // there for anything lowered in to pass through.
  function openTopBox(w,h,d){
    var g=new THREE.BoxGeometry(w,h,d);
    var top=g.groups[2], idx=g.index.array, keep=[];
    for(var i=0;i<idx.length;i++){ if(i<top.start || i>=top.start+top.count) keep.push(idx[i]); }
    g.setIndex(keep); g.clearGroups(); g.addGroup(0,keep.length,0);
    return g;
  }
  // a flat slab w × d, thickness h, with round holes (x,z,r) cut through it — a block top,
  // a rack, a plate deck: the holes are REAL openings, not dark discs on a solid.
  function slabWithHoles(w,h,d,holes,seg){
    var sh=new THREE.Shape();
    sh.moveTo(-w/2,-d/2); sh.lineTo(w/2,-d/2); sh.lineTo(w/2,d/2); sh.lineTo(-w/2,d/2); sh.lineTo(-w/2,-d/2);
    for(var i=0;i<holes.length;i++){ var hp=new THREE.Path(); hp.absarc(holes[i][0],-holes[i][1],holes[i][2],0,Math.PI*2,true); sh.holes.push(hp); }
    var g=new THREE.ExtrudeGeometry(sh,{ depth:h, bevelEnabled:false, curveSegments:seg||20 });
    g.rotateX(-Math.PI/2);   // extrude along +y; shape y = −world z
    return g;
  }
  function tagSpec(grp, id){ grp.userData.spec=id; grp.userData.canonicalSize=solidBox(grp, grp).getSize(new THREE.Vector3()); return grp; }

export { fx, LABEL_GAP, CUTAWAY_OPACITY, declareCutaway, fitArt, openTopBox, slabWithHoles, tagSpec }
