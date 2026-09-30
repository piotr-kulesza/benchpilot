// materials.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the shared procedural PBR maps and the material library. Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from './rng.js'
import * as THREE from 'three'
import { COL } from './palette.js'
import { MAX_ANISO, clamp } from './util.js'


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

// per-builder seeded random streams (rng.js) — the same names as before the split
makeBrushedNormal = streams.wrap('makeBrushedNormal', makeBrushedNormal)
makeBrushedRough = streams.wrap('makeBrushedRough', makeBrushedRough)
makePlasticRough = streams.wrap('makePlasticRough', makePlasticRough)
makeKnurlNormal = streams.wrap('makeKnurlNormal', makeKnurlNormal)
buildSharedMaps = streams.wrap('buildSharedMaps', buildSharedMaps)

export { TEX, _cv, _finish, makeBrushedNormal, makeBrushedRough, makePlasticRough, makeKnurlNormal, buildSharedMaps, fresnelize, glassMaterial, matFrosted, matPlastic, matRubber, matSilicone, matAnodized, matBrushed, matPainted }
