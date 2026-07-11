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

  var LOOK = {
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
      fog:{ color:0xbcb7ae, density:0.0028 }, exposure:0.78,
      amb:{ color:0xd6d9de, int:0.12 }, hemi:{ sky:0xdde4ee, ground:0xb4aea4, int:0.20 },
      key:{ color:0xfff3e2, int:1.32 }, fill:{ color:0xccd4de, int:0.17, pos:[-8,4,9] },
      aux:{ color:0xe2e0d8, int:0.14, pos:[-3,11,-6] }
    },
    isometric:{
      fog:{ color:0x2a3452, density:0.0055 }, exposure:0.98,
      amb:{ color:0x566280, int:0.24 }, hemi:{ sky:0x93a6cf, ground:0x232c38, int:0.30 },
      key:{ color:0xfff0da, int:1.08 }, fill:{ color:0x6f88c4, int:0.22, pos:[-8,5,9] },
      aux:{ color:0x39c9d6, int:0.40, pos:[-3,9,-11] }
    }
  };

  /* production-line geometry */
  var SPACING = 8.4;                 // distance between stations along +X
  var BLOCK_TOP = 0.45;              // cold-block plate height

  /* Two palettes. CINEMATIC = b4's muted, desaturated look; ISOMETRIC = the
     saturated stylized "clay" candy tones from isometric-v3. `COL` is the LIVE
     palette (mutated in place on a view switch); structural materials are built
     from it once, travelling-sample liquids read it live every frame. */
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
  var COL_ISO = {
    lysis:  0x3ec9b3,   // saturated teal   (RLT + β-ME)
    etoh:   0x5aa9ee,   // clear sky-blue   (70% ethanol)
    wash:   0x8fa0cf,   // periwinkle       (RW1 / RPE)
    dnase:  0xf6b53a,   // warm amber       (DNase I)
    rna:    0x54d494,   // fresh mint       (eluate / RNA)
    water:  0xa9d8f2,   // cool clear       (RNase-free water)
    pellet: 0xe6a862,   // neutrophil pellet (warm sand)
    glass:  0xdfeaf3,
    steel:  0xb4c0d0,
    accent: 0x35c8b2
  };
  var COL = {};
  (function(s){ for(var k in s) COL[k]=s[k]; })(COL_CINE);   // live palette starts cinematic
  function setPalette(src){ for(var k in src) COL[k]=src[k]; }   // mutate in place (refs stay valid)

  /* helpers */
  function lerp(a,b,t){ return a + (b-a)*t; }
  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function easeInOut(t){ t=clamp(t,0,1); return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
  var MAX_ANISO = 8;

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
  function makeLabel(text, sub){
    var W=1024, H=320, S=W/512;
    var c = document.createElement("canvas"); c.width=W; c.height=H;
    var g = c.getContext("2d");
    function draw(t2,s2){
      g.clearRect(0,0,W,H);
      var r=14*S, x=10*S, y=34*S, w=492*S, h=92*S;
      g.fillStyle="rgba(20,23,27,0.82)"; roundRect(g,x,y,w,h,r); g.fill();
      g.lineWidth=1.5*S; g.strokeStyle="rgba(150,160,175,0.28)"; roundRect(g,x,y,w,h,r); g.stroke();
      g.fillStyle="#e9edf1";
      g.font="500 "+(42*S)+"px 'Helvetica Neue', Helvetica, Arial";
      g.textAlign="center"; g.textBaseline="middle";
      g.fillText(t2, W/2, (s2?66:80)*S);
      if(s2){
        g.font="400 "+(28*S)+"px 'Helvetica Neue', Helvetica, Arial";
        g.fillStyle="#8fcabf";
        g.fillText(s2, W/2, 104*S);
      }
    }
    draw(text, sub);
    var tex=new THREE.CanvasTexture(c); tex.anisotropy=MAX_ANISO;
    var sp=new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false, depthWrite:false }));
    sp.scale.set(1.85,0.578,1); sp.renderOrder=999;
    sp.userData.update=function(t2,s2){ draw(t2,s2); tex.needsUpdate=true; };
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
    g.fillStyle="rgba(190,200,214,0.5)"; g.font="600 20px 'Helvetica Neue',Arial"; g.textAlign="left";
    var vals=["1.5","","1.0","","0.5",""];
    for(var k=0;k<vals.length;k++){ if(vals[k]) g.fillText(vals[k], 204, 156+k*68); }
    var lx=250, ly=196, lw=150, lh=118;
    g.fillStyle="rgba(238,241,244,0.92)"; roundRect(g,lx,ly,lw,lh,10); g.fill();
    g.strokeStyle="rgba(140,150,166,0.5)"; g.lineWidth=2; roundRect(g,lx,ly,lw,lh,10); g.stroke();
    g.fillStyle="#20252c"; g.font="italic 600 30px 'Helvetica Neue',Arial"; g.textAlign="center";
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
    var H = opts.height || 1.7;
    var R = opts.radius || 0.34;
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
    var rim = new THREE.Mesh(new THREE.TorusGeometry(R*1.02,0.024,12,48), glassMat);
    rim.rotation.x=Math.PI/2; rim.position.y=H; visual.add(rim);

    // frosted writing patch moulded into the front wall
    var patchMat = new THREE.MeshStandardMaterial({ color:0xe9edf1, roughness:0.92, metalness:0,
      transparent:true, opacity:0.82, envMapIntensity:0.15, side:THREE.DoubleSide });
    var patch = new THREE.Mesh(new THREE.CylinderGeometry(R*0.965,R*0.9,H*0.30,20,1,true, Math.PI*0.5-0.62, 1.24), patchMat);
    patch.position.y=H*0.6; visual.add(patch);

    if(opts.grads!==false){
      var gMat = new THREE.MeshStandardMaterial({ map:tubeGraphicTex(opts.label||""), transparent:true,
        roughness:0.7, metalness:0, envMapIntensity:0.25, depthWrite:false, side:THREE.DoubleSide });
      var grad = new THREE.Mesh(new THREE.CylinderGeometry(R*0.99,R*0.9,H*0.7,48,1,true), gMat);
      grad.position.y=H*0.5; visual.add(grad);
      grp.userData.gradMat = gMat;
    }

    if(opts.cap!==false){
      var capGrp = new THREE.Group();
      var capMat = matPlastic(opts.capColor||0x2b323b);
      var lid = new THREE.Mesh(new THREE.CylinderGeometry(R*1.08,R*1.05,0.11,40), capMat);
      lid.position.y=0.055; capGrp.add(lid);
      var lidTop = new THREE.Mesh(new THREE.CylinderGeometry(R*0.62,R*1.02,0.05,40), capMat);
      lidTop.position.y=0.13; capGrp.add(lidTop);
      var plug = new THREE.Mesh(new THREE.CylinderGeometry(R*0.9,R*0.86,0.14,36), capMat);
      plug.position.y=-0.06; capGrp.add(plug);
      for(var rr=0;rr<18;rr++){
        var ra=rr/18*Math.PI*2;
        var rib=new THREE.Mesh(new THREE.BoxGeometry(0.016,0.1,0.05), capMat);
        rib.position.set(Math.cos(ra)*R*1.09, 0.055, Math.sin(ra)*R*1.09);
        rib.rotation.y=-ra; capGrp.add(rib);
      }
      var hinge=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,R*0.5), capMat);
      hinge.position.set(-R*1.05,0.0,0); capGrp.add(hinge);
      capGrp.position.y=H+0.06; capGrp.visible=false; visual.add(capGrp);
      grp.userData.cap=capGrp;
    }

    // liquid conforms to the tube's INNER wall (a slightly inset copy of `prof`),
    // rebuilt as a flat-topped lathe whenever the fill level changes.
    var innerFn   = innerRadiusFn(prof, 0.90);
    var liqBottom = 0.03;
    var liqFillMax= H*0.90;                 // fill line at full level
    var liqMat = new THREE.MeshPhysicalMaterial({
      color: opts.color||COL.lysis, metalness:0, roughness:0.32, vertexColors:true,
      transparent:false, emissive: opts.color||COL.lysis, emissiveIntensity:0.14,
      clearcoat:0.35, clearcoatRoughness:0.4, envMapIntensity:0.7
    });
    var liq = new THREE.Mesh(new THREE.BufferGeometry(), liqMat);
    liq.visible=false; visual.add(liq);

    var condens=null;
    if(opts.cold){
      condens=new THREE.Group();
      var dMat=new THREE.MeshPhysicalMaterial({ color:0xd6e2ea, roughness:0.08,
        transparent:true, opacity:0.42, envMapIntensity:1.0, depthWrite:false });
      var dGeo=new THREE.SphereGeometry(1,10,8);
      for(var dc=0;dc<22;dc++){
        var da=Math.random()*Math.PI*2, dy=H*(0.2+Math.random()*0.65), ds=0.012+Math.random()*0.02;
        var dm=new THREE.Mesh(dGeo,dMat);
        dm.position.set(Math.cos(da)*R*0.99, dy, Math.sin(da)*R*0.99);
        dm.scale.set(ds,ds*1.5,ds); condens.add(dm);
      }
      visual.add(condens);
    }

    var label=null;
    if(opts.label!==false){
      label=makeLabel(opts.label||"", opts.sub||"");
      label.position.set(0, H+0.7, 0);
      grp.add(label);
    }

    var state={ level:0,tLevel:0,builtLevel:-1,color:new THREE.Color(opts.color||COL.lysis),tColor:new THREE.Color(opts.color||COL.lysis),H:H,R:R,phase:Math.random()*6.28 };
    grp.userData.state=state; grp.userData.liq=liq; grp.userData.label=label;
    grp.userData.setLevel=function(v){ state.tLevel=clamp(v,0,1); };
    grp.userData.setColor=function(hex){ state.tColor.set(hex); };
    grp.userData.setLabel=function(t,s){ if(label) label.userData.update(t,s||"");
      if(grp.userData.gradMat){ grp.userData.gradMat.map.dispose(); grp.userData.gradMat.map=tubeGraphicTex(t); grp.userData.gradMat.needsUpdate=true; } };
    grp.userData.setCap=function(on){ if(grp.userData.cap) grp.userData.cap.visible=!!on; };
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
    return grp;
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
    vg.fillStyle="#9fb0ba"; vg.font="700 62px Menlo,monospace"; vg.textAlign="center";
    vg.fillText("3",64,58); vg.fillText("5",64,118); vg.fillText("0",64,178);
    var vTex=new THREE.CanvasTexture(vc); vTex.anisotropy=MAX_ANISO;
    var win=new THREE.Mesh(new THREE.PlaneGeometry(0.1,0.16), new THREE.MeshBasicMaterial({map:vTex,transparent:true}));
    win.position.set(0,1.05,0.162); win.rotation.x=-0.05; grp.add(win);

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
    fluid.position.y=-0.18; fluid.scale.y=0.0001; fluid.visible=false; grp.add(fluid);
    var drop = new THREE.Mesh(new THREE.SphereGeometry(0.03,16,12), fluidMat);
    drop.scale.set(1,1.3,1); drop.position.y=-0.9; drop.visible=false; grp.add(drop);

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
    brandG.fillStyle="#516873"; brandG.font="700 34px 'Helvetica Neue',Arial"; brandG.textAlign="center"; brandG.textBaseline="middle";
    brandG.fillText("P200",80,30);
    brandG.font="500 15px 'Helvetica Neue',Arial"; brandG.fillStyle="#41535d"; brandG.fillText("20 – 200 µL",80,56);
    var brandTex=new THREE.CanvasTexture(brandC); brandTex.anisotropy=MAX_ANISO;
    var brand=new THREE.Mesh(new THREE.PlaneGeometry(0.18,0.081),
      new THREE.MeshStandardMaterial({ map:brandTex, transparent:true, roughness:0.55, metalness:0, envMapIntensity:0.4 }));
    brand.position.set(0,0.77,0.156); brand.rotation.x=-0.02; grp.add(brand);

    // fine graduation printed on the translucent tip
    var tgC=document.createElement("canvas"); tgC.width=64; tgC.height=160; var tgG=tgC.getContext("2d");
    tgG.clearRect(0,0,64,160);
    tgG.strokeStyle="rgba(110,130,142,0.75)"; tgG.lineWidth=2.2; tgG.lineCap="round";
    for(var tgi=0;tgi<5;tgi++){ var yy=44+tgi*20; tgG.beginPath(); tgG.moveTo(8,yy); tgG.lineTo(tgi%2?24:34,yy); tgG.stroke(); }
    var tgTex=new THREE.CanvasTexture(tgC); tgTex.anisotropy=MAX_ANISO;
    var tgRing=new THREE.Mesh(new THREE.CylinderGeometry(0.056,0.041,0.34,20,1,true),
      new THREE.MeshBasicMaterial({ map:tgTex, transparent:true, depthWrite:false, side:THREE.DoubleSide }));
    tgRing.position.y=-0.34; grp.add(tgRing);

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
    return grp;
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
    var coll = new THREE.Mesh(new THREE.LatheGeometry(cp,48), clearMat);
    coll.castShadow=true; grp.add(coll);
    var collRim = new THREE.Mesh(new THREE.TorusGeometry(0.325,0.02,12,44), clearMat);
    collRim.rotation.x=Math.PI/2; collRim.position.y=1.0; grp.add(collRim);
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
    liq.visible=false; grp.add(liq);

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
    return grp;
  }

  /* ---------- anodized cold block ---------- */
  function buildColdBlock(){
    var grp = new THREE.Group();
    var alu   = matAnodized(0x30343b);                        // dark anthracite body (ThermoMixer C)
    var aluTop= matBrushed(0xb8bec6); aluTop.roughness=0.42;  // brushed-silver thermoblock top
    var chamfer = new THREE.Mesh(new THREE.BoxGeometry(2.46,0.12,1.86), matAnodized(0x24272d));
    chamfer.position.y=0.06; chamfer.castShadow=true; chamfer.receiveShadow=true; grp.add(chamfer);
    var base = new THREE.Mesh(new THREE.BoxGeometry(2.34,0.32,1.74), alu);
    base.position.y=0.28; base.castShadow=true; base.receiveShadow=true; grp.add(base);
    var topPlate = new THREE.Mesh(new THREE.BoxGeometry(2.38,0.06,1.78), aluTop);
    topPlate.position.y=0.45; grp.add(topPlate);
    // machined bevel frame around the top edge — catches the key light
    var bevelMat=matAnodized(0xc0cad4); bevelMat.roughness=0.34;
    var bevY=0.485;
    var bvA=new THREE.Mesh(new THREE.BoxGeometry(2.42,0.028,0.055), bevelMat); bvA.position.set(0,bevY,0.9); grp.add(bvA);
    var bvB=new THREE.Mesh(new THREE.BoxGeometry(2.42,0.028,0.055), bevelMat); bvB.position.set(0,bevY,-0.9); grp.add(bvB);
    var bvC=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.028,1.86), bevelMat); bvC.position.set(1.2,bevY,0); grp.add(bvC);
    var bvD=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.028,1.86), bevelMat); bvD.position.set(-1.2,bevY,0); grp.add(bvD);
    var fluteMat = matAnodized(0x2a2e35);
    for(var f=0;f<9;f++){
      var fl=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.3,10), fluteMat);
      fl.position.set(-1.0+f*0.25,0.28,0.9); grp.add(fl);
    }
    var wellRim = matAnodized(0x8b95a1);
    var boreMat = new THREE.MeshStandardMaterial({ color:0x1d232b, metalness:0.4, roughness:0.7, side:THREE.DoubleSide });
    for(var i=0;i<3;i++) for(var j=0;j<2;j++){
      var x=-0.7+i*0.7, z=-0.4+j*0.8;
      var bore = new THREE.Mesh(new THREE.CylinderGeometry(0.19,0.19,0.34,24,1,true), boreMat);
      bore.position.set(x,0.34,z); grp.add(bore);
      var boreBot = new THREE.Mesh(new THREE.CircleGeometry(0.19,24), boreMat);
      boreBot.rotation.x=-Math.PI/2; boreBot.position.set(x,0.18,z); grp.add(boreBot);
      var lip = new THREE.Mesh(new THREE.TorusGeometry(0.19,0.014,10,24), wellRim);
      lip.rotation.x=Math.PI/2; lip.position.set(x,0.48,z); grp.add(lip);
    }
    // (removed the scattered frost specks + ice cubes — they read as stray artefacts on the
    //  block, and make no sense for a room-temperature incubation step)
    // (blue status strip, cyan LED and teal touchscreen removed per user)

    var label = makeLabel("On ice","4 °C");
    label.position.set(0,1.5,0.6); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    return grp;
  }

  /* ---------- open ice bucket (cold storage — keep on ice / −80 °C) ---------- */
  function buildIceBucket(){
    var grp = new THREE.Group();
    // stainless-steel open tub (neutral realistic metal, clear-ish liner)
    var steel = matBrushed(0xc4cbd4); steel.roughness=0.4;
    var steelDk = matBrushed(0x929ba6);
    var wall = new THREE.Mesh(new THREE.CylinderGeometry(0.74,0.62,0.6,44,1,true), steel);
    wall.position.y=0.3; wall.castShadow=true; wall.receiveShadow=true; grp.add(wall);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.74,0.03,14,48), steelDk);
    rim.rotation.x=Math.PI/2; rim.position.y=0.6; grp.add(rim);
    var innerMat = new THREE.MeshStandardMaterial({ color:0x3f86bf, metalness:0.25, roughness:0.5, envMapIntensity:0.8, side:THREE.DoubleSide });
    var inner = new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.58,0.6,44,1,true), innerMat);
    inner.position.y=0.3; grp.add(inner);
    var floor = new THREE.Mesh(new THREE.CircleGeometry(0.58,44), innerMat);
    floor.rotation.x=-Math.PI/2; floor.position.y=0.02; grp.add(floor);
    // a bed of translucent ice cubes (leaves the centre clear for the tube)
    var iceMat=new THREE.MeshPhysicalMaterial({ color:0xd4e2ea, roughness:0.14,
      transparent:true, opacity:0.55, clearcoat:0.8, envMapIntensity:1.0, flatShading:true, depthWrite:false });
    for(var ic=0;ic<12;ic++){
      var a=Math.random()*Math.PI*2, rr=0.16+Math.random()*0.42;
      var cube=new THREE.Mesh(new THREE.IcosahedronGeometry(0.12+Math.random()*0.07,0), iceMat);
      cube.position.set(Math.cos(a)*rr, 0.4+Math.random()*0.14, Math.sin(a)*rr);
      cube.rotation.set(Math.random(),Math.random(),Math.random());
      cube.castShadow=true; grp.add(cube);
    }
    // faint frost rime on the outer wall
    var frostMat=new THREE.MeshStandardMaterial({ color:0xe1e9ef, roughness:0.9, envMapIntensity:0.4 });
    var frostGeo=new THREE.SphereGeometry(1,6,5);
    for(var fr=0;fr<22;fr++){
      var fm=new THREE.Mesh(frostGeo,frostMat);
      var fa=Math.random()*Math.PI*2, fy=0.08+Math.random()*0.48;
      fm.position.set(Math.cos(fa)*0.73, fy, Math.sin(fa)*0.73);
      var fs=0.01+Math.random()*0.02; fm.scale.set(fs,fs,fs); grp.add(fm);
    }
    var label = makeLabel("On ice","store −80 °C");
    label.position.set(0,1.45,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    return grp;
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
    var body = new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.3,0.5,56), shell);
    body.position.y=0.9; grp.add(body);
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
    var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95,0.85,0.12,44), rotorMat);
    disc.position.y=-0.02; rotor.add(disc);
    var nut = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.14,0.12,6), matBrushed(0x828d99));
    nut.position.y=0.2; rotor.add(nut);
    var slotMat = new THREE.MeshStandardMaterial({ color:0x252d37, metalness:0.5, roughness:0.5, envMapIntensity:0.6 });
    for(var k=0;k<8;k++){
      var a=k/8*Math.PI*2;
      var holder=new THREE.Group();
      var slot=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.09,0.62,20,1,true), slotMat); holder.add(slot);
      var slotBot=new THREE.Mesh(new THREE.SphereGeometry(0.09,16,10,0,Math.PI*2,Math.PI*0.5,Math.PI*0.5),slotMat);
      slotBot.position.y=-0.31; holder.add(slotBot);
      holder.position.set(Math.cos(a)*0.62,0.0,Math.sin(a)*0.62);
      // clean fixed-angle rotor: every slot tilts outward by the SAME angle around its tangential axis
      holder.quaternion.setFromAxisAngle(new THREE.Vector3(-Math.sin(a),0,Math.cos(a)), -0.40);
      rotor.add(holder);
    }
    // printed well numbers around the rotor face
    var numC=document.createElement("canvas"); numC.width=256; numC.height=256; var numG=numC.getContext("2d");
    numG.clearRect(0,0,256,256);
    numG.fillStyle="#c2c9d2"; numG.font="700 24px 'Helvetica Neue',Arial"; numG.textAlign="center"; numG.textBaseline="middle";
    for(var nn=0;nn<8;nn++){ var na=nn/8*Math.PI*2 - Math.PI/2, nx=128+Math.cos(na)*82, ny=128+Math.sin(na)*82;
      numG.fillText((nn+1)+"", nx, ny); }
    var numTex=new THREE.CanvasTexture(numC); numTex.anisotropy=MAX_ANISO;
    var numPlate=new THREE.Mesh(new THREE.CircleGeometry(0.82,44),
      new THREE.MeshBasicMaterial({ map:numTex, transparent:true, depthWrite:false }));
    numPlate.rotation.x=-Math.PI/2; numPlate.position.y=0.05; rotor.add(numPlate);
    grp.add(rotor);

    var rc=document.createElement("canvas"); rc.width=256; rc.height=128; var rg=rc.getContext("2d");
    var rTex=new THREE.CanvasTexture(rc); rTex.anisotropy=MAX_ANISO;
    function drawRPM(v){
      rg.fillStyle="#12161c"; rg.fillRect(0,0,256,128);
      rg.strokeStyle="rgba(90,100,116,0.4)"; rg.lineWidth=3; rg.strokeRect(6,6,244,116);
      rg.fillStyle="#8fcabf"; rg.font="700 52px Menlo,monospace"; rg.textAlign="right";
      rg.fillText(Math.round(v)+"", 200,72);
      rg.fillStyle="#727a85"; rg.font="600 20px 'Helvetica Neue',Arial"; rg.fillText("× g", 244,72);
      rg.textAlign="left"; rg.fillText("SPEED", 16,34);
      rTex.needsUpdate=true;
    }
    drawRPM(0);
    var readout=new THREE.Mesh(new THREE.PlaneGeometry(0.62,0.31), new THREE.MeshBasicMaterial({map:rTex,transparent:true}));
    readout.position.set(0,0.62,1.31); readout.rotation.x=-0.32; grp.add(readout);
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

    var st={ spin:0,tSpin:0,lid:0 };
    grp.userData.rotor=rotor; grp.userData.dome=dome; grp.userData.label=label; grp.userData.st=st;
    grp.userData.setSpin=function(v){ st.tSpin=v; };
    grp.userData.setLabel=function(t,s){ label.userData.update(t,s||""); };
    grp.userData.update=function(dt){
      st.spin=lerp(st.spin,st.tSpin,1-Math.pow(0.01,dt));
      rotor.rotation.y += st.spin*dt;
      var wantOpen = st.spin<1.2 ? 1 : 0;
      st.lid=lerp(st.lid,wantOpen,1-Math.pow(0.02,dt));
      lidPivot.rotation.x = -easeInOut(st.lid)*1.15;
      drawRPM(Math.min(st.spin,26)/26*13400);
    };
    return grp;
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
    return grp;
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
    screen.position.set(0.55,1.0,0.61); grp.add(screen);
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
    return grp;
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
    g.fillStyle="#8fcabf"; g.font="600 "+(18*S)+"px 'Helvetica Neue',Arial"; g.textAlign="left";
    g.fillText("A260/280  " + (1.8+0.2*clamp(prog,0,1)).toFixed(2), 28, 52);
    g.fillStyle="#aab2bc"; g.font="500 "+(15*S)+"px 'Helvetica Neue',Arial";
    g.fillText("A260/230  " + (1.6+0.5*clamp(prog,0,1)).toFixed(2), 28, 96);
    g.fillStyle="#727a85"; g.font="500 "+(12*S)+"px 'Helvetica Neue',Arial"; g.textAlign="right";
    g.fillText("260 nm", 600, 448);
  }

  /* ---------- eluate droplet ---------- */
  function buildDrop(color){
    var m = new THREE.MeshPhysicalMaterial({ color:color, roughness:0.14,
      transparent:false, emissive:color, emissiveIntensity:0.08, clearcoat:0.8, envMapIntensity:1.0 });
    var d = new THREE.Mesh(new THREE.SphereGeometry(0.07,22,18), m);
    d.scale.set(1,1.3,1); d.visible=false;
    return d;
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
    function cradle(y,rr){
      var arm=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.09,0.13), armMat);
      arm.position.set(-0.2,y,0); grp.add(arm);
      var ring=new THREE.Mesh(new THREE.TorusGeometry(rr,0.035,14,32), armMat);
      ring.position.set(0.0,y,0); ring.rotation.x=Math.PI/2; grp.add(ring);
    }
    cradle(2.55,0.19); cradle(1.75,0.17);
    return grp;
  }

  /* ---------- reagent bottle (dressing) ---------- */
  function buildBottle(col, labelText, h, capColor){
    var grp=new THREE.Group(); h=h||1.3;
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
    grp.add(liq);
    var cap=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.22,28), matPlastic(capColor==null?0x2b7f74:capColor));
    cap.position.y=h+0.11; grp.add(cap);
    // coloured neck ring under the cap — reads as a reagent-coded seal
    var capRing=new THREE.Mesh(new THREE.TorusGeometry(0.155,0.022,12,32), matPlastic(capColor==null?0x2b7f74:capColor));
    capRing.rotation.x=Math.PI/2; capRing.position.y=h; grp.add(capRing);
    var lc=document.createElement("canvas"); lc.width=256; lc.height=128; var lg=lc.getContext("2d");
    lg.fillStyle="#eef1f4"; lg.fillRect(0,0,256,128);
    lg.fillStyle="#252c34"; lg.font="700 30px 'Helvetica Neue',Arial"; lg.textAlign="center";
    lg.fillText(labelText||"", 128,58);
    lg.strokeStyle="rgba(120,130,146,0.4)"; lg.lineWidth=2; lg.strokeRect(10,74,236,40);
    var lTex=new THREE.CanvasTexture(lc); lTex.anisotropy=MAX_ANISO;
    var band=new THREE.Mesh(new THREE.CylinderGeometry(0.365,0.365,h*0.42,40,1,true),
      new THREE.MeshStandardMaterial({map:lTex,roughness:0.75,metalness:0,envMapIntensity:0.25}));
    band.position.y=h*0.4; grp.add(band);
    return grp;
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
    g.fillStyle="rgba(150,164,180,0.5)"; g.font="300 74px 'Helvetica Neue',Arial"; g.textAlign="left"; g.textBaseline="middle";
    g.fillText(("0"+n).slice(-2), 12, 70);
    g.strokeStyle="rgba(95,179,166,0.55)"; g.lineWidth=4; g.beginPath(); g.moveTo(14,104); g.lineTo(150,104); g.stroke();
    var t=new THREE.CanvasTexture(c); t.anisotropy=MAX_ANISO;
    var m=new THREE.Mesh(new THREE.PlaneGeometry(1.7,0.85), new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));
    m.rotation.x=-Math.PI/2; return m;
  }

  function buildEnvMap(mode){
    var iso = (mode==="isometric");
    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileCubemapShader();
    var es = new THREE.Scene();
    var domeGeo = new THREE.SphereGeometry(50,32,20);
    var col = new Float32Array(domeGeo.attributes.position.count*3);
    var top = new THREE.Color(iso?0x5f6d90:0x8d929a), bot = new THREE.Color(iso?0x2b3348:0x474b51);
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
    if(iso){
      // softboxes → crisp key highlight, darker fills so matte "clay" props keep contrast
      panel(9,14,7, 22,10, 0xffffff, 1.7);
      panel(-13,8,-8, 16,14, 0x9fb0cf, 0.7);
      panel(-6,3,10, 12,7, 0x8f9fc0, 0.45);
      panel(0,20,0, 24,24, 0x525c78, 0.4);
    } else {
      // Neutral STUDIO: ONE bright key softbox for highlights + form, DARK fills all around so
      // materials keep contrast and true colour instead of being flooded to pale by a near-white
      // environment. This is the real fix for the washed-out, low-contrast look.
      panel(9,14,7, 22,10, 0xffffff, 1.5);       // key softbox (highlights)
      panel(-13,8,-8, 16,14, 0x9198a1, 0.42);    // dim neutral fill
      panel(-6,3,10, 12,7, 0x878d96, 0.32);      // dim front fill
      panel(0,20,0, 24,24, 0x676c74, 0.38);      // dim overhead
    }
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
  function makeCineBackdrop(){
    var w=640,h=640;
    var c=document.createElement("canvas"); c.width=w; c.height=h; var g=c.getContext("2d");
    // COMFORTABLE WARM MID-TONE room — NOT a white void, NOT dark. A soft warm greige wall
    // grading down to a deeper warm-grey floor, with a lit pool behind the subject and a
    // gentle corner vignette so it has depth and is pleasant to look at.
    var grad=g.createLinearGradient(0,0,0,h);
    grad.addColorStop(0.00,"#b9b4ab");   // upper wall — warm light greige
    grad.addColorStop(0.42,"#ada89f");
    grad.addColorStop(0.585,"#9d978d");  // just above the horizon
    grad.addColorStop(0.615,"#918b81");  // horizon seam
    grad.addColorStop(0.80,"#827d74");   // warm-grey floor
    grad.addColorStop(1.00,"#6f6a61");
    g.fillStyle=grad; g.fillRect(0,0,w,h);
    // soft pool of light behind the subject — the centre lifts, so the bright subject reads
    var soft=g.createRadialGradient(w*0.5,h*0.34,20, w*0.5,h*0.40,w*0.80);
    soft.addColorStop(0,"rgba(244,238,228,0.30)");
    soft.addColorStop(1,"rgba(244,238,228,0)");
    g.fillStyle=soft; g.fillRect(0,0,w,h);
    // corner vignette for depth (settles the edges without going dark/sci-fi)
    var vig=g.createRadialGradient(w*0.5,h*0.46,w*0.30, w*0.5,h*0.5,w*0.75);
    vig.addColorStop(0,"rgba(42,38,33,0)");
    vig.addColorStop(1,"rgba(42,38,33,0.34)");
    g.fillStyle=vig; g.fillRect(0,0,w,h);
    var t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
  }

  // the demo's bench floor (buildLine): a light warm-grey resin with a canvas
  // grain/speckle texture — the LIVE cinematic material values baked in
  // (applyViewMode: color 0xcbc6bd, metalness 0.12, roughness 0.5, env 0.62).
  function buildFloor(){
    var bc=document.createElement("canvas"); bc.width=512; bc.height=512; var bg2=bc.getContext("2d");
    bg2.fillStyle="#cbc6bd"; bg2.fillRect(0,0,512,512);
    for(var sx=0;sx<520;sx+=2){ bg2.strokeStyle="rgba(120,116,108,"+(0.008+Math.random()*0.012)+")";
      bg2.lineWidth=1; bg2.beginPath(); bg2.moveTo(sx,0); bg2.lineTo(sx+(Math.random()*6-3),512); bg2.stroke(); }
    for(var sp=0;sp<1200;sp++){ bg2.fillStyle="rgba("+(Math.random()<0.5?"255,253,248,":"150,144,134,")+(Math.random()*0.05)+")";
      bg2.fillRect(Math.random()*512,Math.random()*512,1.6,1.6); }
    var benchTex=new THREE.CanvasTexture(bc); benchTex.colorSpace=THREE.SRGBColorSpace;
    benchTex.wrapS=benchTex.wrapT=THREE.RepeatWrapping; benchTex.repeat.set(30,6); benchTex.anisotropy=MAX_ANISO;
    var floorMat=new THREE.MeshStandardMaterial({ color:0xcbc6bd, map:benchTex, metalness:0.12, roughness:0.5, envMapIntensity:0.62 });
    var floor=new THREE.Mesh(new THREE.PlaneGeometry(140,60), floorMat);
    floor.rotation.x=-Math.PI/2; floor.receiveShadow=true;
    return floor;
  }

export {
  buildFloor,
  COL, COL_CINE, COL_ISO, LOOK, SPACING, BLOCK_TOP,
  buildSharedMaps, makeLabel, stationDecal,
  buildTube, buildPipette, buildPipetteStand, buildBottle, buildSpinColumn,
  buildCentrifuge, buildColdBlock, buildIceBucket, buildNanoDrop, buildDrop, buildWaste,
  buildEnvMap, makeCineBackdrop, makeGradientTexture,
  glassMaterial, matPlastic, matBrushed, matAnodized, matPainted, matFrosted, matRubber, matSilicone,
}

// ─── station choreography (lifted verbatim from the demo's scene scope) ───
  function pipetteRun(st, from, to, p, opts){
    opts=opts||{};
    var pip=st.pip; if(!pip) return;
    var phaseA=0.30, phaseB=0.62, hover=2.5;
    var pos=new THREE.Vector3();
    if(p<phaseA){
      var q=easeInOut(p/phaseA);
      pos.set(from.x, lerp(hover, from.y+1.1, q), from.z);
      pip.userData.setFluid(q*(opts.fill||0.8)); pip.userData.setColor(opts.color||COL.lysis);
    } else if(p<phaseB){
      var q2=easeInOut((p-phaseA)/(phaseB-phaseA));
      pos.set(lerp(from.x,to.x,q2), 0, lerp(from.z,to.z,q2));
      pos.y = lerp(from.y+1.1, to.y+1.2, q2) + Math.sin(q2*Math.PI)*0.5 + 1.0;
      pip.userData.setFluid(opts.fill||0.8);
    } else {
      var q3=easeInOut((p-phaseB)/(1-phaseB));
      pos.set(to.x, lerp(to.y+2.2, to.y+1.25, q3), to.z);
      pip.userData.setFluid((1-q3)*(opts.fill||0.8));
    }
    pip.position.copy(pos);                 // LOCAL — resident pipette stays at its station
  }

  // shared local layout anchors (per-station, in the station's local space)
  var PIP_STAND = {x:-2.1, y:0, z:1.25};
  var PIP_REST  = new THREE.Vector3(-2.1, 1.2, 1.25);

  // a bare stand (dressing) — for stations that don't pipette
  function addStand(st){
    var stand = buildPipetteStand(); stand.position.set(PIP_STAND.x,PIP_STAND.y,PIP_STAND.z); st.group.add(stand);
  }
  // resident equipment: a stand AND its OWN pipette, both fixed to this station
  function addPipetteRig(st){
    addStand(st);
    var pip = buildPipette(); pip.position.set(PIP_REST.x, PIP_REST.y, PIP_REST.z);
    st.group.add(pip); st.pip = pip; st.updatables.push(pip);
  }
  // dock this station's resident pipette back in its stand (LOCAL space)
  function pipRest(st){ if(!st.pip) return;
    st.pip.position.set(PIP_REST.x, PIP_REST.y, PIP_REST.z);
    st.pip.userData.setFluid(0); }

  function buildSample(){
    var tube   = buildTube({height:1.7, radius:0.32, color:COL.pellet, label:"Neutrophil pellet", sub:"", cold:true, capColor:0x3f7fd0});
    var column = buildSpinColumn();
    var elu    = buildTube({height:1.15, radius:0.26, color:COL.rna, label:"Eluate", sub:"RNA", capColor:0x49b26a});
    var vessels=[tube,column,elu];
    for(var v=0;v<vessels.length;v++){
      vessels[v].visible=false; vessels[v].userData.tPos=vessels[v].position.clone(); scene.add(vessels[v]);
    }
    var S={ tube:tube, column:column, elu:elu, vessels:vessels, active:tube };
    // show exactly one vessel (hand-off timelines may reveal a second mid-station)
    S.only=function(name){
      tube.visible=(name==='tube'); column.visible=(name==='column'); elu.visible=(name==='elu');
      S.active=(name==='tube'?tube:(name==='column'?column:elu));
    };
    // set a vessel's travel target; snap instantly on non-sequential jumps, glide otherwise
    S.at=function(vessel,x,y,z){ vessel.userData.tPos.set(x,y,z); if(SNAP_SAMPLE) vessel.position.set(x,y,z); };
    S.snapTo=function(vessel,x,y,z){ vessel.userData.tPos.set(x,y,z); vessel.position.set(x,y,z); };
    return S;
  }

  function addBottle(st, key, labelText, color, x, z){
    var b = buildBottle(color, labelText, 1.3, color);
    b.position.set(x, 0, z); st.group.add(b);
    st.reagents[key] = { grp:b, pos:new THREE.Vector3(x, 0.24, z) };
  }
  function stationReagent(st, Y, o){
    addPipetteRig(st);
    addBottle(st, o.key, o.blabel, o.color, 2.0, 0.7);
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
      pipetteRun(st, st.reagents[o.key].pos, {x:0,y:Y,z:0}, p, {color:o.color, fill:0.8});
      if(p>0.62){ var q=easeInOut((p-0.62)/0.38);
        v.userData.setLevel(lerp(o.lStart,o.lEnd,q));
        if(o.cEnd!=null) v.userData.setColor(o.cEnd);
      }
    };
  }
  function stationSpin(st, Y, o){
    var cen=buildCentrifuge(); cen.position.set(1.4,0,-0.5); cen.scale.setScalar(0.85);
    st.group.add(cen); st.updatables.push(cen); st.cen=cen;
    // (black riser plate removed — the sample rests on the bench, not a pedestal)
    st.enter=function(){
      SAMPLE.only(o.vessel);
      var v=SAMPLE[o.vessel];
      if(o.vlabel) v.userData.setLabel(o.vlabel, o.vsub||"");
      if(o.color!=null) v.userData.setColor(o.color);
      v.userData.setLevel(o.lStart==null?0.5:o.lStart);
      SAMPLE.at(v, st.x-1.5, 0, 1.4);   // on the bench (plate riser removed)
      cen.userData.setLabel(o.cenLabel||"Centrifuge", o.cenSub||""); cen.userData.setSpin(0);
    };
    if(o.seconds) st.hud={label:o.hudLabel||"Centrifuge", seconds:o.seconds};
    st.timeline=function(p){
      cen.userData.setSpin(p<0.08?0:(p>0.9?2:24));
      var v=SAMPLE[o.vessel];
      if(o.lEnd!=null) v.userData.setLevel(lerp(o.lStart==null?0.5:o.lStart, o.lEnd, easeInOut(clamp(p,0,1))));
    };
  }

export { pipetteRun, addStand, addPipetteRig, pipRest, buildSample, addBottle, stationReagent, stationSpin, PIP_STAND, PIP_REST, easeInOut, lerp, clamp }
