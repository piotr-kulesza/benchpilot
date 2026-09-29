// ─────────────────────────────────────────────────────────────────────────
// demoScene.js — lifted VERBATIM from demos/neutrophil-rna-extraction.html.
//
// The ONLY changes from the demo source are the required modern-three ports:
//   • the r128 global THREE.* now comes from `import * as THREE from 'three'`
//   • texture  .encoding = THREE.sRGBEncoding  →  .colorSpace = THREE.SRGBColorSpace
//   • the shader chunk  opaque_fragment  →  opaque_fragment  (in fresnelize)
// Every number, lathe profile, material value and animation line is IDENTICAL.
//
// `renderer` is a module global set by the React layer (as it was in the demo's
// scene scope) so buildEnvMap() can build its PMREM env map.
// ─────────────────────────────────────────────────────────────────────────
/* eslint-disable */
import * as THREE from 'three'
import { resolveScenePreset } from './scenePresets.js'
import { exitLiftPoint } from '../vessel/sceneRecipe.js'
import { streams } from './rng.js'
import { solidBox } from './solids.js'
import { dims, clearance } from './dims.js'
import { addSocket, placeInto, placeOnBench, clearPlacement, getSocket, socketPose, canPlace } from './sockets.js'

// Height (world Y) a sample rises to when it leaves a docked instrument, before it
// glides on — clears the centrifuge lid (its own lift is y≈2.15) and every other device.
const EXIT_CLEAR_Y = 2.15

let renderer = null
export function setRenderer(r) { renderer = r }

// The demo's scene-scope singletons that its choreography (stationReagent /
// stationSpin / SAMPLE) closes over — set by the React layer, exactly as the
// demo's `scene` / `SAMPLE` / `SNAP_SAMPLE` globals.
let scene = null
let SNAP_SAMPLE = false
let SAMPLE = null
export function setScene(s) { scene = s }
export function setSnap(v) { SNAP_SAMPLE = v }
export function initSample() { SAMPLE = buildSample(); return SAMPLE }
export function getSample() { return SAMPLE }

// ── PREP VESSELS — a prepared mixture is a SECOND travelling object, on the SAME rails
// as the sample. Built ONCE at its `prepare` station, it persists on the bench with the
// mixture it ended up holding, and is CARRIED (glided, never teleported) to the station
// that draws from it. Keyed by the parsed `produces` id. Reuses the sample's tPos/glide
// machinery: the frame loop eases each prep toward its tPos, snapping only on a jump.
let PREPS = {}
function disposePrep(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) { for (const k in m) { const t = m[k]; if (t && t.isTexture) t.dispose() } m.dispose?.() }
  })
}
export function initPreps() {
  for (const id in PREPS) { const v = PREPS[id]; if (scene) scene.remove(v); disposePrep(v) }
  PREPS = {}
}
// Create the prep tube ONCE (idempotent — a rebuild returns the existing object so it is
// never duplicated). Parented to the scene (world coords) so it can travel between stations.
export function makePrep(id, opts = {}) {
  if (PREPS[id]) return PREPS[id]
  const v = buildTube(opts)
  v.userData.noFrame = true
  v.userData.tPos = v.position.clone()
  if (scene) scene.add(v)
  PREPS[id] = v
  return v
}
export function getPrep(id) { return PREPS[id] || null }
export function getPreps() { return Object.values(PREPS) }
export function setPrepVisible(id, vis) { const v = PREPS[id]; if (v) v.visible = !!vis }
// set a prep's travel target — snap on a jump (SNAP_SAMPLE), glide otherwise, exactly
// like S.at for the sample.
export function prepAt(id, x, y, z) {
  const v = PREPS[id]; if (!v) return
  v.userData.tPos.set(x, y, z)
  if (SNAP_SAMPLE) v.position.set(x, y, z)
}
// If a step change interrupts a spin, the sample may still be parented into a
// centrifuge rotor slot — return every vessel to the scene (upright, full size).
// The sample NEVER teleports: when `lift` is set (a sequential Next), a vessel that
// was docked rises STRAIGHT UP out of the instrument (an `exitLift` waypoint the frame
// loop honours before the normal glide) so it never drags diagonally through the rotor
// or the lid. On a jump (`lift` false) we just free it — a jump is allowed to snap.
export function undockSample(lift = false) {
  if (!SAMPLE || !scene) return
  for (const v of SAMPLE.vessels) {
    const wasDocked = v.userData.docked
    if (v.parent && v.parent !== scene) scene.attach(v)
    if (wasDocked) {
      v.userData.docked = false; v.rotation.set(0, 0, 0); v.scale.setScalar(1)
      if (lift) {
        const lp = exitLiftPoint(v.position, EXIT_CLEAR_Y)
        v.userData.exitLift = (v.userData.exitLift || new THREE.Vector3()).set(lp.x, lp.y, lp.z)
      } else {
        v.userData.exitLift = null
      }
    } else {
      v.userData.exitLift = null
    }
  }
}

  var LOOK = {
    // CINEMATIC is the one and only look (the isometric alt-view was removed).
    cinematic:{
      // BRIGHT REAL LAB under fluorescent panels: high ambient + hemi for even, fairly FLAT
      // fill; a soft near-white key for gentle soft shadows only — NO dark surroundings, NO
      // teal rim. Colour comes from the scattered saturated props, not from a grade.
      // bright room, but NOT a white flood: the near-white fog + heavy flat fill was
      // laying a milky veil over everything and washing the props to pastel. Fog is now a
      // faint touch, the flood is roughly halved, and the key stays strong for form/shading
      // so the saturated props actually read as saturated.
      // Was massively OVER-LIT and flat → every real colour blew to pale pastel (a navy stand
      // rendered baby-blue) with no shadow. Cut the flat fill hard, keep ONE strong key →
      // real shadow-to-highlight range = contrast, and true saturated colour.
      // Stage 24 — dark epoxy bench, dramatic light. The station is a SUBJECT: one strong
      // warm key from the side, deep dark cool fills, a cool rim on the glass, edges falling
      // into shadow (warm near-black fog). Exposure stays 0.78 (guardrail — never ACES).
      fog:{ color:0x120f0b, density:0.0034 }, exposure:0.78,
      amb:{ color:0xd6d9de, int:0.035 }, hemi:{ sky:0xc4ccd8, ground:0x241f18, int:0.045 },
      key:{ color:0xfff1de, int:1.62 }, fill:{ color:0xc2cee2, int:0.08, pos:[-8,4,9] },
      aux:{ color:0xdfe0da, int:0.05, pos:[-3,11,-6] },
      // rim/edge light — from behind the subject, cool; against the dark bench a bright rim
      // on a vessel's shoulder is the single most valuable highlight in the frame. Kept
      // modest so it catches edges without flooding (and greying) the bench.
      rim:{ color:0xe3ecff, int:0.9, pos:[-6,5.5,-8] }
    }
  };

  /* production-line geometry */
  var SPACING = 8.4;                 // distance between stations along +X
  var BLOCK_TOP = 0.45;              // cold-block plate height

  /* The palette. `COL` is the LIVE palette structural materials are built from once;
     travelling-sample liquids read it live every frame. (The isometric alt-palette that
     used to swap in on a view switch was removed with the isometric view.) */
  var COL_CINE = {
    lysis:  0x02b6a0,   // saturated teal   (RLT + β-ME)
    etoh:   0x1f8bf2,   // clear blue       (70% ethanol)
    wash:   0x5061db,   // periwinkle-blue  (RW1 / RPE)
    dnase:  0xf2a208,   // rich amber       (DNase I)
    rna:    0x12c46c,   // vivid RNA green  (eluate / RNA)
    water:  0x53b4ef,   // clear sky blue   (RNase-free water)
    pellet: 0xe07f1f,   // neutrophil pellet (warm amber)
    glass:  0xdce6ec,
    steel:  0x9aa4b0,
    accent: 0x1fb8a2
  };
  var COL = {};
  (function(s){ for(var k in s) COL[k]=s[k]; })(COL_CINE);   // COL is the cinematic palette

  /* helpers */
  function lerp(a,b,t){ return a + (b-a)*t; }
  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function easeInOut(t){ t=clamp(t,0,1); return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
  var MAX_ANISO = 8;
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

  function radialTex(stops){
    var c=document.createElement("canvas"); c.width=128; c.height=128;
    var g=c.getContext("2d");
    var grad=g.createRadialGradient(64,64,0,64,64,64);
    for(var i=0;i<stops.length;i++) grad.addColorStop(stops[i][0],stops[i][1]);
    g.fillStyle=grad; g.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  var GLOW_TEX = null, DUST_TEX = null;
  // muted "glow" — really just a soft, low-opacity light bloom (no neon)
  function addGlow(color, size, opacity){
    var m=new THREE.SpriteMaterial({ map:GLOW_TEX, color:color, transparent:true,
      opacity:opacity==null?0.18:opacity, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:true });
    var s=new THREE.Sprite(m); s.scale.set(size,size,1); return s;
  }

  function roundRect(g,x,y,w,h,r){
    g.beginPath();
    g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
    g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
  }
  // floating vessel label — muted editorial card
  // The floating station label. The plate is sized FROM the measured text (never a
  // fixed sprite the text can overflow) — it grows to fit, the text never shrinks or
  // clips, and the two-line case (name + volume) grows the plate taller. The name is
  // IBM Plex Sans; the sub line is a numeric/spec (volume, ×g, temp) so it uses IBM
  // Plex Mono. Requires the faces loaded before first draw (StationView gates the
  // canvas on document.fonts.ready) — else measureText + fillText bake the fallback.
  function makeLabel(text, sub){
    var SS=2;                              // supersample the canvas for crisp text
    var FS=42*SS, FSS=26*SS;               // main / sub px
    var PADX=40*SS, PADY=26*SS, GAP=10*SS, LG=6*SS, RAD=16*SS;  // pad / line gaps
    var MAXW=680*SS, MINW=300*SS;          // wrap past MAXW; short labels get MINW presence
    var PIX=0.0032/SS;                     // world units per device px (overall label size)
    var FMAIN="500 "+FS+"px 'IBM Plex Sans'";
    var FSUB="500 "+FSS+"px 'IBM Plex Mono'";
    var c=document.createElement("canvas");
    var g=c.getContext("2d");
    var tex=null, sp=null;
    // wrap `t` to lines that fit `maxW` in the current font — never shrink a glyph,
    // grow DOWN instead (a long reagent name wraps rather than blowing the plate wide).
    function wrap(t, font, maxW){
      g.font=font;
      var words=String(t||"").split(/\s+/).filter(Boolean), lines=[], cur="";
      for(var i=0;i<words.length;i++){
        var t2=cur?cur+" "+words[i]:words[i];
        if(cur && g.measureText(t2).width>maxW){ lines.push(cur); cur=words[i]; }
        else cur=t2;
      }
      if(cur) lines.push(cur);
      return lines;
    }
    function widest(lines, font){ g.font=font; var w=0; for(var i=0;i<lines.length;i++) w=Math.max(w,g.measureText(lines[i]).width); return w; }
    function draw(t2,s2){
      // NOTHING to say -> NO plate: an empty label used to paint a blank dark bar that
      // floated over the vessel (the cryovial) carrying no information
      if(!String(t2||"").trim() && !String(s2||"").trim()){
        c.width=4; c.height=4; g=c.getContext("2d"); g.clearRect(0,0,4,4);
        if(tex) tex.needsUpdate=true;
        if(sp){ sp.scale.set(0.0001,0.0001,1); sp.userData.worldH=0; }
        return;
      }
      var mLines=wrap(t2, FMAIN, MAXW);          // name (may wrap)
      var sLines=s2?wrap(s2, FSUB, MAXW):[];      // volume / spec (mono, may wrap)
      var textW=Math.max(widest(mLines,FMAIN), widest(sLines,FSUB));
      var mH=mLines.length*FS + (mLines.length-1)*LG;
      var sH=sLines.length?(sLines.length*FSS + (sLines.length-1)*LG):0;
      var textH=mH + (sLines.length?GAP+sH:0);
      var cw=Math.ceil(Math.max(textW,MINW)+PADX*2), ch=Math.ceil(textH+PADY*2);
      c.width=cw; c.height=ch; g=c.getContext("2d");   // resize resets the context
      g.clearRect(0,0,cw,ch);
      var b=1.5*SS;
      g.fillStyle="rgba(20,23,27,0.82)"; roundRect(g,b,b,cw-2*b,ch-2*b,RAD); g.fill();
      g.lineWidth=b; g.strokeStyle="rgba(150,160,175,0.28)"; roundRect(g,b,b,cw-2*b,ch-2*b,RAD); g.stroke();
      g.textAlign="center"; g.textBaseline="middle";
      var y=PADY;
      g.fillStyle="#e9edf1"; g.font=FMAIN;
      for(var i=0;i<mLines.length;i++){ g.fillText(mLines[i], cw/2, y+FS/2); y+=FS+LG; }
      if(sLines.length){ y+=GAP-LG; g.fillStyle="#8fcabf"; g.font=FSUB;
        for(var j=0;j<sLines.length;j++){ g.fillText(sLines[j], cw/2, y+FSS/2); y+=FSS+LG; } }
      if(tex) tex.needsUpdate=true;
      if(sp){ sp.scale.set(cw*PIX, ch*PIX, 1); sp.userData.worldH=ch*PIX; }
    }
    draw(text, sub);                       // size + paint the canvas once
    tex=new THREE.CanvasTexture(c); tex.anisotropy=MAX_ANISO;
    sp=new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false, depthWrite:false }));
    sp.renderOrder=999;
    if(c.width>4){ sp.scale.set(c.width*PIX, c.height*PIX, 1); sp.userData.worldH=c.height*PIX; }
    else { sp.scale.set(0.0001,0.0001,1); sp.userData.worldH=0; }
    sp.userData.update=function(t2,s2){ draw(t2,s2); };
    return sp;
  }

  // vertical vertex-colour gradient for a liquid volume
  function tintGradient(geo, lo, hi){
    var p=geo.attributes.position, n=p.count;
    var col=new Float32Array(n*3);
    var ymin=Infinity, ymax=-Infinity, i;
    for(i=0;i<n;i++){ var y=p.getY(i); if(y<ymin)ymin=y; if(y>ymax)ymax=y; }
    var span=(ymax-ymin)||1;
    for(i=0;i<n;i++){
      var t=(p.getY(i)-ymin)/span, v=lerp(lo,hi,t);
      col[i*3]=v; col[i*3+1]=v; col[i*3+2]=v;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col,3));
  }

  /* ---- liquid that CONFORMS to its vessel's interior ---------------------
     A vessel's glass is a lathe of a 2D profile (x = radius, y = height). Its
     liquid must obey the SAME contour, not a floating cylinder. `innerRadiusFn`
     samples that profile (slightly inset so the fluid reads as inside the wall);
     `liquidProfileGeo` revolves the inner profile from the vessel bottom up to
     the fill line and caps it FLAT there — wide where the vessel is wide,
     narrow where it tapers, no dome. */
  function innerRadiusFn(profPts, inset){
    inset = (inset==null)?0.9:inset;
    return function(y){
      if(y<=profPts[0].y) return profPts[0].x*inset;
      for(var i=1;i<profPts.length;i++){
        if(y<=profPts[i].y){
          var a=profPts[i-1], b=profPts[i], t=(y-a.y)/((b.y-a.y)||1);
          return (a.x+(b.x-a.x)*t)*inset;
        }
      }
      return profPts[profPts.length-1].x*inset;
    };
  }
  function liquidProfileGeo(innerR, y0, yTop, seg){
    seg = seg||48;
    if(yTop <= y0+0.001) yTop = y0+0.001;
    var steps=16, pts=[], i;
    pts.push(new THREE.Vector2(0.0006, y0));                 // centre of the bottom
    for(i=0;i<=steps;i++){
      var y=y0+(yTop-y0)*(i/steps);
      pts.push(new THREE.Vector2(Math.max(innerR(y),0.0008), y));   // follow the inner wall
    }
    pts.push(new THREE.Vector2(0.0006, yTop));               // flat top at the fill line
    return new THREE.LatheGeometry(pts, seg);
  }

  /* ============================================================
     0b · SHARED PROCEDURAL PBR MAPS  (built once, reused everywhere)
        brushed-aluminium anisotropy · plastic micro-roughness ·
        knurl · epoxy benchtop — all as normal + roughness canvases.
     ============================================================ */
  var TEX = {};   // lazily-built shared texture cache
  function _cv(w,h){ var c=document.createElement("canvas"); c.width=w; c.height=h; return c; }
  function _finish(c, rep){
    var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping;
    if(rep) t.repeat.set(rep[0],rep[1]); t.anisotropy=MAX_ANISO; return t;
  }
  // brushed metal: horizontal anisotropic streaks perturbing the tangent normal
  function makeBrushedNormal(){
    var c=_cv(512,512), g=c.getContext("2d");
    g.fillStyle="rgb(128,128,255)"; g.fillRect(0,0,512,512);
    for(var i=0;i<3400;i++){
      var y=Math.random()*512, x=Math.random()*512, len=30+Math.random()*380;
      var dev=(Math.random()-0.5)*70;                    // lateral normal tilt
      g.strokeStyle="rgba("+Math.round(128+dev)+",128,255,0.05)";
      g.lineWidth=0.6+Math.random()*1.1;
      g.beginPath(); g.moveTo(x,y); g.lineTo(x+len,y+(Math.random()-0.5)*1.2); g.stroke();
    }
    return _finish(c,[3,3]);
  }
  // brushed metal roughness: streaky bright/dull grain + faint edge wear specks
  function makeBrushedRough(base){
    var c=_cv(512,512), g=c.getContext("2d");
    var b=Math.round((base==null?0.4:base)*255);
    g.fillStyle="rgb("+b+","+b+","+b+")"; g.fillRect(0,0,512,512);
    for(var i=0;i<2600;i++){
      var y=Math.random()*512, x=Math.random()*512, len=40+Math.random()*360;
      var v=Math.round(clamp((base==null?0.4:base)+(Math.random()-0.5)*0.34,0,1)*255);
      g.strokeStyle="rgba("+v+","+v+","+v+",0.08)";
      g.lineWidth=0.6+Math.random(); g.beginPath();
      g.moveTo(x,y); g.lineTo(x+len,y); g.stroke();
    }
    for(var w=0;w<260;w++){ var wv=Math.round((0.75+Math.random()*0.25)*255);
      g.fillStyle="rgba("+wv+","+wv+","+wv+",0.10)";
      g.fillRect(Math.random()*512,Math.random()*512,1.4,1.4); }
    return _finish(c,[3,3]);
  }
  // fine matte-plastic micro roughness (subtle speckle, no directionality)
  function makePlasticRough(base){
    var c=_cv(256,256), g=c.getContext("2d");
    var b=Math.round((base==null?0.6:base)*255);
    g.fillStyle="rgb("+b+","+b+","+b+")"; g.fillRect(0,0,256,256);
    for(var i=0;i<9000;i++){ var v=Math.round(clamp((base==null?0.6:base)+(Math.random()-0.5)*0.18,0,1)*255);
      g.fillStyle="rgba("+v+","+v+","+v+",0.5)"; g.fillRect(Math.random()*256,Math.random()*256,1,1); }
    return _finish(c,[2,2]);
  }
  // knurl normal (diagonal cross-hatch) for thumbwheels / grips
  function makeKnurlNormal(){
    var c=_cv(128,128), g=c.getContext("2d");
    g.fillStyle="rgb(128,128,255)"; g.fillRect(0,0,128,128);
    g.lineWidth=1.4;
    for(var d=-128;d<128;d+=6){
      g.strokeStyle="rgba(172,128,255,0.5)"; g.beginPath(); g.moveTo(d,0); g.lineTo(d+128,128); g.stroke();
      g.strokeStyle="rgba(84,128,255,0.5)"; g.beginPath(); g.moveTo(d,128); g.lineTo(d+128,0); g.stroke();
    }
    return _finish(c,[10,2]);
  }
  function buildSharedMaps(){
    TEX.brushedN = makeBrushedNormal();
    TEX.brushedR = makeBrushedRough(0.4);
    TEX.anodR    = makeBrushedRough(0.5);
    TEX.plasticR = makePlasticRough(0.62);
    TEX.knurlN   = makeKnurlNormal();
  }

  /* ============================================================
     1 · MATERIAL LIBRARY — realistic PBR, muted, varied roughness
     ============================================================ */
  // r128: MeshPhysicalMaterial.transmission does not render, so glass is faked with
  // real alpha + a restrained fresnel rim and the env map. Liquids are opaque meshes
  // drawn in the opaque pass so the level reads through the wall.
  function fresnelize(mat){
    mat.onBeforeCompile = function(shader){
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        [ "float rimF = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);",
          "outgoingLight += vec3(0.62,0.68,0.74) * rimF * 0.45;",   // neutral, restrained edge
          "diffuseColor.a = clamp(diffuseColor.a + rimF * 0.30, 0.0, 1.0);",
          "#include <opaque_fragment>" ].join("\n")
      );
    };
    mat.customProgramCacheKey = function(){ return "glassFresnelMuted"; };
    return mat;
  }
  function glassMaterial(){
    return fresnelize(new THREE.MeshPhysicalMaterial({
      color: COL.glass, metalness:0, roughness:0.08,
      transparent:true, opacity:0.24,
      clearcoat:1, clearcoatRoughness:0.06,
      envMapIntensity:1.35, reflectivity:0.4,
      side:THREE.DoubleSide, depthWrite:false
    }));
  }
  function matFrosted(color){            // frosted / translucent polypropylene
    return new THREE.MeshPhysicalMaterial({ color:color||0xdfe6ee, metalness:0, roughness:0.62,
      transparent:true, opacity:0.62, clearcoat:0.2,
      clearcoatRoughness:0.6, envMapIntensity:0.7, side:THREE.DoubleSide, depthWrite:false });
  }
  function matPlastic(color){           // matte moulded plastic
    var m=new THREE.MeshStandardMaterial({ color:color, metalness:0.03, roughness:0.62, envMapIntensity:0.7 });
    if(TEX.plasticR){ m.roughnessMap=TEX.plasticR; }
    return m;
  }
  function matRubber(color){            // matte silicone
    var m=new THREE.MeshStandardMaterial({ color:color, metalness:0.0, roughness:0.92, envMapIntensity:0.35 });
    if(TEX.plasticR){ m.roughnessMap=TEX.plasticR; }
    return m;
  }
  function matSilicone(color){          // soft translucent silicone tip
    return new THREE.MeshPhysicalMaterial({ color:color, roughness:0.4,
      transparent:true, opacity:0.5, clearcoat:0.35, envMapIntensity:0.7, side:THREE.DoubleSide, depthWrite:false });
  }
  function matAnodized(color){          // anodized aluminium (cold block)
    var m=new THREE.MeshStandardMaterial({ color:color, metalness:0.72, roughness:0.44, envMapIntensity:1.0 });
    if(TEX.brushedN){ m.normalMap=TEX.brushedN; m.normalScale=new THREE.Vector2(0.28,0.28); m.roughnessMap=TEX.anodR; }
    return m;
  }
  function matBrushed(color){           // brushed steel / rotor
    var m=new THREE.MeshStandardMaterial({ color:color, metalness:0.85, roughness:0.36, envMapIntensity:1.15 });
    if(TEX.brushedN){ m.normalMap=TEX.brushedN; m.normalScale=new THREE.Vector2(0.42,0.42); m.roughnessMap=TEX.brushedR; }
    return m;
  }
  function matPainted(color, r){        // painted instrument shell
    var m=new THREE.MeshPhysicalMaterial({ color:color, metalness:0.15, roughness:r==null?0.52:r,
      clearcoat:0.4, clearcoatRoughness:0.4, envMapIntensity:0.85 });
    if(TEX.plasticR){ m.roughnessMap=TEX.plasticR; }
    return m;
  }

  function tubeGraphicTex(label){
    var c=document.createElement("canvas"); c.width=512; c.height=512;
    var g=c.getContext("2d");
    g.clearRect(0,0,512,512);
    g.strokeStyle="rgba(180,192,206,0.6)"; g.lineCap="round";
    for(var i=0;i<9;i++){
      var y=150+i*34, major=(i%2===0);
      g.lineWidth=major?4:2.4;
      g.beginPath(); g.moveTo(150,y); g.lineTo(major?196:180,y); g.stroke();
    }
    g.fillStyle="rgba(190,200,214,0.5)"; g.font="600 20px 'IBM Plex Sans'"; g.textAlign="left";
    var vals=["1.5","","1.0","","0.5",""];
    for(var k=0;k<vals.length;k++){ if(vals[k]) g.fillText(vals[k], 204, 156+k*68); }
    var lx=250, ly=196, lw=150, lh=118;
    g.fillStyle="rgba(238,241,244,0.92)"; roundRect(g,lx,ly,lw,lh,10); g.fill();
    g.strokeStyle="rgba(140,150,166,0.5)"; g.lineWidth=2; roundRect(g,lx,ly,lw,lh,10); g.stroke();
    g.fillStyle="#20252c"; g.font="italic 600 30px 'IBM Plex Sans'"; g.textAlign="center";
    g.fillText(label||"", lx+lw/2, ly+52);
    g.strokeStyle="rgba(120,130,146,0.35)"; g.lineWidth=1.5;
    g.beginPath(); g.moveTo(lx+16,ly+78); g.lineTo(lx+lw-16,ly+78); g.stroke();
    g.beginPath(); g.moveTo(lx+16,ly+96); g.lineTo(lx+lw-30,ly+96); g.stroke();
    var t=new THREE.CanvasTexture(c); t.anisotropy=MAX_ANISO;
    return t;
  }

  /* ---------- conical microcentrifuge tube ---------- */
  function buildTube(opts){
    opts = opts || {};
    // REAL SIZE: height + body diameter from dimensions.json (opts.spec, default the
    // 1.5 mL microtube). The profile's straight body is R*0.955, so R is chosen to make
    // that body's outer diameter the table's; every other number below is a proportion.
    var D = dims(opts.spec || 'microtube_1_5');
    var H = D.height;
    var R = D.radius/0.955;
    var grp = new THREE.Group();
    var visual = new THREE.Group(); grp.add(visual);

    var glassMat = glassMaterial();
    var prof = [
      new THREE.Vector2(0.0, 0.0),           // rounded bell bottom (was a sharp point)
      new THREE.Vector2(R*0.22, H*0.010),
      new THREE.Vector2(R*0.42, H*0.038),
      new THREE.Vector2(R*0.60, H*0.088),
      new THREE.Vector2(R*0.75, H*0.155),
      new THREE.Vector2(R*0.87, H*0.245),
      new THREE.Vector2(R*0.93, H*0.34),
      new THREE.Vector2(R*0.955, H*0.45),
      new THREE.Vector2(R*0.955, H*0.90),
      new THREE.Vector2(R*0.985, H*0.945),
      new THREE.Vector2(R*1.06, H*0.985),
      new THREE.Vector2(R*1.05, H)
    ];
    var wall = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), glassMat);
    wall.castShadow=true; visual.add(wall);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(R*1.02,R*0.075,12,48), glassMat);
    rim.rotation.x=Math.PI/2; rim.position.y=H; visual.add(rim);

    // frosted writing patch moulded into the front wall
    var patchMat = new THREE.MeshStandardMaterial({ color:0xe9edf1, roughness:0.92, metalness:0,
      transparent:true, opacity:0.82, envMapIntensity:0.15, side:THREE.DoubleSide });
    var patch = new THREE.Mesh(new THREE.CylinderGeometry(R*0.965,R*0.9,H*0.30,20,1,true, Math.PI*0.5-0.62, 1.24), patchMat);
    patch.position.y=H*0.6; fx(patch,'decal'); visual.add(patch);

    if(opts.grads!==false){
      var gMat = new THREE.MeshStandardMaterial({ map:tubeGraphicTex(opts.label||""), transparent:true,
        roughness:0.7, metalness:0, envMapIntensity:0.25, depthWrite:false, side:THREE.DoubleSide });
      var grad = new THREE.Mesh(new THREE.CylinderGeometry(R*0.99,R*0.9,H*0.7,48,1,true), gMat);
      grad.position.y=H*0.5; fx(grad,'decal'); visual.add(grad);
      grp.userData.gradMat = gMat;
    }

    // IMPROVEMENT: the sample vessel is CAPLESS (no cap mesh, no setCap). The demo's
    // ported cap/toggle was dropped — the sample is an open tube throughout.

    // liquid conforms to the tube's INNER wall (a slightly inset copy of `prof`),
    // rebuilt as a flat-topped lathe whenever the fill level changes.
    var innerFn   = innerRadiusFn(prof, 0.90);
    var liqBottom = H*0.018;
    var liqFillMax= H*0.90;                 // fill line at full level
    var liqMat = new THREE.MeshPhysicalMaterial({
      color: opts.color||COL.lysis, metalness:0, roughness:0.32, vertexColors:true,
      transparent:false, emissive: opts.color||COL.lysis, emissiveIntensity:0.14,
      clearcoat:0.35, clearcoatRoughness:0.4, envMapIntensity:0.7
    });
    var liq = new THREE.Mesh(new THREE.BufferGeometry(), liqMat);
    liq.visible=false; fx(liq,'fluid'); visual.add(liq);

    var condens=null;
    if(opts.cold){
      condens=new THREE.Group();
      var dMat=new THREE.MeshPhysicalMaterial({ color:0xd6e2ea, roughness:0.08,
        transparent:true, opacity:0.42, envMapIntensity:1.0, depthWrite:false });
      var dGeo=new THREE.SphereGeometry(1,10,8);
      for(var dc=0;dc<22;dc++){
        var da=Math.random()*Math.PI*2, dy=H*(0.2+Math.random()*0.65), ds=R*(0.037+Math.random()*0.0625);
        var dm=new THREE.Mesh(dGeo,dMat);
        dm.position.set(Math.cos(da)*R*0.99, dy, Math.sin(da)*R*0.99);
        dm.scale.set(ds,ds*1.5,ds); fx(dm,'effect'); condens.add(dm);
      }
      visual.add(condens);
    }

    var label=null;
    if(opts.label!==false){
      label=makeLabel(opts.label||"", opts.sub||"");
      label.position.set(0, H+LABEL_GAP, 0);
      grp.add(label);
    }

    var state={ level:0,tLevel:0,builtLevel:-1,color:new THREE.Color(opts.color||COL.lysis),tColor:new THREE.Color(opts.color||COL.lysis),H:H,R:R,phase:Math.random()*6.28 };
    grp.userData.state=state; grp.userData.liq=liq; grp.userData.label=label;
    grp.userData.setLevel=function(v){ state.tLevel=clamp(v,0,1); };
    grp.userData.setColor=function(hex){ state.tColor.set(hex); };
    grp.userData.setLabel=function(t,s){ if(label) label.userData.update(t,s||"");
      if(grp.userData.gradMat){ grp.userData.gradMat.map.dispose(); grp.userData.gradMat.map=tubeGraphicTex(t); grp.userData.gradMat.needsUpdate=true; } };
    grp.userData.update=function(dt){
      var kL=1-Math.pow(0.001,dt), kC=1-Math.pow(0.004,dt);
      state.level=lerp(state.level,state.tLevel,kL);
      state.color.lerp(state.tColor,kC);
      var lv=state.level;
      if(lv<0.004){ liq.visible=false; }
      else{
        liq.visible=true;
        if(Math.abs(lv-state.builtLevel)>0.004){
          state.builtLevel=lv;
          var yTop=liqBottom + lv*(liqFillMax-liqBottom);
          var geo=liquidProfileGeo(innerFn, liqBottom, yTop, 48);
          tintGradient(geo,0.55,1.05);
          liq.geometry.dispose(); liq.geometry=geo;
        }
        liqMat.color.copy(state.color); liqMat.emissive.copy(state.color);
      }
    };
    grp.userData.visual=visual;
    // where a pipette delivers: the MOUTH (top centre) and how deep the tip goes in
    grp.userData.mouth={ x:0, y:H, z:0, approach:'top' };
    grp.userData.entry=H*0.32;
    return tagSpec(grp, D.id);
  }

  /* ---------- air-displacement micropipette ---------- */
  function buildPipette(){
    var grp = new THREE.Group();
    var bodyMat  = matPainted(0xd8dee6, 0.42);
    var accentMat= new THREE.MeshStandardMaterial({ color:0x4c6470, metalness:0.3, roughness:0.44, envMapIntensity:0.8 });
    var darkMat  = matPlastic(0x232a33);
    var steelMat = matBrushed(0xaab2be);

    var bp = [
      new THREE.Vector2(0.0,0.55), new THREE.Vector2(0.135,0.55), new THREE.Vector2(0.152,0.85),
      new THREE.Vector2(0.15,1.35), new THREE.Vector2(0.128,1.7), new THREE.Vector2(0.11,2.0),
      new THREE.Vector2(0.108,2.05)
    ];
    var body = new THREE.Mesh(new THREE.LatheGeometry(bp,48), bodyMat);
    body.castShadow=true; grp.add(body);
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.155,0.14,0.34,40), accentMat);
    band.position.y=0.95; grp.add(band);
    var hook = new THREE.Mesh(new THREE.TorusGeometry(0.12,0.032,14,28,Math.PI*1.2), accentMat);
    hook.position.set(0,1.25,0.12); hook.rotation.x=1.2; grp.add(hook);

    var winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.13,0.2,0.04), darkMat);
    winFrame.position.set(0,1.05,0.14); winFrame.rotation.x=-0.05; grp.add(winFrame);
    var vc=document.createElement("canvas"); vc.width=128; vc.height=180; var vg=vc.getContext("2d");
    vg.fillStyle="#131920"; vg.fillRect(0,0,128,180);
    vg.fillStyle="#9fb0ba"; vg.font="700 62px 'IBM Plex Mono'"; vg.textAlign="center";
    vg.fillText("3",64,58); vg.fillText("5",64,118); vg.fillText("0",64,178);
    var vTex=new THREE.CanvasTexture(vc); vTex.anisotropy=MAX_ANISO;
    var win=new THREE.Mesh(new THREE.PlaneGeometry(0.1,0.16), new THREE.MeshBasicMaterial({map:vTex,transparent:true}));
    win.position.set(0,1.05,0.162); win.rotation.x=-0.05; fx(win,'decal'); grp.add(win);

    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.34,22), steelMat);
    shaft.position.y=2.22; grp.add(shaft);
    var plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.115,0.1,0.14,28), accentMat);
    plunger.position.y=2.45; grp.add(plunger);
    var pbtn = new THREE.Mesh(new THREE.SphereGeometry(0.11,24,18,0,Math.PI*2,0,Math.PI*0.6), matRubber(0x2a323c));
    pbtn.position.y=2.5; grp.add(pbtn);

    var ejCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,0.1,28), darkMat);
    ejCollar.position.y=2.02; grp.add(ejCollar);
    var ejBtn = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.16,0.09), accentMat);
    ejBtn.position.set(0.14,2.1,0); grp.add(ejBtn);
    var ejArm = new THREE.Mesh(new THREE.BoxGeometry(0.035,1.5,0.05), steelMat);
    ejArm.position.set(0.135,1.25,0); grp.add(ejArm);

    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.04,0.5,24), bodyMat);
    stem.position.y=0.3; grp.add(stem);
    var cone = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.028,0.16,24), steelMat);
    cone.position.y=0.02; grp.add(cone);

    var tipMat = matSilicone(0xe6eef4); tipMat.opacity=0.42;
    var tp=[
      new THREE.Vector2(0.0,-0.86), new THREE.Vector2(0.014,-0.8), new THREE.Vector2(0.05,-0.2),
      new THREE.Vector2(0.08,0.02), new THREE.Vector2(0.11,0.02), new THREE.Vector2(0.115,-0.03)
    ];
    var tip = new THREE.Mesh(new THREE.LatheGeometry(tp,32), tipMat);
    tip.castShadow=true; grp.add(tip);

    var fluidMat = new THREE.MeshPhysicalMaterial({ color:COL.lysis, roughness:0.32,
      transparent:false, emissive:COL.lysis, emissiveIntensity:0.06, envMapIntensity:0.6 });
    var fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.058,0.016,0.6,24), fluidMat);
    fluid.position.y=-0.18; fluid.scale.y=0.0001; fluid.visible=false; fx(fluid,'fluid'); grp.add(fluid);
    var drop = new THREE.Mesh(new THREE.SphereGeometry(0.03,16,12), fluidMat);
    drop.scale.set(1,1.3,1); drop.position.y=-0.9; drop.visible=false; fx(drop,'fluid'); grp.add(drop);

    // knurled volume-adjustment thumbwheel (its digits show in the window above)
    var dialMat = matBrushed(0x8a94a0);
    if(TEX.knurlN){ dialMat.normalMap=TEX.knurlN; dialMat.normalScale=new THREE.Vector2(0.55,0.55); }
    var dial = new THREE.Mesh(new THREE.CylinderGeometry(0.148,0.148,0.26,30), dialMat);
    dial.position.y=1.5; grp.add(dial);
    var dialRimA = new THREE.Mesh(new THREE.TorusGeometry(0.15,0.013,10,30), accentMat);
    dialRimA.rotation.x=Math.PI/2; dialRimA.position.y=1.63; grp.add(dialRimA);
    var dialRimB = new THREE.Mesh(new THREE.TorusGeometry(0.15,0.013,10,30), accentMat);
    dialRimB.rotation.x=Math.PI/2; dialRimB.position.y=1.37; grp.add(dialRimB);

    // moulded brand ridge on the body front
    var brandC=document.createElement("canvas"); brandC.width=160; brandC.height=72; var brandG=brandC.getContext("2d");
    brandG.clearRect(0,0,160,72);
    brandG.fillStyle="#516873"; brandG.font="700 34px 'IBM Plex Sans'"; brandG.textAlign="center"; brandG.textBaseline="middle";
    brandG.fillText("P200",80,30);
    brandG.font="500 15px 'IBM Plex Sans'"; brandG.fillStyle="#41535d"; brandG.fillText("20 – 200 µL",80,56);
    var brandTex=new THREE.CanvasTexture(brandC); brandTex.anisotropy=MAX_ANISO;
    var brand=new THREE.Mesh(new THREE.PlaneGeometry(0.18,0.081),
      new THREE.MeshStandardMaterial({ map:brandTex, transparent:true, roughness:0.55, metalness:0, envMapIntensity:0.4 }));
    brand.position.set(0,0.77,0.156); brand.rotation.x=-0.02; fx(brand,'decal'); grp.add(brand);

    // fine graduation printed on the translucent tip
    var tgC=document.createElement("canvas"); tgC.width=64; tgC.height=160; var tgG=tgC.getContext("2d");
    tgG.clearRect(0,0,64,160);
    tgG.strokeStyle="rgba(110,130,142,0.75)"; tgG.lineWidth=2.2; tgG.lineCap="round";
    for(var tgi=0;tgi<5;tgi++){ var yy=44+tgi*20; tgG.beginPath(); tgG.moveTo(8,yy); tgG.lineTo(tgi%2?24:34,yy); tgG.stroke(); }
    var tgTex=new THREE.CanvasTexture(tgC); tgTex.anisotropy=MAX_ANISO;
    var tgRing=new THREE.Mesh(new THREE.CylinderGeometry(0.056,0.041,0.34,20,1,true),
      new THREE.MeshBasicMaterial({ map:tgTex, transparent:true, depthWrite:false, side:THREE.DoubleSide }));
    tgRing.position.y=-0.34; fx(tgRing,'decal'); grp.add(tgRing);

    var rig = new THREE.Group(); rig.position.y=0.86;
    var kids = grp.children.slice();
    for(var ci=0;ci<kids.length;ci++) rig.add(kids[ci]);
    grp.add(rig);

    var st={ fill:0,tFill:0,color:new THREE.Color(COL.lysis),tColor:new THREE.Color(COL.lysis) };
    grp.userData.st=st;
    grp.userData.setFluid=function(v){ st.tFill=clamp(v,0,1); };
    grp.userData.setColor=function(h){ st.tColor.set(h); };
    grp.userData.update=function(dt){
      var prev=st.fill;
      st.fill=lerp(st.fill,st.tFill,1-Math.pow(0.002,dt));
      st.color.lerp(st.tColor,1-Math.pow(0.004,dt));
      fluidMat.color.copy(st.color); fluidMat.emissive.copy(st.color);
      var dispensing = st.tFill<prev-0.0002 && st.fill>0.03;
      drop.visible=dispensing;
      if(dispensing){ var t=performance.now()*0.006; drop.position.y=-0.9-Math.sin(t)*0.01; drop.scale.y=1.3+Math.sin(t*1.3)*0.15; }
      if(st.fill<0.01){ fluid.visible=false; }
      else{ fluid.visible=true; var h=st.fill*0.66; fluid.scale.y=h/0.6; fluid.position.y=-0.8+h/2; }
    };
    // a pipette is positioned by its TIP: its origin is the tip end (the lowest point),
    // not its footprint centre (the finger hook makes it asymmetric) — see PIVOT_AT_TIP
    return tagSpec(fitArt(grp,'pipette_p200',{ pivot:'origin' }),'pipette_p200');
  }

  /* ---------- RNeasy spin column ---------- */
  function buildSpinColumn(){
    var grp = new THREE.Group();
    var clearMat = glassMaterial(); clearMat.opacity=0.28;
    var frostMat = matFrosted(0xe2e9f0); frostMat.opacity=0.5;
    var whiteMat = matPlastic(0xe6ebf0);
    // rounded U-shaped bottom (was a sharp cone tip)
    var cp=[
      new THREE.Vector2(0.0,0.0), new THREE.Vector2(0.075,0.012), new THREE.Vector2(0.145,0.05),
      new THREE.Vector2(0.21,0.12), new THREE.Vector2(0.265,0.22), new THREE.Vector2(0.30,0.36),
      new THREE.Vector2(0.32,0.60), new THREE.Vector2(0.32,0.98), new THREE.Vector2(0.335,1.0)
    ];
    // the COLLECTION TUBE is its own group: a spin column is a two-part assembly, and
    // "transfer the column to a clean tube" moves the column ONLY — the used collection
    // tube stays on the bench (detachCollection / reattachCollection)
    var collGrp = new THREE.Group(); grp.add(collGrp);
    var coll = new THREE.Mesh(new THREE.LatheGeometry(cp,48), clearMat);
    coll.castShadow=true; collGrp.add(coll);
    var collRim = new THREE.Mesh(new THREE.TorusGeometry(0.325,0.02,12,44), clearMat);
    collRim.rotation.x=Math.PI/2; collRim.position.y=1.0; collGrp.add(collRim);
    // leave the collection tube where it stands (world transform kept) under `parent`
    grp.userData.detachCollection=function(parent){ if(collGrp.parent!==parent) parent.attach(collGrp); };
    grp.userData.reattachCollection=function(){
      if(collGrp.parent!==grp){ grp.add(collGrp); }
      collGrp.position.set(0,0,0); collGrp.rotation.set(0,0,0); collGrp.scale.setScalar(1);
    };
    var ip=[
      new THREE.Vector2(0.14,0.86), new THREE.Vector2(0.2,0.9), new THREE.Vector2(0.27,1.02),
      new THREE.Vector2(0.28,1.5), new THREE.Vector2(0.3,1.56)
    ];
    var cup = new THREE.Mesh(new THREE.LatheGeometry(ip,48), frostMat); grp.add(cup);
    var flange = new THREE.Mesh(new THREE.TorusGeometry(0.29,0.028,12,44), whiteMat);
    flange.rotation.x=Math.PI/2; flange.position.y=1.5; grp.add(flange);
    var cupRim = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.28,0.06,44,1,true), whiteMat);
    cupRim.position.y=1.53; grp.add(cupRim);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.2,0.03,14,44), new THREE.MeshStandardMaterial({
      color:0xe6b0c0, roughness:0.9, metalness:0, envMapIntensity:0.3 }));
    ring.rotation.x=Math.PI/2; ring.position.y=0.92; grp.add(ring);
    var memMat = new THREE.MeshStandardMaterial({ color:0xf0dbe3, roughness:0.94, envMapIntensity:0.25 });
    var mem = new THREE.Mesh(new THREE.CircleGeometry(0.19,40), memMat);
    mem.rotation.x=-Math.PI/2; mem.position.y=0.9; grp.add(mem);
    var liqMat = new THREE.MeshPhysicalMaterial({ color:COL.lysis, roughness:0.32,
      transparent:false, emissive:COL.lysis, emissiveIntensity:0.14, envMapIntensity:0.6 });
    // liquid follows the column cup's inner wall (`ip`), flat-topped at the fill line
    var colInnerFn = innerRadiusFn(ip, 0.90);
    var colBottom  = 0.90, colFillMax = 1.44;
    var liq = new THREE.Mesh(new THREE.BufferGeometry(), liqMat);
    liq.visible=false; fx(liq,'fluid'); grp.add(liq);

    var label = makeLabel("RNeasy column","");
    label.position.set(0,2.4,0); grp.add(label);

    var st={ level:0,tLevel:0,builtLevel:-1,color:new THREE.Color(COL.lysis),tColor:new THREE.Color(COL.lysis) };
    grp.userData.liq=liq; grp.userData.label=label; grp.userData.st=st;
    grp.userData.setLevel=function(v){ st.tLevel=clamp(v,0,1); };
    grp.userData.setColor=function(h){ st.tColor.set(h); };
    grp.userData.setLabel=function(t,s){ label.userData.update(t,s||""); };
    grp.userData.update=function(dt){
      var kC=1-Math.pow(0.004,dt);
      st.level=lerp(st.level,st.tLevel,1-Math.pow(0.002,dt));
      st.color.lerp(st.tColor,kC);
      if(st.level<0.01){ liq.visible=false; }
      else{
        liq.visible=true;
        if(Math.abs(st.level-st.builtLevel)>0.004){
          st.builtLevel=st.level;
          var yTop=colBottom + st.level*(colFillMax-colBottom);
          var geo=liquidProfileGeo(colInnerFn, colBottom, yTop, 44);
          liq.geometry.dispose(); liq.geometry=geo;
        }
        liqMat.color.copy(st.color); liqMat.emissive.copy(st.color);
      }
    };
    var root=fitArt(grp,'spin_column_mini');
    // the tip stops just below the cup rim, ABOVE the silica bed (membrane at drawing y 0.9)
    root.userData.mouth={ x:0, y:root.userData.fit.toWorld(0,1.56,0).y, z:0, approach:'top' };
    root.userData.entry=root.userData.fit.toWorld(0,1.2,0).y;
    // the underside of the column's FLANGE (drawing: torus at 1.5, tube 0.028) — what rests on a tube rim
    root.userData.flangeY=root.userData.fit.toWorld(0,1.5-0.028,0).y;
    return tagSpec(root,'spin_column_mini');
  }

  /* ---------- anodized cold block ---------- */
  function buildColdBlock(){
    // REAL SIZE from dims('dry_block_heater'): a dark anthracite housing with a brushed
    // aluminium block on top and ONE row of tube bores. The bores are REAL openings — the
    // block is a slab with holes, each with its wall and floor — sized to the tube they
    // accept (+ socket play). (The old block drew dark cylinders INSIDE a solid box and
    // capped them with a solid top plate: a seated tube passed through both.)
    var grp = new THREE.Group();
    var D=dims('dry_block_heater'), T=dims('microtube_1_5');
    var W=D.width, H=D.height, DEP=D.depth, BORE=D.bore_depth;
    var alu   = matAnodized(0x30343b);                        // dark anthracite body
    var aluTop= matBrushed(0xb8bec6); aluTop.roughness=0.42;  // brushed-silver thermoblock top
    var boreR = T.radius + clearance('socket_fit');           // the tube's body + play (its rim stands above the block)
    var PLINTH=H*0.09, BLOCK_W=W*0.82, BLOCK_D=DEP*0.5;
    var chamfer = new THREE.Mesh(new THREE.BoxGeometry(W,PLINTH,DEP), matAnodized(0x24272d));
    chamfer.position.y=PLINTH/2; chamfer.castShadow=true; chamfer.receiveShadow=true; grp.add(chamfer);
    var bodyH=H-PLINTH-BORE;
    var base = new THREE.Mesh(new THREE.BoxGeometry(W*0.96,bodyH,DEP*0.96), alu);
    base.position.y=PLINTH+bodyH/2; base.castShadow=true; base.receiveShadow=true; grp.add(base);
    // ONE row of tube-sized wells across the block (the centre one takes the sample)
    var N=3, PITCH=boreR*2+W*0.06, xs=[];
    for(var i=0;i<N;i++) xs.push((i-(N-1)/2)*PITCH);
    var floorY=H-BORE;
    var topPlate = new THREE.Mesh(slabWithHoles(BLOCK_W,BORE,BLOCK_D,xs.map(function(x){ return [x,0,boreR]; }),28), aluTop);
    topPlate.position.y=floorY; topPlate.castShadow=true; grp.add(topPlate);
    // machined bevel frame around the block's top edge — catches the key light
    var bevelMat=matAnodized(0xc0cad4); bevelMat.roughness=0.34; var bv=H*0.02, bevY=H-bv/2;
    [[BLOCK_W,bv,bv, 0,BLOCK_D/2-bv/2],[BLOCK_W,bv,bv, 0,-(BLOCK_D/2-bv/2)],
     [bv,bv,BLOCK_D, BLOCK_W/2-bv/2,0],[bv,bv,BLOCK_D, -(BLOCK_W/2-bv/2),0]].forEach(function(r){
      var m=new THREE.Mesh(new THREE.BoxGeometry(r[0],r[1],r[2]), bevelMat); m.position.set(r[3],bevY,r[4]); grp.add(m); });
    // cooling flutes down the housing front
    var fluteMat = matAnodized(0x2a2e35), fr=W*0.01;
    for(var f=0;f<9;f++){
      var fl=new THREE.Mesh(new THREE.CylinderGeometry(fr,fr,bodyH*0.8,10), fluteMat);
      fl.position.set((f-4)*W*0.1, PLINTH+bodyH/2, DEP*0.48+fr*0.2); grp.add(fl);
    }
    var wellRim = matAnodized(0x8b95a1);
    var boreMat = new THREE.MeshStandardMaterial({ color:0x1d232b, metalness:0.4, roughness:0.7, side:THREE.DoubleSide });
    var lipT=boreR*0.08;
    xs.forEach(function(x,i){
      var bore = new THREE.Mesh(new THREE.CylinderGeometry(boreR,boreR,BORE,28,1,true), boreMat);
      bore.position.set(x,floorY+BORE/2,0); fx(bore,'decal'); grp.add(bore);     // the bore's dark lining (the slab's hole is its wall)
      var boreBot = new THREE.Mesh(new THREE.CircleGeometry(boreR,28), boreMat);
      boreBot.rotation.x=-Math.PI/2; boreBot.position.set(x,floorY+BORE*0.002,0); fx(boreBot,'decal'); grp.add(boreBot);
      var lip = new THREE.Mesh(new THREE.TorusGeometry(boreR+lipT,lipT,10,28), wellRim);   // sits OUTSIDE the bore
      lip.rotation.x=Math.PI/2; lip.position.set(x,H,0); grp.add(lip);
      addSocket(grp, 'well'+i, { position:new THREE.Vector3(x,floorY,0) });
    });
    var label = makeLabel("Incubate","RT");
    label.position.set(0,H+LABEL_GAP,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    grp.userData.sampleSocket='well1';
    return tagSpec(grp,'dry_block_heater');
  }

  /* ---------- water bath (heat, e.g. 42 °C): a stainless tub FILLED with warm
     water (translucent, gently rippling), a slotted rack across the top, and
     steam wisps rising off the surface. Deliberately UNLIKE the dry incubation
     block (buildColdBlock) — liquid-filled + steam vs. a dry anthracite well
     block — so the two heat/incubate stations never read as the same device. */
  function buildWaterBath(){
    // REAL SIZE from dims('water_bath_5l'): housing + an open stainless basin of the real
    // internal size, a SUBMERGED RACK the tube stands on (so ~60 % of it is under water —
    // "the bottom 1/2 to 2/3 of the tube"), water to that level. The old bath filled its
    // basin with a solid liner block and hung the tube in the water with nothing under it.
    var grp=new THREE.Group();
    var D=dims('water_bath_5l'), T=dims('microtube_1_5');
    var W=D.width, H=D.height, DEP=D.depth, IW=D.inner_width, ID=D.inner_depth, IH=D.inner_height;
    var steel=matBrushed(0xb9c0c8); steel.roughness=0.4;
    var FLOOR_Y=H-IH, RACK_Y=FLOOR_Y+D.rack_height, SURFY=RACK_Y+0.6*T.height;
    var wx=(W-IW)/2, wz=(DEP-ID)/2;
    // housing below the basin floor
    var housing=new THREE.Mesh(new THREE.BoxGeometry(W,FLOOR_Y,DEP), steel); housing.position.y=FLOOR_Y/2; housing.castShadow=true; housing.receiveShadow=true; grp.add(housing);
    // OPEN BASIN walls; the FRONT wall stops just above the water so the pool reads over it
    var FRONT_TOP=SURFY+H*0.02;
    var back=new THREE.Mesh(new THREE.BoxGeometry(W,IH,wz), steel); back.position.set(0,FLOOR_Y+IH/2,-(DEP-wz)/2); back.castShadow=true; grp.add(back);
    var frontW=new THREE.Mesh(new THREE.BoxGeometry(W,FRONT_TOP-FLOOR_Y,wz), steel); frontW.position.set(0,(FLOOR_Y+FRONT_TOP)/2,(DEP-wz)/2); grp.add(frontW);
    for(var sw=0;sw<2;sw++){ var side=new THREE.Mesh(new THREE.BoxGeometry(wx,IH,ID), steel);
      side.position.set((sw?1:-1)*(W-wx)/2, FLOOR_Y+IH/2, 0); side.castShadow=true; grp.add(side); }
    // muted stainless inner LINER (open-topped — nothing lowered in passes through a lid)
    var innerMat=new THREE.MeshStandardMaterial({ color:0x6b7580, roughness:0.5, metalness:0.25, side:THREE.DoubleSide });
    var liner=new THREE.Mesh(openTopBox(IW,IH,ID), innerMat); liner.position.y=FLOOR_Y+IH/2; fx(liner,'decal'); grp.add(liner);
    // the submerged tube RACK: a perforated steel platform on four legs
    var RW=IW*0.5, RD=ID*0.7, RT=D.rack_height*0.08;
    var rackMat=matBrushed(0x9aa4b0);
    var plat=new THREE.Mesh(new THREE.BoxGeometry(RW,RT,RD), rackMat); plat.position.y=RACK_Y-RT/2; grp.add(plat);
    for(var lg=0;lg<4;lg++){ var leg=new THREE.Mesh(new THREE.BoxGeometry(RT,D.rack_height-RT,RT), rackMat);
      leg.position.set((lg&1?1:-1)*(RW/2-RT), FLOOR_Y+(D.rack_height-RT)/2, (lg&2?1:-1)*(RD/2-RT)); grp.add(leg); }
    addSocket(grp,'rack',{ position:new THREE.Vector3(0,RACK_Y,0) });
    // WATER — RESTRAINED: a muted blue-grey, mostly transparent, NO emissive glow
    var waterMat=new THREE.MeshPhysicalMaterial({ color:0x93b2c2, roughness:0.16, metalness:0,
      transparent:true, opacity:0.36, clearcoat:0.5, clearcoatRoughness:0.3, envMapIntensity:0.9 });
    var water=new THREE.Mesh(new THREE.BoxGeometry(IW*0.998,SURFY-FLOOR_Y,ID*0.998), waterMat); water.position.y=(SURFY+FLOOR_Y)/2; fx(water,'fluid'); grp.add(water);
    // faint surface sheen — a reflective meniscus, not a glowing cap
    var surfMat=new THREE.MeshPhysicalMaterial({ color:0xb6ccd6, roughness:0.09, metalness:0.15, transparent:true, opacity:0.3, envMapIntensity:1.1 });
    var surf=new THREE.Mesh(new THREE.BoxGeometry(IW*0.99,IH*0.01,ID*0.99), surfMat); surf.position.y=SURFY; fx(surf,'fluid'); grp.add(surf);
    // temperature DIAL on the housing front (a real water bath's defining control)
    var DR=W*0.06, dialY=FLOOR_Y*0.5, dialX=W*0.3, fz=DEP/2;
    var dialRim=new THREE.Mesh(new THREE.CylinderGeometry(DR,DR,DR*0.25,24), matBrushed(0xcfd5db));
    dialRim.rotation.x=Math.PI/2; dialRim.position.set(dialX,dialY,fz+DR*0.125); grp.add(dialRim);
    var dialFace=new THREE.Mesh(new THREE.CircleGeometry(DR*0.8,24), new THREE.MeshStandardMaterial({ color:0xeef1f4, roughness:0.55, metalness:0 }));
    dialFace.position.set(dialX,dialY,fz+DR*0.26); fx(dialFace,'decal'); grp.add(dialFace);
    var needle=new THREE.Mesh(new THREE.BoxGeometry(DR*0.09,DR*0.65,DR*0.04), matPlastic(0x33383e));
    needle.position.set(dialX,dialY,fz+DR*0.29); needle.rotation.z=0.7; fx(needle,'decal'); grp.add(needle);
    // steam wisps rise ONLY when warm (at rest: none) — very subtle, no colour cast
    var steamMat=new THREE.MeshBasicMaterial({ color:0xeef2f4, transparent:true, opacity:0.0, depthWrite:false, blending:THREE.AdditiveBlending, fog:false });
    var WS=ID*0.12;
    var wisps=[]; for(var w=0;w<6;w++){ var s=new THREE.Mesh(new THREE.SphereGeometry(WS,10,8), steamMat.clone());
      s.userData.seed={ x:(Math.random()-0.5)*IW*0.8, z:(Math.random()-0.5)*ID*0.7, off:Math.random(), sp:0.3+Math.random()*0.35 };
      fx(s,'effect'); grp.add(s); wisps.push(s); }
    var label=makeLabel("Water bath","37 °C"); label.position.set(0,H+LABEL_GAP,0); grp.add(label);
    var wst={ t:0, warmth:0, tWarmth:0 };
    grp.userData.label=label;
    grp.userData.surfaceY=SURFY; grp.userData.inner={ w:IW, d:ID };
    grp.userData.setWarmth=function(v){ wst.tWarmth=clamp(v,0,1); };
    grp.userData.update=function(dt){
      wst.t+=dt; wst.warmth=lerp(wst.warmth,wst.tWarmth,1-Math.pow(0.05,dt));
      surf.position.y=SURFY+Math.sin(wst.t*1.6)*IH*0.005;         // gentle meniscus bob
      for(var i=0;i<wisps.length;i++){ var sd=wisps[i].userData.seed;
        var yy=((wst.t*sd.sp+sd.off)%1);
        wisps[i].position.set(sd.x, SURFY+WS*0.3+yy*IH, sd.z);
        wisps[i].scale.setScalar(0.35+yy*0.9);
        wisps[i].material.opacity=wst.warmth*0.22*(1-yy)*(yy<0.1?yy*10:1);
      }
    };
    grp.userData.sampleSocket='rack';
    return tagSpec(grp,'water_bath_5l');
  }

  /* ---------- microplate ABSORBANCE reader (ELISA) — NOT the NanoDrop. A benchtop
     box with a motorized drawer that a 96-well plate slides into, and an A450
     readout. setDrawer(out) / setOD(v). */
  function buildPlateReader(){
    // REAL SIZE from dims('microplate_96' / 'plate_reader'): a painted body with a real
    // TUNNEL the plate carrier drives into (the old reader painted a dark slot on a SOLID
    // box, so the plate drove through its front wall). The carrier is sized to the SBS
    // footprint; the plate RIDES it (socket 'carrier'), so plate and drawer never drift.
    var grp=new THREE.Group();
    var D=dims('plate_reader'), P=dims('microplate_96');
    var W=D.width, H=D.height, DEP=D.depth, gap=clearance('bench_gap');
    var shell=matPainted(0xd9dde2,0.5);
    var CW=P.width+gap, CD=P.depth+gap, CT=P.height*0.25;          // carrier: footprint + play
    var TW=CW+gap, TH=P.height+CT+gap, TBOT=H*0.3, TDEP=CD+gap;    // tunnel it drives into
    function part(w,h,d,x,y,z){ var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), shell); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; grp.add(m); return m; }
    part(W,TBOT,DEP, 0,TBOT/2,0);                                   // below the tunnel
    part(W,H-TBOT-TH,DEP, 0,(H+TBOT+TH)/2,0);                       // above it
    var sideW=(W-TW)/2;
    part(sideW,TH,DEP, -(W-sideW)/2,TBOT+TH/2,0);                   // its two sides
    part(sideW,TH,DEP, (W-sideW)/2,TBOT+TH/2,0);
    part(TW,TH,DEP-TDEP, 0,TBOT+TH/2,-DEP/2+(DEP-TDEP)/2);          // and its back wall
    var inner=new THREE.Mesh(openTopBox(TW,TH,TDEP), new THREE.MeshStandardMaterial({ color:0x181d23, roughness:0.8, side:THREE.DoubleSide }));
    inner.position.set(0,TBOT+TH/2,DEP/2-TDEP/2); fx(inner,'decal'); grp.add(inner);   // dark tunnel lining
    // the CARRIER: a tray + front lip on the drawer; it travels out along +z
    var drawer=new THREE.Group(); grp.add(drawer);
    var tray=new THREE.Mesh(new THREE.BoxGeometry(CW,CT,CD), matPlastic(0x8a94a0)); tray.position.y=TBOT+CT/2; drawer.add(tray);
    var lip=new THREE.Mesh(new THREE.BoxGeometry(TW*0.98,TH*0.9,CT), matPlastic(0x6b7480)); lip.position.set(0,TBOT+TH*0.45,CD/2+CT/2); drawer.add(lip);
    addSocket(grp,'carrier',{ parent:drawer, position:new THREE.Vector3(0,TBOT+CT,0) });
    var IN_Z=DEP/2-TDEP/2, OUT_Z=DEP/2+CD/2+gap;                    // carrier centre closed / open
    var dc=document.createElement("canvas"); dc.width=200; dc.height=110; var dg=dc.getContext("2d");
    var dTex=new THREE.CanvasTexture(dc); dTex.anisotropy=MAX_ANISO;
    function drawOD(v){ dg.fillStyle="#0d1218"; dg.fillRect(0,0,200,110);
      dg.fillStyle="#7a8290"; dg.font="600 18px 'IBM Plex Sans'"; dg.textAlign="left"; dg.fillText("A450",14,30);
      dg.fillStyle="#8fcabf"; dg.font="700 42px 'IBM Plex Mono'"; dg.fillText(v.toFixed(2),14,84); dTex.needsUpdate=true; }
    drawOD(0);
    var disp=new THREE.Mesh(new THREE.PlaneGeometry(W*0.27,H*0.2), new THREE.MeshBasicMaterial({map:dTex,transparent:true}));
    disp.position.set(W*0.3,TBOT+TH+(H-TBOT-TH)/2,DEP/2+H*0.005); fx(disp,'decal'); grp.add(disp);
    var label=makeLabel("Plate reader",""); label.position.set(0,H+LABEL_GAP,0); grp.add(label);
    var pst={ draw:0, tDraw:0 };   // built CLOSED (its real envelope); the station opens it
    grp.userData.label=label;
    grp.userData.setDrawer=function(out){ pst.tDraw=out?1:0; };
    grp.userData.setOD=function(v){ drawOD(clamp(v,0,4)); };
    grp.userData.update=function(dt){ pst.draw=lerp(pst.draw,pst.tDraw,1-Math.pow(0.02,dt)); drawer.position.z=lerp(IN_Z,OUT_Z,pst.draw); };
    grp.userData.update(1e6);
    grp.userData.sampleSocket='carrier';
    return tagSpec(grp,'plate_reader');
  }

  /* ---------- orbital plate SHAKER / incubator — a platform that gently orbits; a
     96-well plate or a membrane-in-tray rides it. setOrbit(a) drives the sway. */
  function buildPlateShaker(){
    var grp=new THREE.Group();
    var base=new THREE.Mesh(new THREE.BoxGeometry(3.0,0.5,2.1), matPainted(0x3b424b,0.5));
    base.position.y=0.25; base.castShadow=true; base.receiveShadow=true; grp.add(base);
    var platform=new THREE.Group(); grp.add(platform);
    var plat=new THREE.Mesh(new THREE.BoxGeometry(2.8,0.12,1.9), matBrushed(0x9aa4b0));
    plat.position.y=0.56; platform.add(plat);
    for(var cx=0;cx<2;cx++) for(var cz=0;cz<2;cz++){ var clip=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.18,0.14), matPlastic(0x6b7480));
      clip.position.set(-1.2+cx*2.4,0.67,-0.8+cz*1.6); platform.add(clip); }
    var dial=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.06,16), matPlastic(0x8a94a0)); dial.rotation.x=Math.PI/2; dial.position.set(1.2,0.25,1.06); grp.add(dial);
    var label=makeLabel("Shaker",""); label.position.set(0,1.4,0); grp.add(label);
    grp.userData.label=label;
    grp.userData.update=function(){};
    var root=fitArt(grp,'plate_shaker'), F=root.userData.fit;
    // the plate CLIPS hold an SBS plate at its corners (they stood ~0.5 plate-widths off it)
    var P=dims('microplate_96'), cw=0.14*F.sx;
    platform.children.forEach(function(c){ if(c===plat) return;
      var sx=Math.sign(c.position.x), sz=Math.sign(c.position.z);
      var wx=sx*(P.width/2+cw/2), wz=sz*(P.depth/2+cw/2);
      c.position.x=(wx-F.art.position.x)/F.sx; c.position.z=(wz-F.art.position.z)/F.sz; });
    // the vessel RIDES the platform (socket under the orbiting group): shaker and plate move as one
    var top=F.toWorld(0,0.62,0).y;
    addSocket(root,'platform',{ parent:platform, position:new THREE.Vector3(0,(top-F.art.position.y)/F.sy,0) });
    var ORBIT=0.06;   // drawing units
    root.userData.setOrbit=function(a){ platform.position.set(Math.cos(a)*ORBIT,0,Math.sin(a)*ORBIT); };
    root.userData.sampleSocket='platform';
    return tagSpec(root,'plate_shaker');
  }

  /* ---------- CO₂ incubator (warm, 37 °C) for flasks/dishes — a cabinet with a
     GLASS door and wire shelves; the flask lies flat on a shelf, visible through the
     glass. Distinct from the −80 freezer. setDoor(open). */
  function buildCO2Incubator(){
    var grp=new THREE.Group();
    // OPEN-FRONT cabinet (5 panels, no opaque front face) so you can see IN through
    // the glass door — deep enough that a T-flask (1.5 deep) sits fully inside.
    var shell=matPainted(0xd7dbe0,0.5);
    function coPanel(w,h,d,x,y,z){ var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), shell); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; grp.add(m); return m; }
    coPanel(3.3,2.4,0.1, 0,1.2,-1.45);   // back
    coPanel(3.3,0.1,2.4, 0,2.35,-0.25);  // top
    coPanel(3.3,0.1,2.4, 0,0.05,-0.25);  // bottom
    coPanel(0.1,2.4,2.4, -1.6,1.2,-0.25);// left
    coPanel(0.1,2.4,2.4, 1.6,1.2,-0.25); // right
    var innerMat=new THREE.MeshStandardMaterial({ color:0x8a95a1, roughness:0.55, metalness:0.1 }); // matte interior back wall
    var inWall=new THREE.Mesh(new THREE.PlaneGeometry(3.1,2.2), innerMat); inWall.position.set(0,1.2,-1.39); grp.add(inWall);
    for(var s=0;s<2;s++){ var shelf=new THREE.Mesh(new THREE.BoxGeometry(2.8,0.03,1.7), matBrushed(0x8a94a0)); shelf.position.set(0,0.62+s*0.95,-0.15); grp.add(shelf); }
    var doorPivot=new THREE.Group(); doorPivot.position.set(-1.6,1.2,0.95); grp.add(doorPivot);
    // The door is a FRAME of four rails around the glass — the old 3.2×2.3 solid slab sat
    // behind the glass and made the "glass" door opaque, hiding the flask. Door-local x
    // runs 0..3.2 from the hinge; the glass fills 0.25..2.95 × −0.95..0.75; the deeper top
    // rail carries the readout.
    var railMat=matPainted(0xc4c9cf,0.5);
    function rail(w,h,x,y){ var r=new THREE.Mesh(new THREE.BoxGeometry(w,h,0.1), railMat); r.position.set(x,y,0); doorPivot.add(r); }
    rail(0.25,2.3, 0.125,0);      // hinge side
    rail(0.25,2.3, 3.075,0);      // handle side
    rail(2.7,0.2, 1.6,-1.05);     // bottom
    rail(2.7,0.4, 1.6,0.95);      // top — the display panel
    var glass=new THREE.Mesh(new THREE.BoxGeometry(2.7,1.7,0.05), glassMaterial()); glass.position.set(1.6,-0.1,0.03); doorPivot.add(glass);
    var handle=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.3,12), matBrushed(0x868f9b)); handle.position.set(3.075,-0.1,0.16); doorPivot.add(handle);
    var dc=document.createElement("canvas"); dc.width=200; dc.height=90; var dg=dc.getContext("2d");
    var dTex=new THREE.CanvasTexture(dc); dTex.anisotropy=MAX_ANISO;
    dg.fillStyle="#0d1218"; dg.fillRect(0,0,200,90); dg.fillStyle="#8fcabf"; dg.font="700 30px 'IBM Plex Mono'"; dg.textAlign="left"; dg.fillText("37°C",12,40); dg.fillStyle="#6fb8f0"; dg.font="700 22px 'IBM Plex Mono'"; dg.fillText("5% CO₂",12,72); dTex.needsUpdate=true;
    // the readout is mounted ON the door's top rail (front face at +0.05), so it is in
    // front of the cabinet when closed and swings WITH the door — never left hanging in air
    var disp=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.32), new THREE.MeshBasicMaterial({map:dTex,transparent:true})); disp.position.set(1.6,0.95,0.056); fx(disp,'decal'); doorPivot.add(disp);
    var label=makeLabel("CO₂ incubator",""); label.position.set(0,2.75,0); grp.add(label);
    var ist={ door:0, tDoor:0 };
    grp.userData.label=label;
    grp.userData.setDoor=function(open){ ist.tDoor=open?1:0; };
    grp.userData.update=function(dt){ ist.door=lerp(ist.door,ist.tDoor,1-Math.pow(0.02,dt)); doorPivot.rotation.y=-easeInOut(ist.door)*1.3; };   // swings OUT (+z) — a +angle swung it back through the cabinet
    var root=fitArt(grp,'co2_incubator_benchtop'), F=root.userData.fit;
    // the flask lies on the LOWER wire shelf (drawing: y 0.62, 0.03 thick, centred z −0.15)
    addSocket(root,'shelf0',{ position:F.toWorld(0,0.62+0.015,-0.15) });
    addSocket(root,'shelf1',{ position:F.toWorld(0,1.57+0.015,-0.15) });
    root.userData.sampleSocket='shelf0';
    return tagSpec(root,'co2_incubator_benchtop');
  }

  /* ---------- thermocycler (PCR): heated block + motorized heated lid + cycle
     display. setProgress(p, cycles) cycles the hot↔cool glow and the CYCLE n/N
     readout; setLid(open) raises/lowers the heated lid. Same anthracite style as
     buildColdBlock. */
  function buildThermocycler(){
    var grp = new THREE.Group();
    var shell = matAnodized(0x2b2f36);
    var shellTop = matBrushed(0xb8bec6); shellTop.roughness=0.42;
    var base = new THREE.Mesh(new THREE.BoxGeometry(2.5,0.7,1.9), shell);
    base.position.y=0.35; base.castShadow=true; base.receiveShadow=true; grp.add(base);
    var deck = new THREE.Mesh(new THREE.BoxGeometry(2.3,0.06,1.5), shellTop);
    deck.position.set(0,0.72,0.05); grp.add(deck);
    // (the heated 96-well BLOCK is functional geometry, added at real size after the fit)
    // HINGED CLAMSHELL LID (back hinge). Raised at rest so the wells read; lowers to
    // rest FLAT ON TOP of the block during cycling (closed underside ~0.89 clears the
    // block top 0.87 and the sunk tube caps). No posts, no bench glow — restrained.
    var lidPivot = new THREE.Group(); lidPivot.position.set(0,0.88,-0.78); grp.add(lidPivot);
    var lid = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.2,1.5), matPainted(0x3a3f47,0.5));
    lid.position.set(0,0.11,0.78); lidPivot.add(lid);
    var lidGrip = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.07,0.14), matPlastic(0x22272e));
    lidGrip.position.set(0,0.22,1.46); lidPivot.add(lidGrip);
    // slanted control display
    var dc=document.createElement("canvas"); dc.width=256; dc.height=128; var dg=dc.getContext("2d");
    var dTex=new THREE.CanvasTexture(dc); dTex.anisotropy=MAX_ANISO;
    function drawDisp(cyc, tot, tempC, hot){
      dg.fillStyle="#0d1218"; dg.fillRect(0,0,256,128);
      dg.strokeStyle="rgba(90,100,116,0.4)"; dg.lineWidth=3; dg.strokeRect(6,6,244,116);
      dg.textAlign="left"; dg.fillStyle="#7a8290"; dg.font="600 20px 'IBM Plex Sans'"; dg.fillText("CYCLE", 16,34);
      dg.fillStyle="#8fcabf"; dg.font="700 46px 'IBM Plex Mono'"; dg.fillText(cyc+" / "+tot, 16,86);
      dg.textAlign="right"; dg.fillStyle=hot?"#ff9a5a":"#6fb8f0"; dg.font="700 34px 'IBM Plex Mono'";
      dg.fillText(Math.round(tempC)+"°", 240,60);
      dTex.needsUpdate=true;
    }
    drawDisp(0,30,25,false);
    var disp=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.35), new THREE.MeshBasicMaterial({map:dTex,transparent:true}));
    disp.position.set(0,0.5,0.96); disp.rotation.x=-0.35; fx(disp,'decal'); grp.add(disp);
    var dispFrame=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.44,0.05), matPainted(0x22262c,0.5));
    dispFrame.position.set(0,0.5,0.94); dispFrame.rotation.x=-0.35; grp.add(dispFrame);

    var label=makeLabel("Thermocycler",""); label.position.set(0,1.7,0); grp.add(label);
    var st={ lid:1, tLid:1 };
    grp.userData.label=label;
    grp.userData.setLid=function(open){ st.tLid=open?1:0; };
    // p in [0,1] over the whole step; `cycles` = repeat.count. Steps the CYCLE readout
    // and its hot/cool temperature — the ONLY heat cue (no bench-blooming glow light).
    grp.userData.setProgress=function(p, cycles){
      cycles=Math.max(1, cycles||30);
      var cyc=Math.min(cycles, Math.floor(p*cycles)+1);
      var cp=(p*cycles)%1;                     // progress within the current cycle
      var hot=cp<0.4;                            // denature (hot) then anneal/extend (cooler)
      var tempC = hot ? 95 : (cp<0.7 ? 58 : 72);
      drawDisp(cyc, cycles, tempC, hot);
    };
    grp.userData.update=function(dt){
      st.lid=lerp(st.lid, st.tLid, 1-Math.pow(0.02,dt));
      lidPivot.rotation.x = -easeInOut(st.lid)*1.15; // 1=open(raised), 0=closed(flat over the block)
    };
    grp.userData.setProgress(0,30);
    var root=fitArt(grp,'thermocycler_96'), F=root.userData.fit;
    // the heated BLOCK at real size on the deck: 8 × 12 bores on the SBS 9 mm pitch, each
    // sized to the 0.2 mL PCR tube it accepts (+ play) and dims('thermocycler_96').bore_depth
    // deep — REAL holes through the block, not dark discs on a solid (the old block's 12
    // bores were cylinders inside a solid box). Sockets A1…H12 accept PCR tubes only: a
    // 1.5 mL tube does not go in a 96-well block, and that is a SocketError.
    var TC=dims('thermocycler_96'), PT=dims('pcr_tube_0_2'), PITCH=TC.well_pitch;
    var boreR=PT.radius+clearance('socket_fit'), BD=TC.bore_depth, deckY=F.toWorld(0,0.75,0).y;
    var holes=[], ROWS='ABCDEFGH';
    for(var r=0;r<8;r++) for(var c=0;c<12;c++) holes.push([(c-5.5)*PITCH,(r-3.5)*PITCH,boreR,ROWS[r]+(c+1)]);
    var BW=12*PITCH+PITCH*0.8, BDEP=8*PITCH+PITCH*0.8;
    var block=new THREE.Mesh(slabWithHoles(BW,BD,BDEP,holes,14), matAnodized(0x23272e));
    block.position.y=deckY; root.add(block);
    var floor=new THREE.Mesh(new THREE.PlaneGeometry(BW,BDEP), new THREE.MeshStandardMaterial({ color:0x1b2128, metalness:0.4, roughness:0.7 }));
    floor.rotation.x=-Math.PI/2; floor.position.y=deckY+BD*0.01; fx(floor,'decal'); root.add(floor);   // the dark bore floors
    holes.forEach(function(h){ addSocket(root,h[3],{ position:new THREE.Vector3(h[0],deckY,h[1]) }); });
    root.userData.sampleSocket='E6';
    return tagSpec(root,'thermocycler_96');
  }

  /* ---------- gel electrophoresis rig: buffer tank + gel with wells + power box.
     setProgress(p) migrates the dye front / bands down the gel and ramps the
     voltage readout. Stylized to match the bench (matFrosted tank, matPainted box). */
  function buildGelRig(){
    var grp = new THREE.Group();
    // buffer tank (clear box) — solid enough to read as a vessel, with a dark frame
    var tankMat = new THREE.MeshPhysicalMaterial({ color:0xcdd6de, roughness:0.2, metalness:0, transparent:true, opacity:0.5, clearcoat:0.6, envMapIntensity:0.8 });
    // OPEN-TOPPED tank (a buffer tank has no top face — the lid sits on its rim). Box
    // material order is +x,-x,+y,-y,+z,-z: the +y face gets an invisible material, so a
    // gel inside is seen from above through the (clear) lid and the buffer only.
    // (now a box with NO top face at all — an invisible face's triangles were still there
    // for a gel lowered in to pass through)
    var tank = new THREE.Mesh(openTopBox(2.6,0.7,1.6), tankMat);
    tank.position.y=0.55; tank.castShadow=true; grp.add(tank);
    var frameMat = matPlastic(0x2b3038);
    // base + top rim frames so the tank reads as a solid moulded vessel, not a haze
    var tbase = new THREE.Mesh(new THREE.BoxGeometry(2.66,0.1,1.66), frameMat); tbase.position.y=0.24; grp.add(tbase);
    // the top RIM is a frame of four rails (a full 2.66x1.66 slab here capped the tank and
    // hid anything inside it)
    [[2.66,0.08,0.08, 0,0.86, 0.79],[2.66,0.08,0.08, 0,0.86,-0.79],
     [0.08,0.08,1.66, 1.29,0.86,0],[0.08,0.08,1.66,-1.29,0.86,0]].forEach(function(r){
      var m=new THREE.Mesh(new THREE.BoxGeometry(r[0],r[1],r[2]), frameMat); m.position.set(r[3],r[4],r[5]); grp.add(m); });
    // clear smoked-acrylic lid (as on real mini-gel tanks): a run is watched THROUGH it —
    // the dye front moving in the gel is the one visible sign that the gel is running.
    var lidMat = new THREE.MeshPhysicalMaterial({ color:0x2b3038, roughness:0.25, metalness:0, transparent:true,
      opacity:0.32, clearcoat:0.6, envMapIntensity:0.6, depthWrite:false });
    // The LID carries the electrode terminals and their leads: to load a gel you take the
    // lid (leads and all) straight UP off the tank — lidGrp moves as one (setLidLift).
    var lidGrp = new THREE.Group(); grp.add(lidGrp);
    var tankLid = new THREE.Mesh(new THREE.BoxGeometry(2.7,0.09,1.7), lidMat);
    tankLid.position.y=0.96; lidGrp.add(tankLid);
    // electrode TERMINALS on the lid (red +, black −) + CABLES running to the power box
    var termR = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.12,12), matPlastic(0xc0392b)); termR.position.set(-0.5,1.06,0.6); lidGrp.add(termR);
    var termB = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.12,12), matPlastic(0x22272e)); termB.position.set(-0.2,1.06,0.6); lidGrp.add(termB);
    // running buffer
    var buf = new THREE.Mesh(new THREE.BoxGeometry(2.5,0.5,1.5),
      new THREE.MeshPhysicalMaterial({ color:0xdfe6c0, roughness:0.3, transparent:true, opacity:0.35, envMapIntensity:0.6 }));
    buf.position.y=0.5; fx(buf,'fluid'); grp.add(buf);
    // the gel slab (translucent amber) with a row of wells at the top
    var gelMat = new THREE.MeshPhysicalMaterial({ color:0xd8c98a, roughness:0.5, transparent:true, opacity:0.5, envMapIntensity:0.5 });
    var gel = new THREE.Mesh(new THREE.BoxGeometry(2.0,0.14,1.2), gelMat);
    gel.position.set(0,0.66,0); grp.add(gel);
    // migrating bands (lanes) — move from the wells (back) toward the front
    var bands=[];
    var bandMat = new THREE.MeshBasicMaterial({ color:0x2f6ad0, transparent:true, opacity:0.85 });
    // Children of the gel mesh → y is in ITS local space (slab top +0.07). The old 0.735
    // was a group-space height: it put the bands ~1.4 up, floating ABOVE the tank lid.
    for(var l=0;l<5;l++){ var bx=-0.8+l*0.4;
      var band=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.02,0.05), bandMat.clone());
      band.position.set(bx,0.07-0.01+0.002,-0.5); fx(band,'decal'); gel.add(band); bands.push(band); }
    var label=makeLabel("Electrophoresis",""); label.position.set(0,1.5,0); grp.add(label);
    grp.userData.label=label;
    grp.userData.showGel=function(on){ gel.visible=!!on; };
    grp.userData.setLidLift=function(q){ lidGrp.position.y=clamp(q,0,1)*1.15; };  // straight up, leads with it
    grp.userData.update=function(){};
    var tankRoot=fitArt(grp,'gel_tank_mini'), TF=tankRoot.userData.fit;
    tagSpec(tankRoot,'gel_tank_mini');
    // the GEL PLATFORM between the electrode wells (functional, real size): a raised bed
    // on the tank floor the casting tray is set on — sized to the tray, platform_height up.
    // The run buffer covers it. (The old dock left the gel hanging mid-buffer.)
    var GT=dims('gel_tray_7x10'), GD=dims('gel_tank_mini'), gap=clearance('bench_gap');
    var floorY=TF.toWorld(0,0.29,0).y, platY=floorY+GD.platform_height;
    var bed=new THREE.Mesh(new THREE.BoxGeometry(GT.width+gap*0.5,GD.platform_height,GT.depth+gap*0.5), frameMat);
    bed.position.y=(floorY+platY)/2; tankRoot.add(bed);
    addSocket(tankRoot,'platform',{ position:new THREE.Vector3(0,platY,0) });
    tankRoot.userData.sampleSocket='platform';
    tankRoot.userData.rimY=TF.toWorld(0,0.9,0).y;          // a docked gel lifts clear of the rim
    // the POWER SUPPLY is its own instrument (dims('power_supply')), on the bench beside the tank
    var pg=new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.7,0.6), matPainted(0xd8dee6,0.44));
    box.position.set(0,0.35,0); box.castShadow=true; pg.add(box);
    var vc=document.createElement("canvas"); vc.width=128; vc.height=80; var vg=vc.getContext("2d");
    var vTex=new THREE.CanvasTexture(vc); vTex.anisotropy=MAX_ANISO;
    function drawV(v){ vg.fillStyle="#0d1218"; vg.fillRect(0,0,128,80);
      vg.fillStyle="#8fcabf"; vg.font="700 34px 'IBM Plex Mono'"; vg.textAlign="right"; vg.fillText(Math.round(v)+"", 96,52);
      vg.fillStyle="#727a85"; vg.font="600 16px 'IBM Plex Sans'"; vg.fillText("V", 120,52); vTex.needsUpdate=true; }
    drawV(0);
    var vDisp=new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.3), new THREE.MeshBasicMaterial({map:vTex,transparent:true}));
    vDisp.position.set(0,0.5,0.31); fx(vDisp,'decal'); pg.add(vDisp);
    var psu=tagSpec(fitArt(pg,'power_supply'),'power_supply');
    var PS=dims('power_supply');
    var root=new THREE.Group(); root.add(tankRoot); root.add(psu);
    psu.position.set(GD.width/2+gap+PS.width/2, 0, 0);
    // the ASSEMBLY's origin is the centre of its base: centre the tank + supply pair
    var shiftX=-(psu.position.x+PS.width/2-GD.width/2)/2;
    tankRoot.position.x+=shiftX; psu.position.x+=shiftX;
    // cables from the lid terminals to the supply's front sockets, IN THE LID'S FRAME so the
    // leads come up with it. Flexible leads plugged into both ends: not rigid solids.
    root.updateMatrixWorld(true);
    function gelCable(fromArt, toWorld, color){
      var to=lidGrp.worldToLocal(toWorld.clone());
      var mid=new THREE.Vector3((fromArt.x+to.x)/2,Math.max(fromArt.y,to.y)+0.32,(fromArt.z+to.z)/2);
      var curve=new THREE.CatmullRomCurve3([fromArt,mid,to]);
      return fx(new THREE.Mesh(new THREE.TubeGeometry(curve,22,0.028,8,false), matRubber(color)),'cable');
    }
    var jack=function(dx){ return new THREE.Vector3(psu.position.x-PS.width*0.3+dx, PS.height*0.3, PS.depth/2); };
    lidGrp.add(gelCable(new THREE.Vector3(-0.5,1.1,0.6), jack(0), 0xc0392b));
    lidGrp.add(gelCable(new THREE.Vector3(-0.2,1.1,0.6), jack(PS.width*0.12), 0x22272e));
    // the rig's hooks, on the composite (the TANK is the host of its socket)
    root.userData.label=tankRoot.userData.label;
    root.userData.sockets=tankRoot.userData.sockets; root.userData.sampleSocket='platform';
    root.userData.tank=tankRoot; root.userData.psu=psu; root.userData.rimY=tankRoot.userData.rimY;
    root.userData.showGel=tankRoot.userData.showGel; root.userData.setLidLift=tankRoot.userData.setLidLift;
    root.userData.setProgress=function(p){
      var e=easeInOut(clamp(p,0,1));
      for(var k=0;k<bands.length;k++){ bands[k].position.z = -0.5 + e*0.9; }  // migrate toward the front
      drawV(p>0.02 ? 100 : 0);
    };
    root.userData.setVolts=function(on){ drawV(on?100:0); };
    root.userData.update=function(){};
    root.userData.setProgress(0);
    return root;
  }

  /* ---------- open ice bucket (cold storage — keep on ice / −80 °C) ---------- */
  function buildIceBucket(){
    // REAL SIZE from dims('ice_bucket_4l'): an open insulated tub, the tube stands on its
    // FLOOR (socket 'bed') and crushed ice is packed round it to ice_depth. (The old tube
    // hovered among the cubes with nothing under it.)
    var grp = new THREE.Group();
    var D=dims('ice_bucket_4l'), T=dims('microtube_1_5');
    var R=D.radius, H=D.height, WALL=D.wall, RB=R*0.84, FL=WALL;
    var steel = matBrushed(0xc4cbd4); steel.roughness=0.4;
    var steelDk = matBrushed(0x929ba6);
    var wall = new THREE.Mesh(new THREE.CylinderGeometry(R,RB,H,44,1,true), steel);
    wall.position.y=H/2; wall.castShadow=true; wall.receiveShadow=true; grp.add(wall);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(R-WALL*0.2,WALL*0.2,14,48), steelDk);
    rim.rotation.x=Math.PI/2; rim.position.y=H-WALL*0.2; grp.add(rim);
    var innerMat = new THREE.MeshStandardMaterial({ color:0x6f7d89, metalness:0.3, roughness:0.55, envMapIntensity:0.7, side:THREE.DoubleSide }); // muted cool-grey interior
    var inner = new THREE.Mesh(new THREE.CylinderGeometry(R-WALL,RB-WALL,H-FL,44,1,true), innerMat);
    inner.position.y=FL+(H-FL)/2; fx(inner,'decal'); grp.add(inner);
    var base = new THREE.Mesh(new THREE.CylinderGeometry(RB,RB,FL,44), innerMat);
    base.position.y=FL/2; grp.add(base);                                 // the insulated floor
    addSocket(grp,'bed',{ position:new THREE.Vector3(0,FL,0) });
    // crushed ICE packed to ice_depth, leaving the centre clear for the tube
    var iceMat=new THREE.MeshPhysicalMaterial({ color:0xd4e2ea, roughness:0.14,
      transparent:true, opacity:0.55, clearcoat:0.8, envMapIntensity:1.0, flatShading:true, depthWrite:false });
    var iceTop=FL+D.ice_depth, clearR=T.radius*1.8;
    for(var ic=0;ic<12;ic++){
      var a=Math.random()*Math.PI*2, cs=R*(0.16+Math.random()*0.1), rr=clearR+cs+Math.random()*(RB-WALL-clearR-2*cs);
      var cube=new THREE.Mesh(new THREE.IcosahedronGeometry(cs,0), iceMat);
      cube.position.set(Math.cos(a)*rr, iceTop-cs*(0.3+Math.random()*0.6), Math.sin(a)*rr);
      cube.rotation.set(Math.random(),Math.random(),Math.random());
      cube.castShadow=true; fx(cube,'granular'); grp.add(cube);
    }
    // faint frost rime on the outer wall
    var frostMat=new THREE.MeshStandardMaterial({ color:0xe1e9ef, roughness:0.9, envMapIntensity:0.4 });
    var frostGeo=new THREE.SphereGeometry(1,6,5);
    for(var fr=0;fr<22;fr++){
      var fm=new THREE.Mesh(frostGeo,frostMat);
      var fa=Math.random()*Math.PI*2, fy=H*(0.13+Math.random()*0.8);
      var rAt=lerp(RB,R,fy/H);
      fm.position.set(Math.cos(fa)*rAt, fy, Math.sin(fa)*rAt);
      var fs=R*(0.014+Math.random()*0.027); fm.scale.set(fs,fs,fs); fx(fm,'effect'); grp.add(fm);
    }
    var label = makeLabel("On ice","");   // (was sublabelled "store −80 °C" — ice is not −80 °C)
    label.position.set(0,H+LABEL_GAP,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    grp.userData.sampleSocket='bed';
    return tagSpec(grp,'ice_bucket_4l');
  }

  /* ---------- benchtop centrifuge ---------- */
  function buildCentrifuge(){
    var grp = new THREE.Group();
    var shell = matPainted(0xa6aeb9, 0.42);      // dove-grey upper shell (two-tone top)
    var shellDk = matPainted(0x2b323c, 0.5);     // graphite accent panels
    var metalBase = matBrushed(0x707a86);        // brushed graphite metal base (catches key light)
    // realistic light-grey instrument shell with just a slim brand-blue accent (no glow)
    var trim  = new THREE.MeshStandardMaterial({ color:0x9fb6cf, metalness:0.3, roughness:0.42,
      envMapIntensity:0.7 });
    var foot = new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.58,0.18,56), matBrushed(0x7c8590));
    foot.position.y=0.09; foot.receiveShadow=true; grp.add(foot);
    var base = new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.5,0.62,56), metalBase);
    base.position.y=0.44; base.castShadow=true; base.receiveShadow=true; grp.add(base);
    // rubber feet
    var cfFoot=matRubber(0x161a20);
    for(var ft=0;ft<4;ft++){ var fa=ft/4*Math.PI*2+Math.PI/4;
      var fm=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.18,0.1,16), cfFoot);
      fm.position.set(Math.cos(fa)*1.34,0.05,Math.sin(fa)*1.34); grp.add(fm); }
    // cooling vent slits around the base
    var cfVent=new THREE.MeshStandardMaterial({ color:0x11151a, roughness:0.85, metalness:0.3, envMapIntensity:0.4 });
    for(var vv=0;vv<20;vv++){ var va=vv/20*Math.PI*2;
      var vent=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.24,0.03), cfVent);
      vent.position.set(Math.cos(va)*1.40,0.4,Math.sin(va)*1.40); vent.rotation.y=-va; grp.add(vent); }
    // the body is a RING around the bowl (open walls + a top annulus): the old solid
    // cylinder put the rotor, and every tube in it, inside solid shell
    var body = new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.3,0.5,56,1,true), shell);
    body.position.y=0.9; grp.add(body);
    var bodyTop = new THREE.Mesh(new THREE.RingGeometry(1.15,1.25,56), shell);
    bodyTop.rotation.x=-Math.PI/2; bodyTop.position.y=1.15; grp.add(bodyTop);
    var lipRing = new THREE.Mesh(new THREE.TorusGeometry(1.24,0.05,16,60), shellDk);
    lipRing.rotation.x=Math.PI/2; lipRing.position.y=1.14; grp.add(lipRing);
    var ringT = new THREE.Mesh(new THREE.TorusGeometry(1.2,0.072,16,60), trim);
    ringT.rotation.x=Math.PI/2; ringT.position.y=1.12; grp.add(ringT);
    // bold petrol-teal accent band wrapping the metal base — a real colour panel, not a dot
    var accentBand = new THREE.Mesh(new THREE.CylinderGeometry(1.315,1.315,0.13,56,1,true), trim);
    accentBand.position.y=0.7; grp.add(accentBand);

    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.0,0.5,48,1,true),
      new THREE.MeshStandardMaterial({color:0x15191f,metalness:0.4,roughness:0.7,side:THREE.DoubleSide}));
    bowl.position.y=0.9; grp.add(bowl);

    var rotor = new THREE.Group(); rotor.position.y=1.08;
    var rotorMat = matBrushed(0x9ba6b2);
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.4,0.34,32), rotorMat); rotor.add(hub);
    // (the rotor DISC is built after the fit, with real holes where the slots pass through it)
    var nut = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.14,0.12,6), matBrushed(0x828d99));
    nut.position.y=0.2; rotor.add(nut);
    var slotMat = new THREE.MeshStandardMaterial({ color:0x252d37, metalness:0.5, roughness:0.5, envMapIntensity:0.6 });
    var holders=[];
    for(var k=0;k<8;k++){
      var a=k/8*Math.PI*2;
      var holder=new THREE.Group();
      var slot=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.09,0.62,20,1,true), slotMat); holder.add(slot);
      var slotBot=new THREE.Mesh(new THREE.SphereGeometry(0.09,16,10,0,Math.PI*2,Math.PI*0.5,Math.PI*0.5),slotMat);
      slotBot.position.y=-0.31; holder.add(slotBot);
      holder.position.set(Math.cos(a)*0.62,0.0,Math.sin(a)*0.62);
      // clean fixed-angle rotor: every slot tilts outward by the SAME angle around its tangential axis
      holder.quaternion.setFromAxisAngle(new THREE.Vector3(-Math.sin(a),0,Math.cos(a)), -0.40);
      rotor.add(holder); holders.push(holder);   // exposed so stationSpin can dock the sample IN a slot
    }
    // printed well numbers around the rotor face
    var numC=document.createElement("canvas"); numC.width=256; numC.height=256; var numG=numC.getContext("2d");
    numG.clearRect(0,0,256,256);
    numG.fillStyle="#c2c9d2"; numG.font="700 24px 'IBM Plex Sans'"; numG.textAlign="center"; numG.textBaseline="middle";
    for(var nn=0;nn<8;nn++){ var na=nn/8*Math.PI*2 - Math.PI/2, nx=128+Math.cos(na)*82, ny=128+Math.sin(na)*82;
      numG.fillText((nn+1)+"", nx, ny); }
    var numTex=new THREE.CanvasTexture(numC); numTex.anisotropy=MAX_ANISO;
    var numPlate=new THREE.Mesh(new THREE.CircleGeometry(0.82,44),
      new THREE.MeshBasicMaterial({ map:numTex, transparent:true, depthWrite:false }));
    numPlate.rotation.x=-Math.PI/2; numPlate.position.y=0.05; fx(numPlate,'decal'); rotor.add(numPlate);
    grp.add(rotor);

    var rc=document.createElement("canvas"); rc.width=256; rc.height=128; var rg=rc.getContext("2d");
    var rTex=new THREE.CanvasTexture(rc); rTex.anisotropy=MAX_ANISO;
    function drawRPM(v){
      rg.fillStyle="#12161c"; rg.fillRect(0,0,256,128);
      rg.strokeStyle="rgba(90,100,116,0.4)"; rg.lineWidth=3; rg.strokeRect(6,6,244,116);
      rg.fillStyle="#8fcabf"; rg.font="700 52px 'IBM Plex Mono'"; rg.textAlign="right";
      rg.fillText(Math.round(v)+"", 200,72);
      rg.fillStyle="#727a85"; rg.font="600 20px 'IBM Plex Sans'"; rg.fillText("× g", 244,72);
      rg.textAlign="left"; rg.fillText("SPEED", 16,34);
      rTex.needsUpdate=true;
    }
    drawRPM(0);
    var readout=new THREE.Mesh(new THREE.PlaneGeometry(0.62,0.31), new THREE.MeshBasicMaterial({map:rTex,transparent:true}));
    readout.position.set(0,0.62,1.31); readout.rotation.x=-0.32; fx(readout,'decal'); grp.add(readout);
    var roFrame=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.4,0.05), shellDk);
    roFrame.position.set(0,0.62,1.29); roFrame.rotation.x=-0.32; grp.add(roFrame);

    var domeMat = fresnelize(new THREE.MeshPhysicalMaterial({ color:0x282d36, roughness:0.12,
      transparent:true, opacity:0.5, clearcoat:1, clearcoatRoughness:0.08, envMapIntensity:1.1,
      side:THREE.DoubleSide, depthWrite:false }));
    var lidPivot = new THREE.Group(); lidPivot.position.set(0,1.16,-1.2); grp.add(lidPivot);
    var dome = new THREE.Mesh(new THREE.SphereGeometry(1.22,44,30,0,Math.PI*2,0,Math.PI*0.5), domeMat);
    dome.position.set(0,0,1.2); lidPivot.add(dome);
    var lidRim = new THREE.Mesh(new THREE.TorusGeometry(1.2,0.045,14,60), matBrushed(0x6d7783));
    lidRim.rotation.x=Math.PI/2; lidRim.position.set(0,0.01,1.2); lidPivot.add(lidRim);
    var handle = new THREE.Mesh(new THREE.TorusGeometry(0.16,0.03,12,24,Math.PI), matPlastic(0x232a33));
    handle.position.set(0,0.6,2.2); handle.rotation.x=Math.PI/2; lidPivot.add(handle);

    // (status LED + start button removed — colour comes only from liquids/caps/reagents)

    var label = makeLabel("Centrifuge","");
    label.position.set(0,2.5,0); grp.add(label);

    var st={ spin:0,tSpin:0,lid:1,tLid:1 };   // lid: 1=open, 0=closed (starts open)
    grp.userData.rotor=rotor; grp.userData.dome=dome; grp.userData.label=label; grp.userData.st=st;
    grp.userData.holders=holders;
    grp.userData.setSpin=function(v){ st.tSpin=v; };
    // IMPROVEMENT: explicit lid hook. stationSpin closes it before the rotor spins
    // up and opens it once the rotor stops (no longer auto-coupled to spin).
    grp.userData.setLid=function(open){ st.tLid = open?1:0; };
    grp.userData.setLabel=function(t,s){ label.userData.update(t,s||""); };
    grp.userData.update=function(dt){
      st.spin=lerp(st.spin,st.tSpin,1-Math.pow(0.01,dt));
      rotor.rotation.y += st.spin*dt;
      st.lid=lerp(st.lid,st.tLid,1-Math.pow(0.02,dt));
      lidPivot.rotation.x = -easeInOut(st.lid)*1.15;
      drawRPM(Math.min(st.spin,26)/26*13400);
    };
    var root=fitArt(grp,'microcentrifuge'), F=root.userData.fit;
    // The ROTOR at real size and a UNIFORM scale u (a tube riding a slot must not be
    // squashed by the body's height fit): its slots sit at the table's rotor radius and
    // fixed angle (dims: F-45-12-11, 45°) — the old rotor tilted them 23°. Each slot is a
    // socket at its round bottom; a vessel rides it (reparented) while it spins.
    var CD=dims('microcentrifuge'), u=F.sx;
    rotor.scale.set(u/F.sx, u/F.sy, u/F.sz);
    var rr=CD.rotor_radius/u, ang=CD.rotor_angle*Math.PI/180;
    // raise the rotor so its tilted slots' bottoms clear the bowl floor (the base top, drawing
    // y 0.75): slot bottom = 0.40 (drawing, rotor units) down the slot axis
    var floorW=F.toWorld(0,0.75,0).y, drop=0.40*u*Math.cos(ang), margin=clearance('socket_fit')*3;
    rotor.position.y=(floorW+drop+margin-F.art.position.y)/F.sy;
    holders.forEach(function(h,k){ var a=k/holders.length*Math.PI*2;
      h.position.set(Math.cos(a)*rr,0,Math.sin(a)*rr);
      h.quaternion.setFromAxisAngle(new THREE.Vector3(-Math.sin(a),0,Math.cos(a)), -ang);
      addSocket(root,'slot'+k,{ parent:h, position:new THREE.Vector3(0,-0.40,0) }); });
    // the rotor DISC (rotor units) with a hole where each tilted slot crosses it: the slot
    // (top radius 0.11) passes a slab 0.12 thick at the rotor angle — the old disc was solid
    var DT=0.12, holeR=0.11/Math.cos(ang)+(DT/2)*Math.tan(ang)+0.01;
    var dholes=holders.map(function(h,k){ var a=k/holders.length*Math.PI*2, rc=rr-0.02*Math.tan(ang); return [Math.cos(a)*rc, Math.sin(a)*rc, holeR]; });
    var dsh=new THREE.Shape(); dsh.absarc(0,0,0.95,0,Math.PI*2,false);
    dholes.forEach(function(hh){ var hp=new THREE.Path(); hp.absarc(hh[0],-hh[1],hh[2],0,Math.PI*2,true); dsh.holes.push(hp); });
    var dg=new THREE.ExtrudeGeometry(dsh,{ depth:DT, bevelEnabled:false, curveSegments:28 }); dg.rotateX(-Math.PI/2);
    var disc=new THREE.Mesh(dg, rotorMat); disc.position.y=-0.02-DT/2; rotor.add(disc);
    root.userData.sampleSocket='slot2';      // the slot facing the camera at rest
    root.userData.rimY=F.toWorld(0,1.16,0).y; // the bowl rim (lid seat)
    return tagSpec(root,'microcentrifuge');
  }

  /* ---------- waste beaker ---------- */
  function buildWaste(){
    var grp = new THREE.Group();
    var m = matFrosted(0x2b323c); m.opacity=0.7;
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.42,1.0,44,1,true), m);
    body.position.y=0.5; body.castShadow=true; grp.add(body);
    var innerMat = new THREE.MeshStandardMaterial({ color:0x14181e, roughness:0.9, side:THREE.DoubleSide });
    var inner = new THREE.Mesh(new THREE.CylinderGeometry(0.46,0.4,1.0,44,1,true), innerMat);
    inner.position.y=0.5; grp.add(inner);
    var floor = new THREE.Mesh(new THREE.CircleGeometry(0.4,44), innerMat);
    floor.rotation.x=-Math.PI/2; floor.position.y=0.02; grp.add(floor);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.5,0.035,14,48), matPlastic(0x323942));
    rim.rotation.x=Math.PI/2; rim.position.y=1.0; grp.add(rim);
    var junk=matFrosted(0xdfe6ee); junk.opacity=0.5;
    for(var q=0;q<2;q++){
      var jt=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.06,0.5,20), junk);
      jt.position.set(-0.12+q*0.24,0.35,0.05); jt.rotation.z=(q?0.4:-0.5); jt.rotation.x=0.2; grp.add(jt);
    }
    var label = makeLabel("Flow-through","discard");
    label.position.set(0,1.7,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    var root=fitArt(grp,'beaker_600');
    root.userData.mouth=new THREE.Vector3(0,dims('beaker_600').height,0);
    return tagSpec(root,'beaker_600');
  }

  /* ---------- Syringe (manual homogenization: pass through a needle) ---------- */
  // Built needle-DOWN with the needle tip at the local origin (y=0), so the
  // caller can dip the tip into the tube and tilt the whole group. setPlunge(t)
  // drives the plunger: t=0 drawn up (full), t=1 pressed down (expelled).
  function buildSyringe(){
    var grp = new THREE.Group();
    var BARREL_BOT=0.9, BARREL_TOP=2.1, BR=0.15;   // barrel spans y 0.9..2.1
    var PISTON_REST=1.9;                            // piston bottom when full (t=0)
    var TRAVEL=0.8;                                 // how far the plunger presses

    // needle — thin steel, tip at y=0
    var steel = matBrushed(0xc4ccd6);
    var needle = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.009,0.72,16), steel);
    needle.position.y=0.36; needle.castShadow=true; grp.add(needle);
    // coloured luer hub (clinical 20-21 G ≈ green/yellow); connects needle to barrel
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.03,0.18,24), matPlastic(0x4faa6a));
    hub.position.y=0.8; grp.add(hub);
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(BR,0.06,0.12,32), matPlastic(0xdfe6ee));
    neck.position.y=0.92; grp.add(neck);

    // clear barrel (open cylinder so the fluid reads through it)
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(BR,BR,BARREL_TOP-BARREL_BOT,40,1,true), glassMaterial());
    barrel.position.y=(BARREL_TOP+BARREL_BOT)/2; barrel.castShadow=true; grp.add(barrel);
    var barrelRim = new THREE.Mesh(new THREE.TorusGeometry(BR,0.014,12,44), matFrosted(0xeef3f8));
    barrelRim.rotation.x=Math.PI/2; barrelRim.position.y=BARREL_TOP; grp.add(barrelRim);
    // finger flanges at the top of the barrel
    var flange = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.05,0.2), matFrosted(0xeef3f8));
    flange.position.y=BARREL_TOP+0.02; grp.add(flange);

    // fluid inside the barrel (below the piston). Built at unit height, scaled per plunge.
    var fluidMat = new THREE.MeshPhysicalMaterial({ color:COL.lysis, roughness:0.32, transparent:false,
      emissive:COL.lysis, emissiveIntensity:0.12, envMapIntensity:0.6 });
    var fluid = new THREE.Mesh(new THREE.CylinderGeometry(BR*0.92,BR*0.92,1,32), fluidMat);
    fx(fluid,'fluid'); grp.add(fluid);

    // plunger sub-group (piston + rod + thumb rest) — translated down as it presses
    var plungerGrp = new THREE.Group(); grp.add(plungerGrp);
    var piston = new THREE.Mesh(new THREE.CylinderGeometry(BR*0.96,BR*0.96,0.09,28), matRubber(0x2a323c));
    piston.position.y=PISTON_REST+0.045; plungerGrp.add(piston);
    var rod = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.75,20), matPlastic(0xe8edf2));
    rod.position.y=PISTON_REST+0.42; plungerGrp.add(rod);
    var thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.05,30), matPlastic(0xd7dee6));
    thumb.position.y=PISTON_REST+0.8; plungerGrp.add(thumb);

    grp.userData.setColor=function(hex){ fluidMat.color.set(hex); fluidMat.emissive.set(hex); };
    grp.userData.setPlunge=function(t){
      t=clamp(t,0,1);
      plungerGrp.position.y=-TRAVEL*t;
      var top=PISTON_REST - TRAVEL*t;              // fluid top follows the piston
      var h=Math.max(0.001, top-BARREL_BOT);
      fluid.scale.y=h; fluid.position.y=(top+BARREL_BOT)/2;
    };
    grp.userData.setPlunge(0);
    grp.userData.update=function(){};
    var label = makeLabel("20–21 G needle","homogenize");
    label.position.set(0,2.55,0); grp.add(label); grp.userData.label=label;
    // held by the needle TIP (its origin), which is also its base: the drawing's own x/z
    return tagSpec(fitArt(grp,'syringe_1ml',{ pivot:'origin' }),'syringe_1ml');
  }

  /* ---------- NanoDrop ---------- */
  function buildNanoDrop(){
    var grp = new THREE.Group();
    var shell = matPainted(0xb0b8c2, 0.44);      // dove-grey upper body (no more flat white)
    var shellDk = matPainted(0x272d36, 0.5);     // graphite base / fascia
    var footPl = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.1,1.3), shellDk);
    footPl.position.y=0.05; footPl.receiveShadow=true; grp.add(footPl);
    var base = new THREE.Mesh(new THREE.BoxGeometry(1.58,0.44,1.18), shellDk);
    base.position.y=0.32; base.castShadow=true; base.receiveShadow=true; grp.add(base);
    var deck = new THREE.Mesh(new THREE.BoxGeometry(1.5,0.05,1.1), shellDk);
    deck.position.y=0.56; grp.add(deck);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(0.42,1.05,0.52), shell);
    arm.position.set(-0.5,1.05,0); grp.add(arm);
    var armPivot=new THREE.Group(); armPivot.position.set(-0.32,1.5,0); grp.add(armPivot);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.82,0.34,0.56), shellDk);
    head.position.set(0.34,-0.02,0); armPivot.add(head);
    var headLip = new THREE.Mesh(new THREE.BoxGeometry(0.84,0.06,0.58), shellDk);
    headLip.position.set(0.34,-0.2,0); armPivot.add(headLip);
    armPivot.rotation.z=0.12;
    var pedMat = new THREE.MeshStandardMaterial({ color:0xcdd3da, metalness:0.85, roughness:0.28, envMapIntensity:1.1 });
    if(TEX.brushedN){ pedMat.normalMap=TEX.brushedN; pedMat.normalScale=new THREE.Vector2(0.3,0.3); pedMat.roughnessMap=TEX.brushedR; }
    var pedBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.16,0.06,28), pedMat);
    pedBase.position.set(0.15,0.58,0); grp.add(pedBase);
    var ped = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.09,0.1,26), pedMat);
    ped.position.set(0.15,0.63,0); grp.add(ped);
    var upperPin = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,0.1,20), pedMat);
    armPivot.add(upperPin); upperPin.position.set(0.15,-0.12,0);

    var sc = document.createElement("canvas"); sc.width=720; sc.height=480;
    var sg = sc.getContext("2d");
    drawTrace(sg,0);
    var scTex = new THREE.CanvasTexture(sc); scTex.anisotropy=MAX_ANISO;
    var scMat = new THREE.MeshBasicMaterial({ map:scTex, transparent:true });
    var screen = new THREE.Mesh(new THREE.PlaneGeometry(1.15,0.78), scMat);
    screen.position.set(0.55,1.0,0.61); fx(screen,'decal'); grp.add(screen);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(1.25,0.9,0.06), new THREE.MeshStandardMaterial({color:0x2a2f36, emissive:0x1FA6C8, emissiveIntensity:0.14, roughness:0.5, envMapIntensity:0.6}));
    frame.position.set(0.55,1.0,0.58); grp.add(frame);

    // coloured accents — teal trim strip, green power LED, blue sample button
    var ndTrim=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.04,0.04),
      new THREE.MeshStandardMaterial({ color:0x2fa898, metalness:0.3, roughness:0.4, envMapIntensity:0.7 }));
    ndTrim.position.set(0,0.55,0.6); grp.add(ndTrim);
    // (status LED + sample button removed — colour comes only from liquids/caps/reagents)

    var label = makeLabel("NanoDrop","A260/280 = 2.0");
    label.position.set(0.4,2.15,0); grp.add(label);

    var st={ prog:0,tProg:0 };
    grp.userData.screenTex=scTex; grp.userData.sg=sg; grp.userData.label=label; grp.userData.st=st;
    grp.userData.setProgress=function(v){ st.tProg=v; };
    grp.userData.update=function(dt){
      st.prog=lerp(st.prog,st.tProg,1-Math.pow(0.01,dt));
      drawTrace(sg,st.prog); scTex.needsUpdate=true;
    };
    return tagSpec(fitArt(grp,'nanodrop'),'nanodrop');
  }
  function drawTrace(g,prog){
    var W=720,H=480,S=2;
    g.clearRect(0,0,W,H);
    var bg=g.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,"#161b22"); bg.addColorStop(1,"#101319");
    g.fillStyle=bg; g.fillRect(0,0,W,H);
    g.strokeStyle="rgba(120,132,150,0.12)"; g.lineWidth=1*S;
    for(var i=1;i<6;i++){ g.beginPath(); g.moveTo(0,i*80); g.lineTo(W,i*80); g.stroke(); }
    for(var j=1;j<9;j++){ g.beginPath(); g.moveTo(j*80,0); g.lineTo(j*80,H); g.stroke(); }
    g.strokeStyle="#8fb59c"; g.lineWidth=3*S; g.beginPath();
    for(var x=0;x<=W;x+=6){
      var nm = 220 + (x/W)*140;
      var peak = Math.exp(-Math.pow((nm-260)/26,2))*1.0;
      var shoulder = Math.exp(-Math.pow((nm-230)/14,2))*0.18;
      var y = 400 - (peak+shoulder)*300*clamp(prog,0,1);
      if(x===0) g.moveTo(x,y); else g.lineTo(x,y);
    }
    g.stroke();
    g.fillStyle="#8fcabf"; g.font="600 "+(18*S)+"px 'IBM Plex Sans'"; g.textAlign="left";
    g.fillText("A260/280  " + (1.8+0.2*clamp(prog,0,1)).toFixed(2), 28, 52);
    g.fillStyle="#aab2bc"; g.font="500 "+(15*S)+"px 'IBM Plex Sans'";
    g.fillText("A260/230  " + (1.6+0.5*clamp(prog,0,1)).toFixed(2), 28, 96);
    g.fillStyle="#727a85"; g.font="500 "+(12*S)+"px 'IBM Plex Sans'"; g.textAlign="right";
    g.fillText("260 nm", 600, 448);
  }

  /* ---------- inverted microscope (Stage-12 #4) — a culture FLASK rests on the open
     stage and is viewed from BELOW: the objective turret sits UNDER the stage, the
     illumination column arches OVER it. For "observe the cells" on adherent culture. */
  function buildInvertedMicroscope(){
    var grp=new THREE.Group();
    var shell=matPainted(0xc4cad2,0.5), dark=matPainted(0x2b313a,0.5), steel=matBrushed(0xb7c0cc);
    var foot=new THREE.Mesh(new THREE.BoxGeometry(2.3,0.12,1.7), dark); foot.position.y=0.06; foot.receiveShadow=true; grp.add(foot);
    var base=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.5,1.5), shell); base.position.y=0.36; base.castShadow=true; base.receiveShadow=true; grp.add(base);
    // objective turret rising from the base to just under the stage (the inverted cue)
    var turret=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.24,0.5,24), dark); turret.position.set(0,0.9,0.1); grp.add(turret);
    for(var i=0;i<3;i++){ var a=i*2.1; var ob=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.05,0.22,16), steel);
      ob.position.set(Math.cos(a)*0.11,1.08,0.1+Math.sin(a)*0.11); grp.add(ob); }
    // the open STAGE with a central aperture — the flask sits here
    var stageY=1.35;
    var stage=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.08,1.3), matPlastic(0x3a4049)); stage.position.set(0,stageY,0); grp.add(stage);
    var aperture=new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.26,0.08,24), dark); aperture.position.set(0,stageY,0.1); grp.add(aperture);  // FLUSH with the stage (it stood 5 mm proud, under the flask)
    // illumination column arching OVER the stage, lamp housing pointing down
    var back=new THREE.Mesh(new THREE.BoxGeometry(0.34,1.9,0.34), shell); back.position.set(0,1.95,-0.62); grp.add(back);
    var arm=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.3,0.95), shell); arm.position.set(0,2.78,-0.2); grp.add(arm);
    var lampHous=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.2,0.28,20), dark); lampHous.position.set(0,2.52,0.1); grp.add(lampHous);
    var lampLight=new THREE.PointLight(0xfff2d8,0.0,3); lampLight.position.set(0,2.3,0.1); grp.add(lampLight);
    // binocular eyepieces angled toward the viewer at the front
    var head=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.3,0.5), dark); head.position.set(0,0.64,0.78); grp.add(head);
    var ey1=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.08,0.34,16), dark); ey1.position.set(-0.14,0.84,0.95); ey1.rotation.x=1.0; grp.add(ey1);
    var ey2=ey1.clone(); ey2.position.x=0.14; grp.add(ey2);
    var label=makeLabel("Inverted microscope",""); label.position.set(0,3.3,0); grp.add(label); grp.userData.label=label;
    var st={ lit:0, tLit:0.85 };
    grp.userData.setProgress=function(v){ st.tLit=0.4+0.5*clamp(v,0,1); };
    grp.userData.update=function(dt){ st.lit=lerp(st.lit,st.tLit,1-Math.pow(0.02,dt)); lampLight.intensity=st.lit*0.9; };
    grp.userData.update(0.001);
    var root=fitArt(grp,'microscope_inverted');
    addSocket(root,'stage',{ position:root.userData.fit.toWorld(0,stageY+0.04,0) });
    root.userData.sampleSocket='stage';
    return tagSpec(root,'microscope_inverted');
  }

  /* ---------- upright light microscope (Stage-12 #4) — a SLIDE on the stage, viewed
     from ABOVE at 100× oil immersion; the optical axis (illuminator → stage → nosepiece)
     is at x=0 so the slide seats cleanly. The Gram-stain read + haemocytometer count. */
  function buildLightMicroscope(){
    var grp=new THREE.Group();
    var shell=matPainted(0x20262e,0.5), steel=matBrushed(0xc2cad4), stageMat=matPlastic(0x2b313a);
    var foot=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.18,1.6), shell); foot.position.set(0.1,0.09,0); foot.receiveShadow=true; grp.add(foot);
    var arm=new THREE.Mesh(new THREE.BoxGeometry(0.42,2.2,0.5), shell); arm.position.set(0.62,1.25,-0.35); grp.add(arm);
    // illuminator base UNDER the stage (optical axis x=0)
    var illum=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.3,0.3,24), shell); illum.position.set(0,0.5,0); grp.add(illum);
    var illumLight=new THREE.PointLight(0xffffff,0.0,2); illumLight.position.set(0,0.74,0); grp.add(illumLight);
    // the STAGE — the slide rests here
    var stageY=0.98;
    var stage=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.07,1.0), stageMat); stage.position.set(0,stageY,0); grp.add(stage);
    var clip=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.04,0.06), steel); clip.position.set(0,stageY+0.07,0.32); grp.add(clip);
    // nosepiece + objectives ABOVE, the long 100× oil objective nearly touching the slide
    var nose=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,0.16,20), shell); nose.position.set(0,1.56,0); grp.add(nose);
    var objL=[0.34,0.26]; for(var i=0;i<2;i++){ var a=1.9+i*2.1; var ob=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.045,objL[i],16), steel);
      ob.position.set(Math.cos(a)*0.1, 1.56-objL[i]/2, Math.sin(a)*0.1); grp.add(ob); }
    var oil=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.04,0.44,16), steel); oil.position.set(0,1.32,0); grp.add(oil);
    // body tube + binocular head + focus knob (offset to the arm side)
    var body=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.8,0.4), shell); body.position.set(0.3,1.72,-0.12); grp.add(body);
    var ey1=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.08,0.34,16), shell); ey1.position.set(0.16,2.06,0.26); ey1.rotation.x=1.05; grp.add(ey1);
    var ey2=ey1.clone(); ey2.position.x=0.44; grp.add(ey2);
    var knob=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.12,26), matBrushed(0xb7bfca)); knob.rotation.z=Math.PI/2; knob.position.set(0.62,0.66,0.12); grp.add(knob);
    var label=makeLabel("Light microscope","100× oil"); label.position.set(0,2.55,0); grp.add(label); grp.userData.label=label;
    var il={ v:0, t:0.9 }; grp.userData.setProgress=function(v){ il.t=0.5+0.5*clamp(v,0,1); };
    grp.userData.update=function(dt){ il.v=lerp(il.v,il.t,1-Math.pow(0.02,dt)); illumLight.intensity=il.v*0.7; };
    grp.userData.update(0.001);
    var root=fitArt(grp,'microscope_upright');
    addSocket(root,'stage',{ position:root.userData.fit.toWorld(0,stageY+0.035,0) });   // the stage top (0.07 thick)
    root.userData.sampleSocket='stage';
    return tagSpec(root,'microscope_upright');
  }

  /* ---------- UV transilluminator / gel doc (Stage-12 #4) — the GEL lies on a glowing
     UV surface; an amber UV-blocking hood tilts over the back and a camera on a mast
     images it. The surface emission ramps with progress so the bands light up. */
  function buildUVTransilluminator(){
    var grp=new THREE.Group();
    var box=matPainted(0x23272e,0.5), dark=matPainted(0x15181d,0.55);
    var base=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.5,1.9), box); base.position.y=0.25; base.castShadow=true; base.receiveShadow=true; grp.add(base);
    // the UV surface the gel rests on — emissive, ramps up as it "reads"
    var surfY=0.52;
    var surfMat=new THREE.MeshStandardMaterial({ color:0x2a3350, emissive:0x3f6bff, emissiveIntensity:0.15, roughness:0.4, toneMapped:false });
    var surf=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.05,1.5), surfMat); surf.position.y=surfY; grp.add(surf);
    var uvLight=new THREE.PointLight(0x6f8bff,0.0,3.5); uvLight.position.set(0,surfY+0.5,0); grp.add(uvLight);
    // amber UV-blocking hood tilted over the back
    var hoodMat=new THREE.MeshPhysicalMaterial({ color:0xd98a2b, transparent:true, opacity:0.42, roughness:0.4, side:THREE.DoubleSide, depthWrite:false });
    var hood=new THREE.Mesh(new THREE.BoxGeometry(2.1,1.1,0.05), hoodMat); hood.position.set(0,1.05,-0.7); hood.rotation.x=-0.5; grp.add(hood);
    // gel-doc camera on a mast above
    var mast=new THREE.Mesh(new THREE.BoxGeometry(0.16,1.7,0.16), box); mast.position.set(-0.92,1.35,-0.72); grp.add(mast);
    var cam=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.32,0.42), dark); cam.position.set(-0.55,2.05,-0.4); grp.add(cam);
    var lens=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,0.2,20), dark); lens.rotation.x=Math.PI/2; lens.position.set(-0.55,1.83,-0.28); grp.add(lens);
    var label=makeLabel("UV transilluminator",""); label.position.set(0,2.55,0); grp.add(label); grp.userData.label=label;
    var st={ g:0, t:1 }; grp.userData.setProgress=function(v){ st.t=clamp(v,0,1); };
    grp.userData.update=function(dt){ st.g=lerp(st.g,st.t,1-Math.pow(0.03,dt));
      surfMat.emissiveIntensity=0.15+st.g*0.95; uvLight.intensity=st.g*1.2; };
    grp.userData.update(0.001);
    // the table's envelope is the TRANSILLUMINATOR box (the camera mast is drawn with it)
    var root=fitArt(grp,'uv_transilluminator',{ measure:[base,surf], size:{ height:dims('uv_transilluminator').box_height } });
    addSocket(root,'surface',{ position:root.userData.fit.toWorld(0,surfY+0.025,0) });
    root.userData.sampleSocket='surface';
    return tagSpec(root,'uv_transilluminator');
  }

  /* ---------- eluate droplet ---------- */
  function buildDrop(color){
    var m = new THREE.MeshPhysicalMaterial({ color:color, roughness:0.14,
      transparent:false, emissive:color, emissiveIntensity:0.08, clearcoat:0.8, envMapIntensity:1.0 });
    var d = new THREE.Mesh(new THREE.SphereGeometry(0.07,22,18), m);
    d.scale.set(1,1.3,1); d.visible=false;
    return fx(d,'fluid');
  }

  /* ---------- small pipette stand ---------- */
  function buildPipetteStand(){
    var grp=new THREE.Group();
    var baseMat=matPlastic(0x244f78), postMat=matPlastic(0x2c608e), armMat=matPlastic(0x3672a0);
    var pad=new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.72,0.12,40), baseMat);
    pad.position.y=0.06; pad.castShadow=true; pad.receiveShadow=true; grp.add(pad);
    var padTop=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.56,0.04,40), postMat);
    padTop.position.y=0.14; grp.add(padTop);
    var post=new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.11,3.0,24), postMat);
    post.position.set(-0.42,1.6,0); post.castShadow=true; grp.add(post);
    var ARMS=[2.55,1.75];
    var root=fitArt(grp,'pipette_stand'), F=root.userData.fit;
    // the CRADLES are functional: U-shaped, open to the front so the pipette slides in and
    // out, sized to the REAL pipette (dims('pipette_p200')) + the socket play — the old
    // closed rings were drawn narrower than the pipette body that hung through them
    var P=dims('pipette_p200'), t=P.radius*0.2, r=P.radius+clearance('socket_fit')+t;
    ARMS.forEach(function(y){
      var hook=new THREE.Mesh(new THREE.TorusGeometry(r,t,14,32,Math.PI), armMat);
      var w=F.toWorld(0,y,0); hook.position.set(0,w.y,0);
      hook.rotation.set(Math.PI/2,0,Math.PI);            // the open half faces +z (the front)
      root.add(hook);
      // the ARM from the post to the cradle's back — it stops AT the cradle, never inside it
      var postX=F.toWorld(-0.42,0,0).x, armL=(-r)-postX;
      var arm=new THREE.Mesh(new THREE.BoxGeometry(armL,t*2.6,t*3.6), armMat);
      arm.position.set(postX+armL/2,w.y,0); root.add(arm);
    });
    // the pipette HANGS in the upper cradle by its finger hook (~62 % up from its tip):
    // its tip rests here, in the stand's frame; it leaves forward, out of the open cradle
    root.userData.cradle=new THREE.Vector3(0, F.toWorld(0,ARMS[0],0).y-0.62*P.height, 0);
    root.userData.hookOut=r+P.radius+clearance('bench_gap');
    return tagSpec(root,'pipette_stand');
  }

  /* ---------- reagent bottle (dressing) ---------- */
  function buildBottle(col, labelText, h, capColor){
    // h: DRAWING height (a proportion of the art) — the bottle's real size is dims('bottle_250')
    var grp=new THREE.Group(); h=1.3;
    var glass=glassMaterial(); glass.opacity=0.24;
    var bp=[
      new THREE.Vector2(0.001,0), new THREE.Vector2(0.34,0.02), new THREE.Vector2(0.36,0.08),
      new THREE.Vector2(0.36,h*0.72), new THREE.Vector2(0.3,h*0.82), new THREE.Vector2(0.16,h*0.9),
      new THREE.Vector2(0.15,h), new THREE.Vector2(0.155,h+0.005)
    ];
    var body=new THREE.Mesh(new THREE.LatheGeometry(bp,44), glass);
    body.castShadow=true; grp.add(body);
    // liquid revolved from the bottle's inner profile (`bp`) — fills the wide body,
    // tapers with the base, flat top at the fill line (no floating cylinder)
    var liqInnerFn=innerRadiusFn(bp,0.90);
    var liq=new THREE.Mesh(liquidProfileGeo(liqInnerFn, 0.02, h*0.55, 40),
      new THREE.MeshPhysicalMaterial({color:col,roughness:0.35,transparent:false,emissive:col,emissiveIntensity:0.11,envMapIntensity:0.7}));
    fx(liq,'fluid'); grp.add(liq);
    var cap=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.22,28), matPlastic(capColor==null?0x2b7f74:capColor));
    cap.position.y=h+0.11; grp.add(cap);
    // coloured neck ring under the cap — reads as a reagent-coded seal
    var capRing=new THREE.Mesh(new THREE.TorusGeometry(0.155,0.022,12,32), matPlastic(capColor==null?0x2b7f74:capColor));
    capRing.rotation.x=Math.PI/2; capRing.position.y=h-0.04; grp.add(capRing);   // just UNDER the cap (it sat inside the cap's skirt)
    var lc=document.createElement("canvas"); lc.width=256; lc.height=128; var lg=lc.getContext("2d");
    lg.fillStyle="#eef1f4"; lg.fillRect(0,0,256,128);
    lg.fillStyle="#252c34"; lg.font="700 30px 'IBM Plex Sans'"; lg.textAlign="center";
    lg.fillText(labelText||"", 128,58);
    lg.strokeStyle="rgba(120,130,146,0.4)"; lg.lineWidth=2; lg.strokeRect(10,74,236,40);
    var lTex=new THREE.CanvasTexture(lc); lTex.anisotropy=MAX_ANISO;
    var band=new THREE.Mesh(new THREE.CylinderGeometry(0.365,0.365,h*0.42,40,1,true),
      new THREE.MeshStandardMaterial({map:lTex,roughness:0.75,metalness:0,envMapIntensity:0.25}));
    band.position.y=h*0.4; fx(band,'decal'); grp.add(band);
    // IMPROVEMENT over the demo: the bottle OPENS to be aspirated and its level
    // DROPS as liquid is drawn (volume conserved with the receiving vessel).
    // setCap(on): on=true seals it; on=false lifts the cap up and tilts it aside.
    var bState={ level:1, tLevel:1, open:0, tOpen:0, capBaseY:h+0.11 };
    grp.userData.cap=cap;
    grp.userData.setLevel=function(v){ bState.tLevel=clamp(v,0,1); };
    grp.userData.setCap=function(on){ bState.tOpen = on ? 0 : 1; };
    grp.userData.update=function(dt){
      bState.level=lerp(bState.level,bState.tLevel,1-Math.pow(0.02,dt));
      bState.open =lerp(bState.open, bState.tOpen, 1-Math.pow(0.0009,dt));
      liq.scale.y=Math.max(0.001,bState.level);                    // surface drops
      // unscrew UP off the neck (0-0.3), carry clear (0.3-0.7), SET DOWN upright on the bench
      // in front of the bottle (0.7-1) — it used to hang tilted in the air beside the neck
      var o=bState.open, UP=bState.capBaseY+0.42, BZ=0.36+0.17+0.3, e;
      if(o<0.3){ e=easeInOut(o/0.3); cap.position.set(0, lerp(bState.capBaseY,UP,e), 0); }
      else if(o<0.7){ e=easeInOut((o-0.3)/0.4); cap.position.set(0, UP, lerp(0,BZ,e)); }
      else { e=easeInOut((o-0.7)/0.3); cap.position.set(0, lerp(UP,0.11,e), BZ); }
      cap.rotation.z = 0;
    };
    var root=fitArt(grp,'bottle_250'), F=root.userData.fit;
    root.userData.mouth=F.toWorld(0,h,0);          // top of the neck
    root.userData.draw=F.toWorld(0,h*0.3,0);       // where a tip draws from: in the liquid
    root.userData.capWorldScale=new THREE.Vector3(F.sx,F.sy,F.sz);
    root.userData.capOnY=F.toWorld(0,h+0.11,0).y;  // the cap's centre when screwed on
    root.userData.capHalfH=0.11*F.sy;
    return tagSpec(root,'bottle_250');
  }

  /* ---------- muted warning ring (⛔ caution) ---------- */
  function buildWarnRing(){
    // red caution ring removed per user — return an empty, inert group so the step logic
    // (which toggles .visible and calls .update) still works with nothing to show.
    var grp=new THREE.Group();
    grp.userData.update=function(){};
    return grp;
  }

  /* ---------- bright back wall + packed colourful shelving ----------
     Evokes the real lab photo: a light back wall, white shelf boards CRAMMED with
     colourful boxes and kit-box spines (blue, magenta, orange, green), plus a bold RED
     door / accent panel. All unlit MeshBasic + fog so it recedes into the bright room. */
  function buildBackdrop(totalLen){
    var grp=new THREE.Group();
    // light back wall panel
    var wall=new THREE.Mesh(new THREE.PlaneGeometry(totalLen+70,26),
      new THREE.MeshBasicMaterial({color:0xa7a29a, fog:true}));
    wall.position.set(totalLen*0.5,9,-15); grp.add(wall);
    // Backdrop shelving, boxes, door and coats REMOVED per user — clean plain back wall only.
    grp.userData.update=function(){};
    return grp;
  }


  function stationDecal(n){
    var c=document.createElement("canvas"); c.width=256; c.height=128; var g=c.getContext("2d");
    g.clearRect(0,0,256,128);
    // dark slate on the pale bench so the number actually reads (Stage-13 #4 — the old
    // 0.5-alpha grey vanished against the greige resin).
    g.fillStyle="rgba(58,68,82,0.9)"; g.font="500 74px 'IBM Plex Sans'"; g.textAlign="left"; g.textBaseline="middle";
    g.fillText(("0"+n).slice(-2), 12, 70);
    g.strokeStyle="rgba(64,150,138,0.9)"; g.lineWidth=5; g.beginPath(); g.moveTo(14,104); g.lineTo(150,104); g.stroke();
    var t=new THREE.CanvasTexture(c); t.anisotropy=MAX_ANISO;
    var m=new THREE.Mesh(new THREE.PlaneGeometry(1.7,0.85), new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));
    m.rotation.x=-Math.PI/2; return m;
  }

  function buildEnvMap(){
    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileCubemapShader();
    var es = new THREE.Scene();
    var domeGeo = new THREE.SphereGeometry(50,32,20);
    var col = new Float32Array(domeGeo.attributes.position.count*3);
    var top = new THREE.Color(0x8d929a), bot = new THREE.Color(0x474b51);
    for(var i=0;i<domeGeo.attributes.position.count;i++){
      var y=domeGeo.attributes.position.getY(i)/50*0.5+0.5;
      var c=bot.clone().lerp(top, Math.pow(y,0.8));
      col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    }
    domeGeo.setAttribute("color", new THREE.BufferAttribute(col,3));
    es.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ side:THREE.BackSide, vertexColors:true })));
    function panel(x,y,z,w,h,color,intensity){
      var m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
        new THREE.MeshBasicMaterial({ color:new THREE.Color(color).multiplyScalar(intensity) }));
      m.position.set(x,y,z); m.lookAt(0,y*0.4,0); es.add(m);
    }
    // Neutral STUDIO: ONE bright key softbox for highlights + form, DARK fills all around so
    // materials keep contrast and true colour instead of being flooded to pale by a near-white
    // environment. This is the real fix for the washed-out, low-contrast look.
    panel(9,14,7, 22,10, 0xffffff, 1.5);       // key softbox (highlights)
    panel(-13,8,-8, 16,14, 0x9198a1, 0.42);    // dim neutral fill
    panel(-6,3,10, 12,7, 0x878d96, 0.32);      // dim front fill
    panel(0,20,0, 24,24, 0x676c74, 0.38);      // dim overhead
    var tex = pmrem.fromScene(es, 0.04).texture;
    pmrem.dispose();
    return tex;
  }
  function makeGradientTexture(stops){
    stops = stops || ["#252a31","#181b20","#0f1114"];
    var c=document.createElement("canvas"); c.width=64; c.height=256; var g=c.getContext("2d");
    var grad=g.createLinearGradient(0,0,0,256);
    grad.addColorStop(0,stops[0]); grad.addColorStop(0.5,stops[1]); grad.addColorStop(1,stops[2]);
    g.fillStyle=grad; g.fillRect(0,0,64,256);
    var t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
  }
  /* CINEMATIC backdrop — a BRIGHT ROOM, not a black void: a soft warm/cool-white upper wall
     fading through a faint horizon to a light warm-grey resin floor. Evenly lit, no vignette,
     no pool of light — the colour in the scene comes from the scattered props, not here. */
  // Backdrop for the active preset: a vertical wall→floor gradient, a soft pool of light
  // behind the subject, and a corner vignette. Dark preset recedes to near-black; light
  // preset is the pre-Stage-24 warm greige room. All values come from preset.backdrop.
  function makeCineBackdrop(preset){
    var bd=(preset||resolveScenePreset()).backdrop, w=640,h=640;
    var c=document.createElement("canvas"); c.width=w; c.height=h; var g=c.getContext("2d");
    var grad=g.createLinearGradient(0,0,0,h);
    for(var i=0;i<bd.stops.length;i++) grad.addColorStop(bd.stops[i][0], bd.stops[i][1]);
    g.fillStyle=grad; g.fillRect(0,0,w,h);
    var pl=bd.pool, soft=g.createRadialGradient(w*0.5,h*0.34,20, w*0.5,h*pl.cy1,w*pl.r1);
    soft.addColorStop(0,"rgba("+pl.rgb+","+pl.a+")"); soft.addColorStop(1,"rgba("+pl.rgb+",0)");
    g.fillStyle=soft; g.fillRect(0,0,w,h);
    var vg=bd.vignette, vig=g.createRadialGradient(w*0.5,h*0.46,w*vg.r0, w*0.5,h*0.5,w*vg.r1);
    vig.addColorStop(0,"rgba("+vg.rgb+",0)"); vig.addColorStop(1,"rgba("+vg.rgb+","+vg.a+")");
    g.fillStyle=vig; g.fillRect(0,0,w,h);
    var t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
  }

  // the demo's bench floor (buildLine): a light warm-grey resin with a canvas
  // grain/speckle texture — the LIVE cinematic material values baked in
  // (applyViewMode: color 0xcbc6bd, metalness 0.12, roughness 0.5, env 0.62).
  // buildFloor(totalLen): one continuous bench spanning the whole station line.
  // totalLen = (N-1)*SPACING; the plane runs 0..totalLen (plus margins) and is
  // centred on the line so far stations recede into fog, exactly like the demo.
  // The bench for the active preset: a resin base with a faint wiped grain + mineral fleck,
  // and (dark preset only) a broad roughness-variation map for a low grazing sheen. Dark =
  // near-black epoxy; light = the pre-Stage-24 warm-grey resin. All from preset.bench.
  function buildFloor(totalLen, preset){
    totalLen = totalLen || 0;
    var b=(preset||resolveScenePreset()).bench;
    var W = totalLen + 140;
    var bc=document.createElement("canvas"); bc.width=512; bc.height=512; var bg2=bc.getContext("2d");
    bg2.fillStyle=b.texBase; bg2.fillRect(0,0,512,512);
    var sk=b.streak;
    for(var sx=0;sx<520;sx+=2){ bg2.strokeStyle="rgba("+sk.rgb+","+(sk.a0+Math.random()*sk.a1)+")";
      bg2.lineWidth=1; bg2.beginPath(); bg2.moveTo(sx,0); bg2.lineTo(sx+(Math.random()*6-3),512); bg2.stroke(); }
    var fl=b.fleck;
    for(var sp=0;sp<fl.count;sp++){ var pale=Math.random()<fl.paleProb;
      bg2.fillStyle="rgba("+(pale?fl.pale:fl.dark)+","+((pale?fl.paleA0:fl.darkA0)+Math.random()*(pale?fl.paleA1:fl.darkA1))+")";
      var fs=fl.size0+Math.random()*fl.size1; bg2.fillRect(Math.random()*512,Math.random()*512,fs,fs); }
    var benchTex=new THREE.CanvasTexture(bc); benchTex.colorSpace=THREE.SRGBColorSpace;
    // keep texel density constant as the bench widens (140 wide -> 30 tiles)
    benchTex.wrapS=benchTex.wrapT=THREE.RepeatWrapping; benchTex.repeat.set(Math.max(30, Math.round(W*30/140)),6); benchTex.anisotropy=MAX_ANISO;
    var roughTex=null;
    if(b.rough){ var rq=b.rough;
      var rc=document.createElement("canvas"); rc.width=256; rc.height=256; var rg=rc.getContext("2d");
      rg.fillStyle=rq.base; rg.fillRect(0,0,256,256);
      for(var rb=0;rb<rq.count;rb++){ var rx=Math.random()*256, ry=Math.random()*256, rr=rq.r0+Math.random()*rq.r1;
        var rgrad=rg.createRadialGradient(rx,ry,4, rx,ry,rr);
        rgrad.addColorStop(0,"rgba("+rq.patch+","+rq.patchA+")"); rgrad.addColorStop(1,"rgba("+rq.patch+",0)");
        rg.fillStyle=rgrad; rg.beginPath(); rg.arc(rx,ry,rr,0,Math.PI*2); rg.fill(); }
      roughTex=new THREE.CanvasTexture(rc);
      roughTex.wrapS=roughTex.wrapT=THREE.RepeatWrapping; roughTex.repeat.set(rq.repeat[0],rq.repeat[1]); roughTex.anisotropy=MAX_ANISO;
    }
    var floorMat=new THREE.MeshStandardMaterial({ color:b.mat.color, map:benchTex, roughnessMap:roughTex, metalness:b.mat.metalness, roughness:b.mat.roughness, envMapIntensity:b.mat.env });
    var floor=new THREE.Mesh(new THREE.PlaneGeometry(W,60), floorMat);
    floor.rotation.x=-Math.PI/2; floor.position.x=totalLen*0.5; floor.receiveShadow=true;
    return floor;
  }

// PER-BUILDER RANDOM STREAMS (rng.js): every builder draws from its own seeded stream,
// so one builder taking more random values can no longer move the ice cubes, bubbles or
// cells another builder places. Rebinding the declarations keeps every internal call and
// every live export on the wrapped version.
makeLabel = streams.wrap('makeLabel', makeLabel)
makeBrushedNormal = streams.wrap('makeBrushedNormal', makeBrushedNormal)
makeBrushedRough = streams.wrap('makeBrushedRough', makeBrushedRough)
makePlasticRough = streams.wrap('makePlasticRough', makePlasticRough)
makeKnurlNormal = streams.wrap('makeKnurlNormal', makeKnurlNormal)
buildSharedMaps = streams.wrap('buildSharedMaps', buildSharedMaps)
buildTube = streams.wrap('buildTube', buildTube)
buildPipette = streams.wrap('buildPipette', buildPipette)
buildSpinColumn = streams.wrap('buildSpinColumn', buildSpinColumn)
buildColdBlock = streams.wrap('buildColdBlock', buildColdBlock)
buildWaterBath = streams.wrap('buildWaterBath', buildWaterBath)
buildPlateReader = streams.wrap('buildPlateReader', buildPlateReader)
buildPlateShaker = streams.wrap('buildPlateShaker', buildPlateShaker)
buildThermocycler = streams.wrap('buildThermocycler', buildThermocycler)
buildGelRig = streams.wrap('buildGelRig', buildGelRig)
buildIceBucket = streams.wrap('buildIceBucket', buildIceBucket)
buildCentrifuge = streams.wrap('buildCentrifuge', buildCentrifuge)
buildWaste = streams.wrap('buildWaste', buildWaste)
buildSyringe = streams.wrap('buildSyringe', buildSyringe)
buildNanoDrop = streams.wrap('buildNanoDrop', buildNanoDrop)
buildInvertedMicroscope = streams.wrap('buildInvertedMicroscope', buildInvertedMicroscope)
buildLightMicroscope = streams.wrap('buildLightMicroscope', buildLightMicroscope)
buildUVTransilluminator = streams.wrap('buildUVTransilluminator', buildUVTransilluminator)
buildDrop = streams.wrap('buildDrop', buildDrop)
buildPipetteStand = streams.wrap('buildPipetteStand', buildPipetteStand)
buildBottle = streams.wrap('buildBottle', buildBottle)
buildWarnRing = streams.wrap('buildWarnRing', buildWarnRing)
buildBackdrop = streams.wrap('buildBackdrop', buildBackdrop)
buildEnvMap = streams.wrap('buildEnvMap', buildEnvMap)
makeGradientTexture = streams.wrap('makeGradientTexture', makeGradientTexture)
makeCineBackdrop = streams.wrap('makeCineBackdrop', makeCineBackdrop)
buildFloor = streams.wrap('buildFloor', buildFloor)
buildCryovial = streams.wrap('buildCryovial', buildCryovial)
buildWellPlate = streams.wrap('buildWellPlate', buildWellPlate)
buildFlask = streams.wrap('buildFlask', buildFlask)
buildDish = streams.wrap('buildDish', buildDish)
buildSlide = streams.wrap('buildSlide', buildSlide)
buildMembrane = streams.wrap('buildMembrane', buildMembrane)
buildGelSlab = streams.wrap('buildGelSlab', buildGelSlab)
buildAgarPlate = streams.wrap('buildAgarPlate', buildAgarPlate)
buildFreezer = streams.wrap('buildFreezer', buildFreezer)
buildStainingTray = streams.wrap('buildStainingTray', buildStainingTray)
buildVortexMixer = streams.wrap('buildVortexMixer', buildVortexMixer)
buildSpreader = streams.wrap('buildSpreader', buildSpreader)
buildSample = streams.wrap('buildSample', buildSample)

export {
  buildFloor,
  COL, COL_CINE, LOOK, SPACING, BLOCK_TOP,
  buildSharedMaps, makeLabel, stationDecal,
  buildTube, buildPipette, buildPipetteStand, buildBottle, buildSpinColumn,
  buildCentrifuge, buildColdBlock, buildWaterBath, buildIceBucket, buildNanoDrop, buildDrop, buildWaste, buildSyringe,
  buildThermocycler, buildGelRig, buildFreezer, buildStainingTray, buildSpreader, buildVortexMixer,
  buildPlateReader, buildPlateShaker, buildCO2Incubator,
  buildInvertedMicroscope, buildLightMicroscope, buildUVTransilluminator,
  buildCryovial, buildWellPlate, buildFlask, buildDish, buildSlide, buildMembrane, buildGelSlab, buildAgarPlate,
  buildEnvMap, makeCineBackdrop, makeGradientTexture,
  glassMaterial, matPlastic, matBrushed, matAnodized, matPainted, matFrosted, matRubber, matSilicone,
}

// ─── station choreography (lifted verbatim from the demo's scene scope) ───
  // The window in which pipetteRun's tip is IN the destination and dispensing (both the
  // straight and the angled path hold at depth from ~0.68 to ~0.87 of the timeline). A
  // receiving vessel fills only inside it — never before the tip arrives.
  var DISPENSE_FROM=0.68, DISPENSE_TO=0.87;
  function dispenseProgress(p){ return easeInOut(clamp((p-DISPENSE_FROM)/(DISPENSE_TO-DISPENSE_FROM),0,1)); }
  var TIP_DROP=0.62;                          // tip end below the pipette origin: 0.86 × PIP_SCALE 0.72
  function pipetteRun(st, from, to, p, opts){
    opts=opts||{};
    var pip=st.pip; if(!pip) return;
    // GEOMETRY-SAFE motion (bug fix): NEVER cross laterally at rim height (that
    // pushed the tip through the vessel wall). Instead: draw at the bottle, travel
    // LEVEL and HIGH — well clear of any vessel top — to directly above the mouth,
    // then descend into the mouth, dispense, and withdraw.
    var draw=0.26, travel=0.50;                 // phase boundaries
    var TRAVEL_Y=Math.max(from.y,to.y)+2.0;     // cruise altitude, above every vessel

    if(opts.approach==='angled'){
      // A T-FLASK's canted neck (Stage-12 #3): `to` IS the neck MOUTH; the tip must
      // enter THROUGH it, tilted to the neck cant, and descend ALONG the neck axis to
      // the medium at the base corner — NOT straight down onto the flat top face.
      var TILT = opts.tilt!=null?opts.tilt:-0.62; // match the neck's cant exactly
      var depth = opts.depth!=null?opts.depth:0.95; // how far down the axis to the medium
      var ax=Math.sin(-TILT), ay=Math.cos(-TILT); // neck axis (points up-and-out of the mouth)
      // The tip comes in along the neck axis from a SHORT standoff just out of the mouth,
      // not from cruise height: following the axis all the way up put the pipette ~1.4
      // units out past the neck and off the top of the frame. So: cruise high and level
      // to directly above the standoff, drop straight down to it (tilting in), then in.
      var STANDOFF = opts.standoff!=null?opts.standoff:0.75;
      var dTop=STANDOFF;                          // axis distance of the entry standoff
      // a flat flask is low: cruise just clear of the source and the standoff, not at the
      // tube-scale +2.0 (which, with the body above the tip, left the frame at the top)
      TRAVEL_Y=Math.max(from.y+0.9, to.y+ay*dTop+0.45);
      // place the pipette so its TIP lands at mouth + axis*d, body tilted by `rot`
      function tipAxis(d, rot){
        var tx=to.x+ax*d, ty=to.y+ay*d, tz=to.z;
        pip.position.set(tx - Math.sin(rot)*TIP_DROP, ty + Math.cos(rot)*TIP_DROP, tz);
        pip.rotation.z=rot;
      }
      if(p<draw){                               // A · at the bottle: rise & aspirate
        var qa=easeInOut(p/draw);
        pip.rotation.z=0;
        pip.position.set(from.x, lerp(from.y+0.72, TRAVEL_Y, qa), from.z);
        pip.userData.setFluid(qa*(opts.fill||0.8)); pip.userData.setColor(opts.color||COL.lysis);
      } else if(p<travel){                       // B · cruise HIGH & LEVEL to above the standoff
        var qb=easeInOut((p-draw)/(travel-draw));
        var sx=to.x+ax*dTop, sy=to.y+ay*dTop;
        pip.rotation.z=0;
        pip.position.set(lerp(from.x, sx, qb), TRAVEL_Y, lerp(from.z, to.z, qb));
        pip.userData.setFluid(opts.fill||0.8);
      } else if(p<travel+0.08){                   // B2 · straight down to the standoff, tilting to the cant
        var qd=easeInOut((p-travel)/0.08);
        var rot=TILT*qd;
        var sx2=to.x+ax*dTop, sy2=to.y+ay*dTop;
        var tipY=lerp(TRAVEL_Y-TIP_DROP, sy2, qd);
        pip.position.set(sx2 - Math.sin(rot)*TIP_DROP, tipY + Math.cos(rot)*TIP_DROP, to.z);
        pip.rotation.z=rot;
        pip.userData.setFluid(opts.fill||0.8);
      } else {                                   // C · in along the neck axis into the medium, then back out
        var qc=(p-travel-0.08)/(1-travel-0.08);
        // in (0-0.35), HOLD at depth while it dispenses (0.35-0.7), back out (0.7-1):
        // the drop leaves only when the tip is in the medium, never above the vessel
        var s = qc<0.35 ? easeInOut(qc/0.35) : qc<0.7 ? 1 : easeInOut(1-(qc-0.7)/0.3);
        tipAxis(lerp(dTop, -depth, s), TILT);
        pip.userData.setFluid((1-clamp((qc-0.35)/0.35,0,1))*(opts.fill||0.8));
      }
      return;
    }

    // STRAIGHT approach (tube / well / dish): descend vertically into the mouth.
    // how far the tip descends is PER-CONTAINER (opts.dipDepth = the container's
    // entryPoint): a spin column stops above its frit, a microtube goes near its base.
    // Never a shared 0.62 tube constant that plunges the tip through the column bed.
    var DIP_Y=to.y+(opts.dipDepth!=null?opts.dipDepth:0.62);  // tip lowered into the mouth
    var pos=new THREE.Vector3();
    if(p<draw){                                 // A · at the bottle: rise & aspirate
      var q=easeInOut(p/draw);
      pos.set(from.x, lerp(from.y+0.72, TRAVEL_Y, q), from.z);
      pip.rotation.z=0;
      pip.userData.setFluid(q*(opts.fill||0.8)); pip.userData.setColor(opts.color||COL.lysis);
    } else if(p<travel){                         // B · cruise HIGH & LEVEL over the mouth
      var q2=easeInOut((p-draw)/(travel-draw));
      pos.set(lerp(from.x,to.x,q2), TRAVEL_Y, lerp(from.z,to.z,q2));
      pip.rotation.z=0;
      pip.userData.setFluid(opts.fill||0.8);
    } else {                                     // C · descend STRAIGHT DOWN into the mouth
      var q3=(p-travel)/(1-travel);
      // down (0-0.35), HOLD in the vessel while dispensing (0.35-0.7), up (0.7-1): the
      // fluid only drains — and the drop only shows — while the tip is inside the vessel
      var y = q3<0.35 ? lerp(TRAVEL_Y,DIP_Y,easeInOut(q3/0.35))
            : q3<0.7  ? DIP_Y
                      : lerp(DIP_Y,TRAVEL_Y,easeInOut((q3-0.7)/0.3));
      pos.set(to.x, y, to.z);
      pip.rotation.z=0;
      pip.userData.setFluid((1-clamp((q3-0.35)/0.35,0,1))*(opts.fill||0.8));
    }
    pip.position.copy(pos);                 // LOCAL — resident pipette stays at its station
  }

  // shared local layout anchors (per-station, in the station's local space)
  var PIP_STAND = {x:-2.1, y:0, z:1.25};
  var PIP_REST  = new THREE.Vector3(-2.1, 1.2, 1.25);

  // a bare stand (dressing) — for stations that don't pipette
  function addStand(st){
    var stand = buildPipetteStand(); stand.position.set(PIP_STAND.x,PIP_STAND.y,PIP_STAND.z);
    stand.userData.noFrame = true;   // pipetting DRESSING — excluded from the camera fit
    st.group.add(stand);
  }
  // resident equipment: a stand AND its OWN pipette, both fixed to this station
  var PIP_SCALE = 0.72;   // IMPROVEMENT: a shorter pipette so its body never reaches
                          // up behind the top HUD bar during the pour travel arc.
  function addPipetteRig(st){
    addStand(st);
    var pip = buildPipette(); pip.scale.setScalar(PIP_SCALE); pip.position.set(PIP_REST.x, PIP_REST.y, PIP_REST.z);
    pip.userData.noFrame = true;    // the pipette travels high on its arc — never frame it
    st.group.add(pip); st.pip = pip; st.updatables.push(pip);
  }
  // dock this station's resident pipette back in its stand (LOCAL space)
  function pipRest(st){ if(!st.pip) return;
    st.pip.position.set(PIP_REST.x, PIP_REST.y, PIP_REST.z);
    st.pip.userData.setFluid(0); }

  // ─── Stage-8 container vessels (the sample-follow model shows exactly one) ───
  // Shared liquid state matching buildTube's contract: setLevel/setColor/setLabel +
  // an update() that lerps and calls apply(liq, level, color). Stylized (no
  // transmission, no postprocessing) — reuses the demo's mat* helpers throughout.
  function attachSampleLiquid(grp, liq, apply, label, level0){
    var L0=(level0==null?0.35:level0);
    var st={ level:L0, tLevel:L0, color:new THREE.Color(COL.lysis), tColor:new THREE.Color(COL.lysis) };
    grp.userData.label=label||null;
    grp.userData.setLevel=function(v){ st.tLevel=clamp(v,0,1); };
    grp.userData.setColor=function(h){ st.tColor.set(h); };
    grp.userData.setLabel=function(t,s){ if(grp.userData.label) grp.userData.label.userData.update(t,s||""); };
    grp.userData.update=function(dt){
      st.level=lerp(st.level,st.tLevel,1-Math.pow(0.001,dt));
      st.color.lerp(st.tColor,1-Math.pow(0.004,dt));
      apply(liq, st.level, st.color, st);
    };
    return st;
  }
  function liquidMat(){
    return new THREE.MeshPhysicalMaterial({ color:COL.lysis, roughness:0.32, metalness:0,
      emissive:COL.lysis, emissiveIntensity:0.12, clearcoat:0.3, clearcoatRoughness:0.4, envMapIntensity:0.6 });
  }

  /* screw-cap cryovial — short PP vial: a SKIRTED CONICAL base so it self-stands,
     EXTERNAL screw THREAD on the upper body, and a colour-coded ribbed cap. */
  function buildCryovial(){
    var grp=new THREE.Group(); var R=0.22;
    var pp=matFrosted(0xe7ecf1);
    var skirt=new THREE.Mesh(new THREE.CylinderGeometry(R*1.02,R*1.06,0.09,16), matPlastic(0xccd2d9));
    skirt.position.y=0.045; skirt.castShadow=true; grp.add(skirt);              // self-standing skirted foot
    var cone=new THREE.Mesh(new THREE.CylinderGeometry(R*0.92,R*0.8,0.16,28), pp);
    cone.position.y=0.17; grp.add(cone);                                        // conical base
    var bodyH=0.92;
    var body=new THREE.Mesh(new THREE.CylinderGeometry(R*0.92,R*0.92,bodyH,28,1,true), pp);
    body.position.y=0.25+bodyH/2; body.castShadow=true; grp.add(body);
    var top=0.25+bodyH;
    // EXTERNAL screw thread near the top of the body
    for(var t=0;t<4;t++){ var thr=new THREE.Mesh(new THREE.TorusGeometry(R*0.95,0.015,8,28), pp);
      thr.rotation.x=Math.PI/2; thr.position.y=top-0.06-t*0.075; grp.add(thr); }
    // colour-coded ribbed screw cap — cap + ribs in ONE group so setCap lifts them together
    var cryoCapGrp=new THREE.Group(); cryoCapGrp.position.y=top+0.09; grp.add(cryoCapGrp);
    var cap=new THREE.Mesh(new THREE.CylinderGeometry(R*1.06,R*1.06,0.2,28), matPlastic(0x8f2f6a));
    cryoCapGrp.add(cap);
    for(var r=0;r<22;r++){ var ra=r/22*Math.PI*2; var rib=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.16,0.026), matPlastic(0x8f2f6a));
      rib.position.set(Math.cos(ra)*R*1.07,0,Math.sin(ra)*R*1.07); rib.rotation.y=-ra; cryoCapGrp.add(rib); }
    var liq=new THREE.Mesh(new THREE.CylinderGeometry(R*0.82,R*0.72,1,24), liquidMat());
    fx(liq,'fluid'); grp.add(liq);
    var label=makeLabel("",""); label.position.set(0,top+0.55,0); grp.add(label);
    attachSampleLiquid(grp, liq, function(liq,lv,color){
      var h=Math.max(0.02, lv*(bodyH*0.8)); liq.scale.set(1,h,1); liq.position.y=0.28+h/2;
      liq.material.color.copy(color); liq.material.emissive.copy(color);
    }, label);
    // CAP (Stage 38): off to pour in, back on after — same as the flask/bottle.
    var cryoCap={ open:0, tOpen:0 };
    grp.userData.setCap=function(on){ cryoCap.tOpen = on ? 0 : 1; };
    var _cryoUpd=grp.userData.update;
    grp.userData.update=function(dt){
      if(_cryoUpd) _cryoUpd(dt);
      cryoCap.open = lerp(cryoCap.open, cryoCap.tOpen, 1-Math.pow(0.0009,dt));
      var o=cryoCap.open;
      // unscrew up off the vial (0-0.3), carry over clear (0.3-0.7), set down upright on
      // the bench in front of the vial (0.7-1) — never left hanging in the air. The cap is
      // 0.2 tall, so on the bench its centre sits at 0.1. Reverses to cap it again.
      var ON_Y=top+0.09, UP=top+0.5, BX=-0.45, BY=0.1, BZ=0.4, e;
      if(o<0.3){ e=easeInOut(o/0.3); cryoCapGrp.position.set(0, lerp(ON_Y,UP,e), 0); }
      else if(o<0.7){ e=easeInOut((o-0.3)/0.4); cryoCapGrp.position.set(lerp(0,BX,e), UP, lerp(0,BZ,e)); }
      else { e=easeInOut((o-0.7)/0.3); cryoCapGrp.position.set(BX, lerp(UP,BY,e), BZ); }
      cryoCapGrp.rotation.z = 0;
    };
    var root=fitArt(grp,'cryovial_2ml');
    root.userData.mouth={ x:0, y:root.userData.fit.toWorld(0,top,0).y, z:0, approach:'top' };
    root.userData.entry=root.userData.fit.toWorld(0,0.45,0).y;
    return tagSpec(root,'cryovial_2ml');
  }

  /* 96-well microplate — 8×12 grid of RECESSED bores, skirt, A1 corner notch; the
     sample lives in ONE front well (aspirated). */
  function buildWellPlate(){
    var grp=new THREE.Group();
    // REAL SIZE — ANSI/SLAS: footprint 127.76 × 85.48, height 14.35, wells on a 9 mm pitch
    // with A1 at 14.38 / 11.24 mm from the left / back edges (dims('microplate_96')).
    var P=dims('microplate_96');
    var BX=P.width, BZ=P.depth, BH=P.height, WALL=P.wall;
    // The wells are BORES cut into the plate. A solid box would cap them, so the plate is
    // two parts: an opaque lower body up to the well floors, and a WELL DECK on top — the
    // plate outline extruded with 96 round holes, so every bore has real walls going down
    // to a dark floor. (The old wells were dark cups standing proud of a solid top: pegs.)
    var WELL_D=P.well_depth, FLOOR_Y=BH-WELL_D, WELL_R=P.well_diameter/2;
    var bodyMat=new THREE.MeshStandardMaterial({ color:0xe3e8ee, roughness:0.5, metalness:0, envMapIntensity:0.5 });
    var wallMat=new THREE.MeshStandardMaterial({ color:0xc4ccd6, roughness:0.6, metalness:0, envMapIntensity:0.4 });
    // the flange (skirt) IS the SBS footprint; the moulded body above it steps in by a wall
    var TX=BX-2*WALL, TZ=BZ-2*WALL, SKIRT_H=BH*0.17;
    // the lower body shares the deck's SIDE material so the plate's flank reads as one face
    var body=new THREE.Mesh(new THREE.BoxGeometry(TX,FLOOR_Y,TZ), wallMat);
    body.position.y=FLOOR_Y/2; body.castShadow=true; body.receiveShadow=true; grp.add(body);
    var skirt=new THREE.Mesh(new THREE.BoxGeometry(BX,SKIRT_H,BZ), matPlastic(0xc4ccd6));
    skirt.position.y=SKIRT_H/2; grp.add(skirt);
    // A1 corner NOTCH — a small dark chamfer cue INSIDE the A1 corner (never proud of it)
    var NS=P.well_pitch*0.9;
    var notch=new THREE.Mesh(new THREE.BoxGeometry(NS,BH,NS), matPlastic(0x9aa4b0));
    notch.position.set(-TX/2+NS*0.72,BH/2,-TZ/2+NS*0.72); notch.rotation.y=Math.PI/4; grp.add(notch);
    // the 8×12 grid, A1 back-left, from the SBS well-position standard
    var floorMat=new THREE.MeshStandardMaterial({ color:0x2a323c, metalness:0.1, roughness:0.75 });
    var floors=new THREE.InstancedMesh(new THREE.CircleGeometry(WELL_R,14), floorMat, 96); var mf=new THREE.Matrix4(); var idx=0;
    var awx=0, awz=0, holes=[];
    for(var c=0;c<12;c++) for(var r=0;r<8;r++){
      var x=-BX/2+P.a1_offset_x+c*P.well_pitch, z=-BZ/2+P.a1_offset_y+r*P.well_pitch;
      holes.push([x,z,WELL_R]);
      mf.makeRotationX(-Math.PI/2); mf.setPosition(x,FLOOR_Y+WELL_D*0.01,z); floors.setMatrixAt(idx,mf);
      idx++;
      if(c===1 && r===7){ awx=x; awz=z; }   // the active (front-left) well
    }
    floors.instanceMatrix.needsUpdate=true; grp.add(floors);
    var deckGeo=slabWithHoles(TX,WELL_D,TZ,holes,14);
    var deckMesh=new THREE.Mesh(deckGeo,[bodyMat,wallMat]); // caps = plate top, sides = bore walls
    deckMesh.position.y=FLOOR_Y; deckMesh.castShadow=true; deckMesh.receiveShadow=true; grp.add(deckMesh);
    // sample liquid in the active well — it fills the bore from its floor up
    var liq=new THREE.Mesh(new THREE.CylinderGeometry(WELL_R*0.9,WELL_R*0.9,1,16), liquidMat());
    liq.position.set(awx,FLOOR_Y,awz); fx(liq,'fluid'); grp.add(liq);
    var label=makeLabel("","96-well"); label.position.set(awx,BH+LABEL_GAP,awz); grp.add(label);
    attachSampleLiquid(grp, liq, function(liq,lv,color){
      var h=Math.max(WELL_D*0.05, lv*WELL_D*0.9); liq.scale.set(1,h,1); liq.position.y=FLOOR_Y+WELL_D*0.02+h/2;
      liq.material.color.copy(color); liq.material.emissive.copy(color);
    }, label, 0); // empty wells at rest
    grp.userData.mouth={ x:awx, y:BH, z:awz, approach:'top' };
    grp.userData.entry=FLOOR_Y+WELL_D*0.4;
    return tagSpec(grp,'microplate_96');
  }

  /* T-flask (T-25/T-75) for adherent culture — LIES FLAT on its side. A flat
     elongated body, a canted vented neck at one top corner, cells growing as a
     monolayer on the flat bottom under a SHALLOW layer of medium. The `apply`
     hook drives the medium depth + a `setMono(v)` for the adherent monolayer
     (confluent -> detached), read by the contract's contentsState. */
  function buildFlask(){
    var grp=new THREE.Group();
    var L=2.7, W=1.5, H=0.6;                                  // length(x) × depth(z) × height(y) — flat
    // cloudy-polystyrene body (translucent so the monolayer + medium read through)
    var psMat=new THREE.MeshPhysicalMaterial({ color:0xeef2f6, roughness:0.35, metalness:0,
      transparent:true, opacity:0.26, clearcoat:0.6, clearcoatRoughness:0.35, envMapIntensity:0.8 });
    var body=new THREE.Mesh(new THREE.BoxGeometry(L,H,W), psMat);
    body.position.y=H/2+0.03; body.castShadow=true; grp.add(body);
    // moulded base rim so it reads as resting flat on the bench
    var rim=new THREE.Mesh(new THREE.BoxGeometry(L+0.05,0.06,W+0.05), matFrosted(0xdfe6ee));
    rim.position.y=0.03; grp.add(rim);
    // flat GROWTH SURFACE (the defining T-flask feature): a matte panel on the bottom
    var growth=new THREE.Mesh(new THREE.PlaneGeometry(L-0.18,W-0.18), matFrosted(0xe7edf3));
    growth.rotation.x=-Math.PI/2; growth.position.y=0.075; grp.add(growth);
    // ribbed cap-end shoulder (T-flasks taper to the neck at one end)
    var shoulder=new THREE.Mesh(new THREE.BoxGeometry(0.5,H,W*0.9), psMat.clone());
    shoulder.position.set(L/2-0.25,H/2+0.03,0); grp.add(shoulder);
    // CANTED vented neck at one top corner + colour-coded screw cap
    var neckPivot=new THREE.Group(); neckPivot.position.set(L/2-0.18,H+0.02,W/2-0.34); grp.add(neckPivot);
    neckPivot.rotation.z=-0.62;                               // cant out toward the corner
    var neck=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,0.52,24), psMat.clone());
    neck.position.y=0.24; neckPivot.add(neck);
    // cap + its ribs live in ONE group so setCap can lift them off the neck together
    // the cap lives in the FLASK's frame (not the canted neck's), so taking it off can set
    // it down on the bench beside the flask instead of leaving it hanging in the air
    var CAP_ON=new THREE.Vector3(0,0.55,0).applyEuler(new THREE.Euler(0,0,-0.62)).add(neckPivot.position);
    var CAP_BENCH=new THREE.Vector3(L/2-0.25, 0.09, W/2+0.4);   // on the bench, in front of the neck
    var flaskCapGrp=new THREE.Group(); flaskCapGrp.position.copy(CAP_ON); flaskCapGrp.rotation.z=-0.62; grp.add(flaskCapGrp);
    var cap=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.18,28), matPlastic(0x3f7fd0));
    flaskCapGrp.add(cap);
    for(var rc=0;rc<18;rc++){ var ra=rc/18*Math.PI*2; var rib=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.14,0.026), matPlastic(0x3f7fd0));
      rib.position.set(Math.cos(ra)*0.205,0,Math.sin(ra)*0.205); rib.rotation.y=-ra; flaskCapGrp.add(rib); }
    // MEDIUM — a shallow layer flooding the flat base (NOT a tall column)
    var liq=new THREE.Mesh(new THREE.BoxGeometry(L-0.22,1,W-0.22), liquidMat());
    fx(liq,'fluid'); grp.add(liq);
    // the adherent MONOLAYER — a faint film on the growth surface; opacity = confluence
    var monoMat=new THREE.MeshStandardMaterial({ color:0xbfcbb6, roughness:0.7, transparent:true, opacity:0.0, emissive:0x2c3a24, emissiveIntensity:0.04 });
    var mono=new THREE.Mesh(new THREE.PlaneGeometry(L-0.24,W-0.24), monoMat);
    mono.rotation.x=-Math.PI/2; mono.position.y=0.082; fx(mono,'decal'); grp.add(mono);
    // DETACHABLE CELLS — a cloud that lies flat as the confluent monolayer and, on
    // trypsinisation, ROUNDS UP and LIFTS into the medium as a suspension (this is
    // the visible payoff of the trypsin step). setMono(1)=attached, 0=detached.
    var cellGeo=new THREE.SphereGeometry(0.032,8,6);
    var cellMat=new THREE.MeshStandardMaterial({ color:0xcdd8c4, roughness:0.6, emissive:0x38492c, emissiveIntensity:0.06 });
    var CELLN=70, cells=new THREE.InstancedMesh(cellGeo, cellMat, CELLN);
    var cseed=[]; for(var ci=0;ci<CELLN;ci++) cseed.push({ x:(Math.random()-0.5)*(L-0.5), z:(Math.random()-0.5)*(W-0.42), r:Math.random(), a:Math.random()*6.28, ry:0.25+Math.random()*0.85 });
    fx(cells,'effect'); grp.add(cells);
    var cmat=new THREE.Matrix4();
    function placeCells(v){ var lift=1-clamp(v,0,1);
      for(var i=0;i<CELLN;i++){ var s=cseed[i];
        var y=0.088 + lift*(0.03+s.ry*0.14);                          // rise into the medium
        var jx=lift*Math.cos(s.a)*0.14*s.r, jz=lift*Math.sin(s.a)*0.14*s.r; // drift apart
        var sc=0.5+lift*0.9;                                          // round up (grow) as they lift
        cmat.makeScale(sc,sc,sc); cmat.setPosition(s.x+jx, y, s.z+jz); cells.setMatrixAt(i,cmat);
      }
      cells.instanceMatrix.needsUpdate=true;
    }
    var label=makeLabel("","T-flask"); label.position.set(0,1.05,0); grp.add(label);
    var lst=attachSampleLiquid(grp, liq, function(liq,lv,color){
      var h=Math.max(0.008, lv*0.16); liq.scale.set(1,h,1); liq.position.y=0.09+h/2;   // shallow
      liq.material.color.copy(color); liq.material.emissive.copy(color);
    }, label, 0.42); // a confluent flask at rest holds a shallow layer of medium
    // culture medium is a MUTED rose (phenol-red), not a saturated teal
    lst.color.set(0xcf8791); lst.tColor.set(0xcf8791);
    // contentsState hook: 1 = confluent monolayer (film + flat cells), 0 = detached
    // (film gone, cells rounded up and suspended in the medium).
    grp.userData.setMono=function(v){ monoMat.opacity=clamp(v,0,1)*0.5; placeCells(v); };
    grp.userData.setMono(1);
    // CAP (Stage 38): you take the cap OFF to pour in and put it back ON — the same
    // treatment bottles get. setCap(true)=sealed; setCap(false)=lifted up the neck + aside.
    var flaskCap={ open:0, tOpen:0 };
    grp.userData.setCap=function(on){ flaskCap.tOpen = on ? 0 : 1; };
    var _flaskUpd=grp.userData.update;
    grp.userData.update=function(dt){
      if(_flaskUpd) _flaskUpd(dt);
      flaskCap.open = lerp(flaskCap.open, flaskCap.tOpen, 1-Math.pow(0.0009,dt));
      var o=flaskCap.open;
      // unscrew up off the neck (o 0-0.3), carry over clear (0.3-0.7), set down on the
      // bench upright beside the flask (0.7-1). Reverses to cap it again.
      var up=CAP_ON.y+0.35, e;
      if(o<0.3){ e=easeInOut(o/0.3); flaskCapGrp.position.set(CAP_ON.x, lerp(CAP_ON.y, up, e), CAP_ON.z); flaskCapGrp.rotation.z=-0.62*(1-e); }
      else if(o<0.7){ e=easeInOut((o-0.3)/0.4); flaskCapGrp.position.set(lerp(CAP_ON.x,CAP_BENCH.x,e), up, lerp(CAP_ON.z,CAP_BENCH.z,e)); flaskCapGrp.rotation.z=0; }
      else { e=easeInOut((o-0.7)/0.3); flaskCapGrp.position.set(CAP_BENCH.x, lerp(up, CAP_BENCH.y, e), CAP_BENCH.z); flaskCapGrp.rotation.z=0; }
    };
    var root=fitArt(grp,'flask_t75'), F=root.userData.fit;
    // the canted NECK MOUTH (drawing: 0.55 up the neck axis from its pivot), its cant as it
    // reads after the fit (a non-uniform scale changes the angle), and how far down the
    // neck axis a tip travels to reach the medium (drawing 0.95 along the axis)
    var NECK=0.62, ax=Math.sin(NECK)*F.sx, ay=Math.cos(NECK)*F.sy, alen=Math.hypot(ax,ay);
    var m=F.toWorld(neckPivot.position.x+Math.sin(NECK)*0.55, neckPivot.position.y+Math.cos(NECK)*0.55, neckPivot.position.z);
    root.userData.mouth={ x:m.x, y:m.y, z:m.z, approach:'angled', tilt:-Math.atan2(ax,ay), depth:0.95*alen, standoff:0.75*alen };
    return tagSpec(root,'flask_t75');
  }

  /* petri dish — shallow round liquid layer, aspirated */
  function buildDish(){
    var grp=new THREE.Group(); var R=0.95;
    var base=new THREE.Mesh(new THREE.CylinderGeometry(R,R,0.14,48,1,true), matFrosted(0xe3e9ef));
    base.position.y=0.07; base.castShadow=true; grp.add(base);
    var floor=new THREE.Mesh(new THREE.CircleGeometry(R,48), matFrosted(0xeef2f6));
    floor.rotation.x=-Math.PI/2; floor.position.y=0.006; grp.add(floor);
    var lid=new THREE.Mesh(new THREE.CylinderGeometry(R*1.03,R*1.03,0.12,48,1,true), glassMaterial());
    lid.position.y=0.16; grp.add(lid);
    var liq=new THREE.Mesh(new THREE.CylinderGeometry(R*0.9,R*0.9,1,48), liquidMat());
    fx(liq,'fluid'); grp.add(liq);
    var label=makeLabel("","dish"); label.position.set(0,0.7,0); grp.add(label);
    attachSampleLiquid(grp, liq, function(liq,lv,color){
      var h=Math.max(0.008, lv*0.09); liq.scale.set(1,h,1); liq.position.y=0.012+h/2;
      liq.material.color.copy(color); liq.material.emissive.copy(color);
    }, label, 0); // empty dish at rest
    var root=fitArt(grp,'petri_90');
    root.userData.mouth={ x:0, y:dims('petri_90').height, z:0, approach:'top' };
    root.userData.entry=root.userData.fit.toWorld(0,0.03,0).y;
    return tagSpec(root,'petri_90');
  }

  /* glass microscope slide — sample is a smear/film; stain floods colour over it */
  function buildSlide(){
    var grp=new THREE.Group();
    var Lx=2.4, Lz=0.8, th=0.05;                              // ~3:1 thin glass slide
    var glass=new THREE.Mesh(new THREE.BoxGeometry(Lx,th,Lz), glassMaterial());
    glass.position.y=0.045; glass.castShadow=true; grp.add(glass);
    // frosted label band across ONE SHORT END (spans the full depth)
    var frost=new THREE.Mesh(new THREE.BoxGeometry(0.42,th+0.006,Lz), matFrosted(0xeef2f6));
    frost.position.set(-Lx/2+0.21,0.046,0); grp.add(frost);
    // the SMEAR — a thin ELLIPTICAL film on the surface; the stain floods colour over
    // it. Muted + capped opacity so it reads as a thin smear, never a floating blob.
    var filmMat=new THREE.MeshStandardMaterial({ color:0xc9c4cf, roughness:0.6, transparent:true, opacity:0.0, emissive:0x2a2630, emissiveIntensity:0.03 });
    var film=new THREE.Mesh(new THREE.CircleGeometry(0.32,40), filmMat);
    film.rotation.x=-Math.PI/2; film.scale.set(1.6,1,0.7); film.position.set(0.35,0.075,0); fx(film,'decal'); grp.add(film);
    var label=makeLabel("","slide"); label.position.set(0,0.55,0); grp.add(label);
    attachSampleLiquid(grp, film, function(f,lv,color){
      f.material.color.copy(color); f.material.emissive.copy(color);
      f.material.opacity=Math.min(0.68, lv*0.9);             // thin muted smear
    }, label, 0); // clean slide at rest
    var root=fitArt(grp,'slide_iso8037');
    var sm=root.userData.fit.toWorld(0.35,0.07,0);
    root.userData.mouth={ x:sm.x, y:sm.y, z:sm.z, approach:'top' };
    root.userData.entry=sm.y;
    return tagSpec(root,'slide_iso8037');
  }

  /* nitrocellulose membrane — a thin sheet carrying transferred bands (aspirated) */
  function buildMembrane(){
    var grp=new THREE.Group();
    var sheet=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.03,1.2), matFrosted(0xf1ece4));
    sheet.material.opacity=0.9; sheet.position.y=0.04; sheet.castShadow=true; grp.add(sheet);
    // sample = a set of protein bands, coloured by setColor, revealed by setLevel
    var bands=[]; var bandMat=new THREE.MeshBasicMaterial({ color:COL.lysis, transparent:true, opacity:0 });
    for(var i=0;i<4;i++){ var b=new THREE.Mesh(new THREE.BoxGeometry(1.3,0.008,0.06), bandMat.clone());
      b.position.set(0,0.057,-0.4+i*0.26); fx(b,'decal'); grp.add(b); bands.push(b); }
    var label=makeLabel("","membrane"); label.position.set(0,0.7,0); grp.add(label);
    attachSampleLiquid(grp, bands, function(bs,lv,color){
      for(var k=0;k<bs.length;k++){ bs[k].material.color.copy(color); bs[k].material.opacity=Math.min(0.95, lv*1.3); }
    }, label, 0); // clean membrane at rest (bands appear on transfer)
    var root=fitArt(grp,'membrane_mini');
    root.userData.mouth={ x:0, y:dims('membrane_mini').height, z:0, approach:'top' };
    root.userData.entry=dims('membrane_mini').height;
    return tagSpec(root,'membrane_mini');
  }

  /* agarose gel slab in a casting tray — sample = a loaded lane + a migrating band */
  function buildGelSlab(){
    var grp=new THREE.Group();
    var tray=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.1,1.3), matPlastic(0x2b3038));
    tray.position.y=0.05; grp.add(tray);
    var gel=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.16,1.1),
      new THREE.MeshPhysicalMaterial({ color:0xd8c98a, roughness:0.5, transparent:true, opacity:0.5, envMapIntensity:0.5 }));
    gel.position.y=0.16; grp.add(gel);
    // wells across the top edge — slots cut INTO the slab. They are children of the gel
    // mesh, so y is in ITS local space: the slab top is +0.08. Each slot sinks 0.06 into
    // the gel with its mouth flush at the surface (the old 0.245 was a group-space height
    // and left them hovering ~0.16 above the gel, casting their own shadows).
    var GEL_TOP=0.08;
    var wellMat=new THREE.MeshBasicMaterial({ color:0x1c2128 });
    for(var w=0;w<6;w++){ var wl=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.06,0.05), wellMat);
      wl.position.set(-0.6+w*0.24,GEL_TOP-0.03+0.002,-0.45); fx(wl,'decal'); gel.add(wl); }
    // the loaded band runs IN the gel, just under its surface
    var band=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.02,0.05), new THREE.MeshBasicMaterial({ color:COL.lysis, transparent:true, opacity:0 }));
    band.position.set(-0.36,GEL_TOP-0.01+0.002,-0.4); fx(band,'decal'); gel.add(band);
    var label=makeLabel("","gel"); label.position.set(0,0.8,0); grp.add(label);
    attachSampleLiquid(grp, band, function(b,lv,color){
      b.material.color.copy(color); b.material.opacity=Math.min(0.9,lv*1.3);
      b.position.z=-0.4+lv*0.7;   // the band migrates down the gel with fill/progress
    }, label, 0); // no band at rest (wells only)
    var root=fitArt(grp,'gel_tray_7x10');
    var gm=root.userData.fit.toWorld(-0.36,0.24,-0.4);   // the loading well, at the gel surface
    root.userData.mouth={ x:gm.x, y:gm.y, z:gm.z, approach:'top' };
    root.userData.entry=root.userData.fit.toWorld(0,0.2,0).y;
    return tagSpec(root,'gel_tray_7x10');
  }

  /* petri dish with an agar bed — for seed: liquid dropped on, spreader sweeps */
  function buildAgarPlate(){
    var grp=new THREE.Group(); var R=0.95;
    var base=new THREE.Mesh(new THREE.CylinderGeometry(R,R,0.16,48,1,true), matFrosted(0xe3e9ef));
    base.position.y=0.08; base.castShadow=true; grp.add(base);
    var agar=new THREE.Mesh(new THREE.CylinderGeometry(R*0.94,R*0.94,0.1,48),
      new THREE.MeshStandardMaterial({ color:0xe7c98a, roughness:0.7, metalness:0, envMapIntensity:0.4 }));
    agar.position.y=0.09; grp.add(agar);
    // the seeded film (bacterial lawn) — colour + coverage grow as it's spread
    var lawnMat=new THREE.MeshStandardMaterial({ color:COL.lysis, roughness:0.6, transparent:true, opacity:0, emissive:COL.lysis, emissiveIntensity:0.05 });
    var lawn=new THREE.Mesh(new THREE.CircleGeometry(R*0.9,48), lawnMat);
    lawn.rotation.x=-Math.PI/2; lawn.position.y=0.142; fx(lawn,'decal'); grp.add(lawn);
    var label=makeLabel("","agar"); label.position.set(0,0.7,0); grp.add(label);
    attachSampleLiquid(grp, lawn, function(l,lv,color){
      l.material.color.copy(color); l.material.emissive.copy(color);
      l.material.opacity=Math.min(0.75, lv*1.1); l.scale.setScalar(0.3+lv*1.0);
    }, label, 0); // freshly-poured plate: uniform agar, no lawn
    var root=fitArt(grp,'petri_90');
    root.userData.mouth={ x:0, y:dims('petri_90').height, z:0, approach:'top' };
    root.userData.entry=root.userData.fit.toWorld(0,0.16,0).y;
    return tagSpec(root,'petri_90');
  }

  /* −80 °C freezer box — the vessel is placed inside; door opens, frost breathes out */
  function buildFreezer(){
    var grp=new THREE.Group();
    var shell=matPainted(0xd7dbe0,0.5);
    // TALL enough for the sample tube that is actually stored in it: the travelling
    // sample tube is 1.7 tall, and the old 1.5 cavity (box top 2.0) let its rim pass
    // through the top of the closed freezer. Cavity now spans y 0.30-2.40.
    var H=2.6;
    var box=new THREE.Mesh(new THREE.BoxGeometry(2.2,H,1.6), shell);
    box.position.y=H/2; box.castShadow=true; box.receiveShadow=true; grp.add(box);
    var cavityMat=new THREE.MeshStandardMaterial({ color:0xaeb8c4, roughness:0.5, metalness:0.1, side:THREE.DoubleSide });
    var cavity=new THREE.Mesh(new THREE.BoxGeometry(1.7,2.1,0.7), cavityMat);
    cavity.position.set(0,1.35,0.5); grp.add(cavity);
    // hinged door (front)
    var doorPivot=new THREE.Group(); doorPivot.position.set(-1.05,H/2,0.85); grp.add(doorPivot);
    var door=new THREE.Mesh(new THREE.BoxGeometry(2.1,H-0.1,0.12), matPainted(0xe6e9ed,0.5));
    door.position.set(1.05,0,0); doorPivot.add(door);
    // prominent vertical PULL HANDLE on the door's free edge, on standoff brackets
    var handleBar=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,1.9,16), matBrushed(0x868f9b));
    handleBar.position.set(1.86,0,0.22); doorPivot.add(handleBar);
    for(var hb=0;hb<2;hb++){ var brk=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.09,0.16), matBrushed(0x868f9b));
      brk.position.set(1.86,-0.7+hb*1.4,0.13); doorPivot.add(brk); }
    // hinge barrels on the hinge side so the door reads as a door
    for(var hg=0;hg<2;hg++){ var hinge=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.26,12), matBrushed(0x868f9b));
      hinge.position.set(0.06,-0.9+hg*1.8,0.07); doorPivot.add(hinge); }
    // frost fog puff (additive) at the mouth
    // a THIN, translucent cold mist that spills from the bottom door seam and lies low
    // on the bench — it used to be an additive sphere in front of the door, larger than
    // the opening, that rendered as an opaque white disc hiding the freezer
    var frostMat=new THREE.MeshBasicMaterial({ color:0xdfeaf4, transparent:true, opacity:0.0, depthWrite:false, fog:false });
    var frost=new THREE.Mesh(new THREE.SphereGeometry(0.5,20,12), frostMat); frost.position.set(0,0.14,1.05); frost.scale.set(1.8,0.22,0.5); fx(frost,'effect'); grp.add(frost);
    var label=makeLabel("−80 °C",""); label.position.set(0,2.9,0); grp.add(label);
    var st={ door:0, tDoor:0 }; // CLOSED at rest (the store animation opens it)
    grp.userData.label=label;
    grp.userData.setDoor=function(open){ st.tDoor=open?1:0; };
    grp.userData.setFrost=function(a){ frostMat.opacity=clamp(a,0,0.5)*0.4; };  // at most a faint mist
    grp.userData.update=function(dt){ st.door=lerp(st.door,st.tDoor,1-Math.pow(0.02,dt)); doorPivot.rotation.y=easeInOut(st.door)*1.2; };
    return tagSpec(grp,'ult_freezer_portable');
  }

  /* staining tray — a slotted tray the slide rests in while dye floods over it */
  function buildStainingTray(){
    var grp=new THREE.Group();
    var tray=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.24,1.3), matPlastic(0x394049));
    tray.position.y=0.12; tray.castShadow=true; tray.receiveShadow=true; grp.add(tray);
    var well=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.16,1.1), new THREE.MeshStandardMaterial({ color:0x20262d, roughness:0.8, side:THREE.DoubleSide }));
    well.position.y=0.16; grp.add(well);
    // two support rails the slide bridges
    for(var s=0;s<2;s++){ var rail=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.05,0.08), matPlastic(0x596270));
      rail.position.set(0,0.22,-0.4+s*0.8); grp.add(rail); }
    var label=makeLabel("Staining tray",""); label.position.set(0,0.9,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    return tagSpec(grp,'staining_tray');
  }

  /* vortex mixer — a squat box with a rubber cup on top; the tube presses in and
     shakes. Gives the vortex_mix action a real device instead of a bare bench. */
  function buildVortexMixer(){
    var grp=new THREE.Group();
    var body=new THREE.Mesh(new THREE.BoxGeometry(1.25,0.62,1.05), matPainted(0x3b424b,0.5));
    body.position.y=0.31; body.castShadow=true; body.receiveShadow=true; grp.add(body);
    var neck=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.34,0.16,20), matAnodized(0x2a2e34));
    neck.position.y=0.68; grp.add(neck);
    var cup=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.19,0.22,20,1,true), matRubber(0x1b1e23));
    cup.position.y=0.82; grp.add(cup);
    var cupFloor=new THREE.Mesh(new THREE.CircleGeometry(0.19,20), matRubber(0x1b1e23));
    cupFloor.rotation.x=-Math.PI/2; cupFloor.position.y=0.71; grp.add(cupFloor);
    var dial=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.06,16), matPlastic(0x8a94a0));
    dial.rotation.x=Math.PI/2; dial.position.set(0.42,0.36,0.53); grp.add(dial);
    var label=makeLabel("Vortex",""); label.position.set(0,1.3,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    return tagSpec(grp,'vortex_mixer');
  }

  /* bent-glass cell spreader ("hockey stick") for plating on agar — a long glass
     handle bent near one end into a short flat FOOT that lies on the bench. */
  function buildSpreader(){
    var grp=new THREE.Group(); var mat=glassMaterial();
    var rr=0.032;
    // horizontal spreading FOOT resting flat on the bench
    var foot=new THREE.Mesh(new THREE.CylinderGeometry(rr,rr,0.8,16), mat);
    foot.rotation.z=Math.PI/2; foot.position.set(0.4,rr+0.01,0); grp.add(foot);
    var tip=new THREE.Mesh(new THREE.SphereGeometry(rr,12,10), mat); tip.position.set(0.8,rr+0.01,0); grp.add(tip);
    // the L-BEND joint at the near end
    var bend=new THREE.Mesh(new THREE.SphereGeometry(rr*1.2,14,12), mat); bend.position.set(0,rr+0.01,0); grp.add(bend);
    // long handle rising up-and-slightly-back from the bend (hockey-stick shaft)
    var handle=new THREE.Mesh(new THREE.CylinderGeometry(rr,rr,1.5,16), mat);
    handle.position.set(-0.06,0.78,0); handle.rotation.z=0.12; grp.add(handle);
    var label=makeLabel("Spreader",""); label.position.set(0,1.7,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    return tagSpec(grp,'cell_spreader');
  }

  function buildSample(){
    var tube   = buildTube({color:COL.pellet, label:"Neutrophil pellet", sub:"", cold:true, capColor:0x3f7fd0});
    var column = buildSpinColumn();
    var elu    = buildTube({color:COL.rna, label:"Eluate", sub:"RNA", capColor:0x49b26a});
    // Stage-8: the sample can also be ANY of these container types — one persistent
    // travelling sample carried through the actual glassware of any protocol.
    var S={ tube:tube, column:column, elu:elu,
      cryovial:buildCryovial(), wellplate:buildWellPlate(), flask:buildFlask(), dish:buildDish(),
      slide:buildSlide(), membrane:buildMembrane(), gel:buildGelSlab(), agarplate:buildAgarPlate() };
    var KEYS=['tube','column','elu','cryovial','wellplate','flask','dish','slide','membrane','gel','agarplate'];
    var vessels=KEYS.map(function(k){ return S[k]; });
    S.vessels=vessels; S.active=tube;
    for(var v=0;v<vessels.length;v++){
      vessels[v].visible=false; vessels[v].userData.tPos=vessels[v].position.clone(); scene.add(vessels[v]);
    }
    // show exactly one vessel (hand-off timelines may reveal a second mid-station)
    S.only=function(name){
      for(var i=0;i<KEYS.length;i++){ S[KEYS[i]].visible=(KEYS[i]===name); }
      // any station that shows a vessel gets it WHOLE (a nest move may have left the
      // column's collection tube behind on its own bench)
      if(S[name] && S[name].userData.reattachCollection) S[name].userData.reattachCollection();
      S.active=S[name]||tube;
    };
    // set a vessel's travel target; snap instantly on non-sequential jumps, glide otherwise
    S.at=function(vessel,x,y,z){ vessel.userData.tPos.set(x,y,z); if(SNAP_SAMPLE) vessel.position.set(x,y,z); };
    S.snapTo=function(vessel,x,y,z){ vessel.userData.tPos.set(x,y,z); vessel.position.set(x,y,z); };
    return S;
  }

  function addBottle(st, key, labelText, color, x, z){
    var b = buildBottle(color, labelText, 1.3, color);
    b.position.set(x, 0, z); b.userData.noFrame = true;   // reagent SOURCE (dressing) — not framed
    st.group.add(b);
    if(b.userData.update) st.updatables.push(b);   // animate its cap + level each frame
    st.reagents[key] = { grp:b, pos:new THREE.Vector3(x, 0.24, z) };
  }
  function stationReagent(st, Y, o){
    addPipetteRig(st);
    addBottle(st, o.key, o.blabel, o.color, 2.0, 0.7);
    // CONTRACT: the container tells the pipette WHERE to dispense (a tube: dead
    // centre; a well: one off-centre well; a flask: at the canted neck). Default =
    // centre (the microtube), so nothing regresses when a container omits it.
    var disp = o.dispense || {x:0, z:0};
    st.enter=function(){
      SAMPLE.only(o.vessel);
      var v=SAMPLE[o.vessel];
      if(o.vlabel) v.userData.setLabel(o.vlabel, o.vsub||"");
      if(o.cStart!=null) v.userData.setColor(o.cStart);
      v.userData.setLevel(o.lStart);
      SAMPLE.at(v, st.x, Y, 0);
      pipRest(st);
    };
    st.timeline=function(p){
      var v=SAMPLE[o.vessel];
      var b=st.reagents[o.key].grp;
      // the bottle opens BEFORE the pipette dips in (phase A), stays open while it
      // draws, and closes once the pipette leaves; its level drops as liquid is drawn.
      if(b && b.userData.setCap){
        b.userData.setCap(!(p>0.03 && p<0.36));
        b.userData.setLevel(1 - 0.22*clamp(p/0.30,0,1));
      }
      // the RECEIVING vessel (flask / cryovial) uncaps BEFORE the tip reaches its neck and
      // re-caps once it leaves — a tip through a closed cap is the same lie as through glass.
      if(v.userData.setCap) v.userData.setCap(!(p>0.1 && p<0.95));
      // for an ANGLED neck the dispense point is the neck MOUTH (its own height),
      // NOT the seat plane — otherwise the tip dips onto the flat top face.
      var toY = (disp.approach==='angled' && disp.y!=null) ? disp.y : Y;
      pipetteRun(st, st.reagents[o.key].pos, {x:disp.x,y:toY,z:disp.z}, p,
        {color:o.color, fill:0.8, approach:disp.approach, tilt:disp.tilt, depth:disp.depth, dipDepth:o.entry});
      if(p>DISPENSE_FROM){ var q=dispenseProgress(p);
        v.userData.setLevel(lerp(o.lStart,o.lEnd,q));
        if(o.cEnd!=null) v.userData.setColor(o.cEnd);
      }
    };
  }
  function stationSpin(st, Y, o){
    var cen=buildCentrifuge(); cen.position.set(1.4,0,-0.5); cen.scale.setScalar(0.85);
    st.group.add(cen); st.updatables.push(cen); st.cen=cen;
    // IMPROVEMENT over the demo (which spun an EMPTY rotor while the tube sat on the
    // bench): the sample is docked into an ACTUAL rotor slot — correct radius + outward
    // tilt — and PARENTED to the holder, so it RIDES the rotor as it spins. The lid
    // closes before the spin and opens once it stops.
    var holder = cen.userData.holders[2];   // a slot facing the camera at rest
    var SEAT_SCALE=0.6, SEAT_Y=-0.16;        // a small tube fits the slot and clears the closed lid
    var preSlot={ x:1.4, y:1.42, z:0.03 };   // just above the slot (station-local)
    var lift={ x:1.4, y:2.15, z:0.03 };      // raised clear of the rotor
    var docked=false;
    function dock(){
      if(docked) return;
      var v=SAMPLE[o.vessel];
      holder.add(v);                         // reparent INTO the slot — now rides the rotor
      v.position.set(0, SEAT_Y, 0);          // seated in the slot bottom
      v.rotation.set(0,0,0);                 // aligns with the holder's outward tilt
      v.scale.setScalar(SEAT_SCALE);
      v.userData.docked=true; docked=true;   // frame loop stops gliding it while docked
    }
    function undock(){
      if(!docked) return;
      var v=SAMPLE[o.vessel];
      scene.attach(v);                       // back to the scene, preserving world transform
      v.rotation.set(0,0,0); v.scale.setScalar(1);
      v.userData.docked=false; docked=false;
    }
    st.enter=function(){
      SAMPLE.only(o.vessel);
      var v=SAMPLE[o.vessel];
      if(o.vlabel) v.userData.setLabel(o.vlabel, o.vsub||"");
      if(o.color!=null) v.userData.setColor(o.color);
      v.userData.setLevel(o.lStart==null?0.5:o.lStart);
      undock(); v.scale.setScalar(1); v.rotation.set(0,0,0); v.visible=true;
      SAMPLE.at(v, st.x+lift.x, lift.y, lift.z);        // arrives above the open rotor
      cen.userData.setLabel(o.cenLabel||"Centrifuge", o.cenSub||""); cen.userData.setSpin(0); cen.userData.setLid(true);
    };
    if(o.seconds) st.hud={label:o.hudLabel||"Centrifuge", seconds:o.seconds};
    // COUNTDOWN-OWNED SPIN (Stage 19). When the runner has a live timer the rotor is a
    // function of the COUNTDOWN, not the fixed choreography p: it spins for exactly as long
    // as the digits run — 15 s on the clock == 15 s of spin, ten minutes == ten minutes.
    // Entry (dock + lid close) and exit (spin-down + lid open + lift out) use ABSOLUTE time
    // so a long spin doesn't glide in for minutes. t = { hasTimer, running, done, progress }.
    var phase="rest", runT=0, endT=0;
    st.driveTimed=function(t,dt){
      var v=SAMPLE[o.vessel]; v.visible=true;
      var engaged = t.running || t.done || t.progress>0.0001;
      if(!engaged){                               // pre-spin REST — also where Reset returns
        if(phase!=="rest"){ phase="rest"; runT=0; endT=0; }
        undock(); cen.userData.setSpin(0); cen.userData.setLid(true);
        v.scale.setScalar(1); v.rotation.set(0,0,0);
        SAMPLE.at(v, st.x+lift.x, lift.y, lift.z);
        v.userData.setLevel(o.lStart==null?0.5:o.lStart);
        return;
      }
      if(t.done || t.progress>=1){                // 00:00 — rotor spins DOWN, lid opens, sample lifts out
        if(phase!=="end"){ phase="end"; endT=0; }
        endT+=dt;
        cen.userData.setSpin(0);                  // update() lerps the wheel to a stop
        if(endT<0.9){ dock(); cen.userData.setLid(false); }      // still closed while it slows
        else if(endT<1.5){ cen.userData.setLid(true); }          // lid swings open
        else { undock(); var q=easeInOut(clamp((endT-1.5)/0.6,0,1));
               SAMPLE.at(v, st.x+lift.x, lerp(preSlot.y,lift.y,q), preSlot.z); }
        return;
      }
      // RUNNING or PAUSED: lid closed, sample docked, rotor spins for the WHOLE countdown.
      if(phase!=="run"){ phase="run"; runT=0; }
      runT+=dt;
      var ent=clamp(runT/0.55,0,1);               // quick entry glide, absolute-timed
      if(ent<1 && !docked){
        var qe=easeInOut(ent);
        SAMPLE.at(v, st.x+preSlot.x, lerp(lift.y,preSlot.y,qe), preSlot.z);
        cen.userData.setLid(true); cen.userData.setSpin(0);
      } else {
        dock();
        cen.userData.setLid(false);
        cen.userData.setSpin(t.running?24:0);     // spin while running; decelerate & hold when paused
      }
      if(o.lEnd!=null) v.userData.setLevel(lerp(o.lStart==null?0.5:o.lStart,o.lEnd,easeInOut(clamp(t.progress,0,1))));
    };
    st.timeline=function(p){
      var v=SAMPLE[o.vessel]; v.visible=true;
      if(p<0.18){                            // 1 · glide in, lower toward the slot (lid open)
        undock();
        var q=easeInOut(clamp(p/0.16,0,1));
        SAMPLE.at(v, st.x+preSlot.x, lerp(lift.y,preSlot.y,q), preSlot.z);
        cen.userData.setSpin(0); cen.userData.setLid(true);
      } else if(p<0.26){                     // 2 · seat into the slot; lid closes over it
        dock(); cen.userData.setSpin(0); cen.userData.setLid(false);
      } else if(p<0.80){                     // 3 · lid closed + SPINNING — sample rides the rotor
        dock(); cen.userData.setSpin(24); cen.userData.setLid(false);
      } else if(p<0.90){                     // 4 · rotor stops; lid opens
        cen.userData.setSpin(0); cen.userData.setLid(true);
      } else {                               // 5 · lift the sample out of the slot
        undock();
        var q3=easeInOut((p-0.90)/0.10);
        SAMPLE.at(v, st.x+lift.x, lerp(preSlot.y,lift.y,q3), preSlot.z);
        cen.userData.setSpin(0); cen.userData.setLid(true);
      }
      if(o.lEnd!=null) v.userData.setLevel(lerp(o.lStart==null?0.5:o.lStart, o.lEnd, easeInOut(clamp(p,0,1))));
    };
  }

export { dispenseProgress, pipetteRun, addStand, addPipetteRig, pipRest, buildSample, addBottle, stationReagent, stationSpin, PIP_STAND, PIP_REST, easeInOut, lerp, clamp }
