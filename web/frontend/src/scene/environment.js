// environment.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the renderer hook, env map, backdrop and bench floor. Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from './rng.js'
import * as THREE from 'three'
import { resolveScenePreset } from './scenePresets.js'
import { MAX_ANISO } from './util.js'


// A sample leaving a docked instrument rises straight up to its OWN exit height (set when
// it docks: the host's top + the vessel's height + the lift clearance) before it glides on.

let renderer = null
export function setRenderer(r) { renderer = r }

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

// per-builder seeded random streams (rng.js) — the same names as before the split
buildBackdrop = streams.wrap('buildBackdrop', buildBackdrop)
buildEnvMap = streams.wrap('buildEnvMap', buildEnvMap)
makeGradientTexture = streams.wrap('makeGradientTexture', makeGradientTexture)
makeCineBackdrop = streams.wrap('makeCineBackdrop', makeCineBackdrop)
buildFloor = streams.wrap('buildFloor', buildFloor)

export { renderer, buildBackdrop, buildEnvMap, makeGradientTexture, makeCineBackdrop, buildFloor }
