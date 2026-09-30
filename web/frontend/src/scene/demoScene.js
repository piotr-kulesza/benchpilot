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
import { streams } from './rng.js'
import * as THREE from 'three'
import { resolveScenePreset } from './scenePresets.js'
import { exitLiftPoint } from '../vessel/sceneRecipe.js'
import { solidBox } from './solids.js'
import { dims, clearance } from './dims.js'
import { addSocket, placeInto, placeOnBench, clearPlacement, getSocket, socketPose, canPlace } from './sockets.js'
import { buildCentrifuge } from './instruments/motion.js'
import { makeLabel } from './labels.js'
import { matPainted, matPlastic, matRubber } from './materials.js'
import { declareCutaway, fitArt, fx, openTopBox, tagSpec } from './modelKit.js'
import { COL } from './palette.js'
import { buildBottle, buildPipette } from './props.js'
import { MAX_ANISO, clamp, easeInOut, lerp } from './util.js'
import { buildAgarPlate, buildCryovial, buildDish, buildFlask, buildGelSlab, buildMembrane, buildSlide, buildSpinColumn, buildTube, buildWellPlate } from './vessels.js'
export * from './palette.js'
export * from './util.js'
export * from './materials.js'
export * from './labels.js'
export * from './liquid.js'
export * from './modelKit.js'
export * from './vessels.js'
export * from './props.js'
export * from './instruments/thermal.js'
export * from './instruments/motion.js'
export * from './instruments/readers.js'


// A sample leaving a docked instrument rises straight up to its OWN exit height (set when
// it docks: the host's top + the vessel's height + the lift clearance) before it glides on.

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
export function getSnap() { return SNAP_SAMPLE }
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
        const lp = exitLiftPoint(v.position, v.userData.exitY != null ? v.userData.exitY : v.position.y)
        v.userData.exitLift = (v.userData.exitLift || new THREE.Vector3()).set(lp.x, lp.y, lp.z)
      } else {
        v.userData.exitLift = null
      }
    } else {
      v.userData.exitLift = null
    }
  }
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
    var rims=[];
    tank.position.y=0.55; tank.castShadow=true; grp.add(tank);
    var frameMat = matPlastic(0x2b3038);
    // base + top rim frames so the tank reads as a solid moulded vessel, not a haze
    var tbase = new THREE.Mesh(new THREE.BoxGeometry(2.66,0.1,1.66), frameMat); tbase.position.y=0.24; grp.add(tbase);
    // the top RIM is a frame of four rails (a full 2.66x1.66 slab here capped the tank and
    // hid anything inside it)
    [[2.66,0.08,0.08, 0,0.86, 0.79],[2.66,0.08,0.08, 0,0.86,-0.79],
     [0.08,0.08,1.66, 1.29,0.86,0],[0.08,0.08,1.66,-1.29,0.86,0]].forEach(function(r){
      var m=new THREE.Mesh(new THREE.BoxGeometry(r[0],r[1],r[2]), frameMat); m.position.set(r[3],r[4],r[5]); grp.add(m); rims.push(m); });
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
    declareCutaway(tankRoot, rims.concat([tbase]));   // the moulded rim frame + base frame
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
    root.userData.setCutaway=tankRoot.userData.setCutaway;
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

// PER-BUILDER RANDOM STREAMS (rng.js): every builder draws from its own seeded stream,
// so one builder taking more random values can no longer move the ice cubes, bubbles or
// cells another builder places. Rebinding the declarations keeps every internal call and
// every live export on the wrapped version.


// ─── station choreography (lifted verbatim from the demo's scene scope) ───
  // The window in which pipetteRun's tip is IN the destination and dispensing (both the
  // straight and the angled path hold at depth from ~0.68 to ~0.87 of the timeline). A
  // receiving vessel fills only inside it — never before the tip arrives.
  var DISPENSE_FROM=0.68, DISPENSE_TO=0.87;
  function dispenseProgress(p){ return easeInOut(clamp((p-DISPENSE_FROM)/(DISPENSE_TO-DISPENSE_FROM),0,1)); }
  // Where the tip cruises: clear of the tallest thing on this station's bench (the pipette
  // and its stand excluded), plus the lift clearance. Measured, never a typed altitude.
  function cruiseY(st, from, to){
    var top=Math.max(from.y, to.y);
    st.group.children.forEach(function(c){ if(c===st.pip||c===st.stand||c.isLight||c.isSprite||c.userData.fx) return;
      var b=solidBox(c, st.group); if(!b.isEmpty()) top=Math.max(top,b.max.y); });
    var S=getSample(); if(S) S.vessels.forEach(function(v){ if(v.visible && v.parent===scene){ var b=solidBox(v); if(!b.isEmpty()) top=Math.max(top,b.max.y); } });
    return top+clearance('lift');
  }
  // THE PIPETTE RUN (world units, origin = the tip). From its stand: lift off the cradle,
  // out of its open front, up to the cruise height; over the SOURCE and down into its
  // liquid (`from` = the tip's draw point) to aspirate; back up; cruise level to over the
  // destination; down to `dipDepth` (straight) or in along a canted neck (angled);
  // dispense; withdraw. The source's cap must be off from 0.03 (the tip goes in at 0.16).
  function pipetteRun(st, from, to, p, opts){
    opts=opts||{};
    var pip=st.pip; if(!pip) return;
    var rest=opts.start||restPoint(st);
    var lift=clearance('lift');
    var CRUISE=cruiseY(st, from, to);
    var draw=0.26, travel=0.50;
    var angled=opts.approach==='angled';
    var TILT=0, ax=0, ay=1, dTop=0;
    if(angled){
      TILT=opts.tilt!=null?opts.tilt:-0.62;            // the neck's cant (from the vessel)
      ax=Math.sin(-TILT); ay=Math.cos(-TILT);          // neck axis: up-and-out of the mouth
      dTop=opts.standoff!=null?opts.standoff:(opts.depth||0);
    }
    // the tip on the destination: where it dispenses
    function tipAt(x,y,z,rot){ pip.position.set(x,y,z); pip.rotation.set(0,0,rot||0); }
    var fill=opts.fill||0.8;
    if(p<draw){                                    // A · (in hand) over the source → aspirate
      var q=p/draw;
      pip.userData.setColor(opts.color||COL.lysis);
      if(q<0.34){ var a=easeInOut(q/0.34); tipAt(rest.x, lerp(rest.y,CRUISE,a), rest.z); pip.userData.setFluid(0); }          // up to the cruise height
      else if(q<0.52){ var e=easeInOut((q-0.34)/0.18); tipAt(lerp(rest.x,from.x,e), CRUISE, lerp(rest.z,from.z,e)); pip.userData.setFluid(0); } // over the source
      else { var f=(q-0.52)/0.48, s=f<0.4?easeInOut(f/0.4):f<0.6?1:easeInOut(1-(f-0.6)/0.4);
        tipAt(from.x, lerp(CRUISE, from.y, s), from.z);                               // down in, draw, up
        pip.userData.setFluid(clamp((f-0.3)/0.3,0,1)*fill); }
      return;
    }
    if(p<travel){                                  // B · cruise level, above everything, to over the destination
      var qb=easeInOut((p-draw)/(travel-draw));
      var tx=angled?to.x+ax*dTop:to.x, tz=to.z;
      tipAt(lerp(from.x,tx,qb), CRUISE, lerp(from.z,tz,qb));
      pip.userData.setFluid(fill);
      return;
    }
    var q3=(p-travel)/(1-travel);
    // down (0-0.35), HOLD while dispensing (0.35-0.7), back up (0.7-1): the drop leaves
    // only while the tip is inside the vessel
    var sd=q3<0.35?easeInOut(q3/0.35):q3<0.7?1:easeInOut(1-(q3-0.7)/0.3);
    pip.userData.setFluid((1-clamp((q3-0.35)/0.35,0,1))*fill);
    if(angled){
      // straight down to the standoff just out of the mouth while tilting to the cant,
      // then in ALONG the neck axis to the medium
      var sy=to.y+ay*dTop, sx=to.x+ax*dTop, depth=opts.depth||0;
      if(sd<0.4){ var k=sd/0.4; tipAt(sx, lerp(CRUISE,sy,k), to.z, TILT*k); }
      else { var d=lerp(dTop,-depth,(sd-0.4)/0.6); tipAt(to.x+ax*d, to.y+ay*d, to.z, TILT); }
    } else {
      var DIP_Y=to.y+(opts.dipDepth!=null?opts.dipDepth:0);
      tipAt(to.x, lerp(CRUISE,DIP_Y,sd), to.z);
    }
  }

  // ── BENCH LAYOUT: nothing on a station's bench is placed by typed coordinates. The
  // SUBJECT (the sample, or the instrument it goes in) stands at the origin; every other
  // item goes to its LEFT or RIGHT, one bench_gap clear of everything already there,
  // centred on the same row (z = 0). st.subjectFoot = the sample's half-extents.
  function benchExtents(st, skip){
    var f=st.subjectFoot||{hw:0}, e={minX:-f.hw, maxX:f.hw};
    st.group.children.forEach(function(c){
      if(c===skip||c===st.pip||c.isLight||c.isSprite||c.userData.offBench) return;
      var b=solidBox(c, st.group); if(b.isEmpty()) return;
      e.minX=Math.min(e.minX,b.min.x); e.maxX=Math.max(e.maxX,b.max.x);
    });
    (st.benchReserved||[]).forEach(function(r){ e.minX=Math.min(e.minX,r.minX); e.maxX=Math.max(e.maxX,r.maxX); });
    return e;
  }
  // put obj on the bench beside everything (side −1 left, +1 right); returns obj
  function benchPlace(st, obj, side){
    if(obj.parent!==st.group) st.group.add(obj);
    obj.position.set(0,0,0); obj.updateMatrixWorld(true);
    var b=solidBox(obj, obj), e=benchExtents(st, obj), gap=clearance('bench_gap');
    var x=side<0 ? e.minX-gap-b.max.x : e.maxX+gap-b.min.x;
    obj.position.set(x, 0, -(b.min.z+b.max.z)/2);
    placeOnBench(obj);
    return obj;
  }
  // reserve a bench slot for something that is not a station prop (the travelling sample
  // parked beside the subject); returns the slot's centre x
  function benchSlot(st, halfW, side){
    var e=benchExtents(st), gap=clearance('bench_gap');
    var x=side<0 ? e.minX-gap-halfW : e.maxX+gap+halfW;
    (st.benchReserved||(st.benchReserved=[])).push({ minX:x-halfW, maxX:x+halfW });
    return x;
  }

  // STAGE ONLY WHAT THE STEP USES: the pipette is HELD (no stand — an empty stand read as
  // an unused rack taking a quarter of the frame). Its resting pose is in hand, poised
  // above the first source it will draw from (or above the subject's mouth).
  function addPipetteRig(st){
    var pip = buildPipette();
    pip.userData.noFrame = true;    // the pipette travels high on its arc — never frame it
    pip.userData.offBench = true;   // it is held, not on the bench
    st.group.add(pip); st.pip = pip; st.updatables.push(pip);
    pipRest(st);
  }
  function restPoint(st){
    var first=null; for(var k in st.reagents){ first=st.reagents[k]; break; }
    var from=st.drawFrom ? st.drawFrom : first ? first.pos : new THREE.Vector3(0, st.subjectH||0, 0);
    return new THREE.Vector3(from.x, cruiseY(st, from, from), from.z);
  }
  function pipRest(st){ if(!st.pip) return;
    st.pip.position.copy(restPoint(st)); st.pip.rotation.set(0,0,0);
    st.pip.userData.setFluid(0); }

  // ── the BACK ROW: the sources a step draws from stand in a compact grid BEHIND the
  // subject (≤ 3 per row, bench_gap apart, rows stepping back), so the frame that holds
  // the subject holds them whole — never a bottle cut off at the frame edge.
  function backRowPlace(st, obj){
    if(obj.parent!==st.group) st.group.add(obj);
    placeOnBench(obj); obj.userData.used=true;
    (st.backRow||(st.backRow=[])).push(obj);
    layoutBackRow(st);
    return obj;
  }
  function layoutBackRow(st){
    var gap=clearance('bench_gap'), PER=3, row=st.backRow||[];
    var boxes=row.map(function(o){ o.position.set(0,0,0); o.updateMatrixWorld(true); return solidBox(o,o); });
    var z=-((st.subjectFoot&&st.subjectFoot.hd)||0)-gap;
    for(var r=0;r*PER<row.length;r++){
      var items=row.slice(r*PER,r*PER+PER), bx=boxes.slice(r*PER,r*PER+PER);
      var total=bx.reduce(function(n,b){ return n+(b.max.x-b.min.x); },0)+gap*(items.length-1);
      var depth=Math.max.apply(null,bx.map(function(b){ return b.max.z-b.min.z; }));
      var capRoom=Math.max.apply(null,items.map(function(o){ return o.userData.capRoom||0; }));
      var x=-total/2;
      items.forEach(function(o,k){ var b=bx[k];
        o.position.set(x-b.min.x, 0, z-depth/2-(b.min.z+b.max.z)/2); x+=(b.max.x-b.min.x)+gap; });
      z-=depth+gap+capRoom;                 // an opened cap is set down BEHIND its bottle
    }
  }
  // a MICROLITRE draw is taken from a 1.5 mL tube aliquot (enzymes, primers, template, a
  // per-sample buffer volume); a mL-scale reagent from a 250 mL bottle. The stated unit
  // decides (µl / µL / ul → tube).
  function smallVolume(vol){ return /[µu]l\b/i.test(String(vol||'')); }
  function buildStainingTray(){
    var grp=new THREE.Group();
    var tray=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.24,1.3), matPlastic(0x394049));
    tray.position.y=0.12; tray.castShadow=true; tray.receiveShadow=true; grp.add(tray);
    var well=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.001,1.1), new THREE.MeshStandardMaterial({ color:0x20262d, roughness:0.8, side:THREE.DoubleSide }));
    well.position.y=0.2405; fx(well,'decal'); grp.add(well);        // the dark drip well, printed on the tray top
    var label=makeLabel("Staining tray",""); label.position.set(0,0.9,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    var D=dims('staining_tray'), SL=dims('slide_iso8037');
    var root=fitArt(grp,'staining_tray',{ size:{ height:D.tray_height } });
    // two RAILS the slide BRIDGES, lengthwise: spaced inside the slide's REAL length so it
    // rests on both (they stood 80 mm apart under a 76 mm slide that lay along them)
    var RH=D.rail_height, RW=RH*0.4, SPAN=SL.width*0.6;
    for(var s=0;s<2;s++){ var rail=new THREE.Mesh(new THREE.BoxGeometry(D.width*0.9,RH,RW), matPlastic(0x596270));
      rail.position.set(0,D.tray_height+RH/2,(s?1:-1)*SPAN/2); root.add(rail); }
    // the slide lies ACROSS the rails: its length along z (socket turned 90° about y)
    addSocket(root,'rails',{ position:new THREE.Vector3(0,D.tray_height+RH,0), quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2) });
    root.userData.sampleSocket='rails';
    return tagSpec(root,'staining_tray');
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

  // a reagent bottle on the bench to the RIGHT of everything; its tip draw point is in
  // its liquid (from the bottle's own geometry)
  // a reagent SOURCE in the back row: a bottle, or a 1.5 mL tube for a µl-scale reagent
  // (vol). Its draw point is in its liquid, from the source's own geometry — a getter,
  // since the back row re-lays out as sources are added.
  function addBottle(st, key, labelText, color, vol){
    var b;
    if(smallVolume(vol)){
      b = buildTube({ color:color, label:false });   // no world-size plate: the step's title names it
      b.userData.setColor(color); b.userData.setLevel(0.55);
      b.userData.draw=new THREE.Vector3(0, b.userData.entry, 0);
    } else {
      b = buildBottle(color, labelText, 0, color);
      b.userData.capRoom=dims('bottle_250').neck_diameter+clearance('bench_gap');
    }
    b.userData.reagentName=labelText||'';          // what it holds — a title naming it stands over it
    backRowPlace(st, b);
    if(b.userData.update) st.updatables.push(b);   // animate its cap + level each frame
    st.reagents[key] = { grp:b, get pos(){ return b.position.clone().add(b.userData.draw); } };
    return b;
  }
  function stationReagent(st, Y, o){
    addPipetteRig(st);
    addBottle(st, o.key, o.rname||o.blabel, o.color, o.vol||o.vsub);
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
      SAMPLE.at(v, st.x, Y, 0); v.quaternion.identity(); v.userData.held=false; placeOnBench(v);
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
        {color:o.color, fill:0.8, approach:disp.approach, tilt:disp.tilt, depth:disp.depth, standoff:disp.standoff, dipDepth:o.entry});
      if(p>DISPENSE_FROM){ var q=dispenseProgress(p);
        v.userData.setLevel(lerp(o.lStart,o.lEnd,q));
        if(o.cEnd!=null) v.userData.setColor(o.cEnd);
      }
    };
  }
  // A vessel IN HAND is not resting on anything (the geometry audit's contact check)
  function held(v, on){ v.userData.held=!!on; }
  function stationSpin(st, Y, o){
    // the CENTRIFUGE is the subject, on the bench at the origin. The sample is placed INTO
    // a rotor slot (socket) — tilted to the rotor's real fixed angle, riding the rotor as it
    // spins — never scaled down to fit a slot it does not fit (the old SEAT_SCALE 0.6).
    var cen=buildCentrifuge();
    st.group.add(cen); placeOnBench(cen); st.updatables.push(cen); st.cen=cen;
    var SOCK=cen.userData.sampleSocket, v0=SAMPLE[o.vessel];
    var fits=canPlace(v0, cen, SOCK);
    if(!fits) (st.socketErrors||(st.socketErrors=[])).push({ vessel:v0.userData.spec, host:'microcentrifuge', socket:SOCK });
    if(fits) cen.userData.setCutaway&&cen.userData.setCutaway(true);   // CUTAWAY: the tube is seen in its slot
    var VH=dims(v0.userData.spec).height, LIFT=clearance('lift');
    var CEN_TOP=dims('microcentrifuge').height;
    // the sample waits on the bench beside the centrifuge (a rejected one stays there)
    var BENCH=new THREE.Vector3(benchSlot(st, dims(v0.userData.spec).width/2, +1),0,0);
    var docked=false;
    // the slot's CURRENT pose (the rotor stops wherever it stops) and the approach points
    function slotPose(){ cen.updateMatrixWorld(true); return socketPose(getSocket(cen,SOCK), st.group); }
    function pathFor(pose){
      var axis=new THREE.Vector3(0,1,0).applyQuaternion(pose.quaternion);
      var pre=pose.position.clone().addScaledVector(axis, VH+LIFT);                 // above the slot, along its axis
      var above=new THREE.Vector3(pre.x, Math.max(pre.y, CEN_TOP+LIFT), pre.z);  // over it, upright: its base clears the body
      return { pre:pre, above:above, seat:pose.position, q:pose.quaternion };
    }
    var P=pathFor(slotPose());
    function put(v, pnt, q){ SAMPLE.at(v, st.x+pnt.x, pnt.y, pnt.z); if(q) v.quaternion.copy(q); else v.quaternion.identity(); }
    function dock(){
      if(docked||!fits) return;
      var v=SAMPLE[o.vessel];
      placeInto(v, cen, SOCK, { ride:true });   // reparented INTO the slot — rides the rotor
      v.userData.docked=true; docked=true; held(v,false);
      v.userData.exitY=CEN_TOP+VH+LIFT;
    }
    function undock(){
      if(!docked) return;
      var v=SAMPLE[o.vessel];
      scene.attach(v); v.scale.setScalar(1); clearPlacement(v);
      v.userData.docked=false; docked=false;
      P=pathFor(slotPose());                      // leave the slot where the rotor stopped
    }
    function restState(v){ undock(); v.scale.setScalar(1); cen.userData.setSpin(0); cen.userData.setLid(true);
      held(v,false); put(v, BENCH); placeOnBench(v); }
    // the path bench → seat, 0→1: straight up off the bench; across, clear of the body; tilt
    // to the slot's angle over it; down the slot axis into the slot. Reversed to leave.
    function inPath(v, q){
      var T=P.above.y;
      if(q<=0){ put(v, BENCH); held(v,false); placeOnBench(v); return; }
      clearPlacement(v); held(v,true);
      if(q<0.2){ var a=easeInOut(q/0.2); put(v, new THREE.Vector3(BENCH.x, lerp(0,T,a), BENCH.z)); }
      else if(q<0.5){ var b=easeInOut((q-0.2)/0.3); put(v, new THREE.Vector3(lerp(BENCH.x,P.above.x,b), T, lerp(BENCH.z,P.above.z,b))); }
      else if(q<0.7){ var c=easeInOut((q-0.5)/0.2); put(v, P.above.clone().lerp(P.pre,c), new THREE.Quaternion().slerp(P.q,c)); }
      else { var d=easeInOut((q-0.7)/0.3); put(v, P.pre.clone().lerp(P.seat,d), P.q); }
    }
    st.enter=function(){
      SAMPLE.only(o.vessel);
      var v=SAMPLE[o.vessel];
      if(o.vlabel) v.userData.setLabel(o.vlabel, o.vsub||"");
      if(o.color!=null) v.userData.setColor(o.color);
      v.userData.setLevel(o.lStart==null?0.5:o.lStart);
      v.visible=true; restState(v);
      cen.userData.setLabel(o.cenLabel||"Centrifuge", o.cenSub||"");
    };
    if(o.seconds) st.hud={label:o.hudLabel||"Centrifuge", seconds:o.seconds};
    // COUNTDOWN-OWNED SPIN (Stage 19): the rotor spins for exactly as long as the digits
    // run; entry (into the slot + lid close) and exit (spin-down, lid open, out along the
    // slot axis) use ABSOLUTE time. t = { hasTimer, running, done, progress }.
    var phase="rest", runT=0, endT=0;
    st.driveTimed=function(t,dt){
      var v=SAMPLE[o.vessel]; v.visible=true;
      var engaged = t.running || t.done || t.progress>0.0001;
      if(!engaged){ if(phase!=="rest"){ phase="rest"; runT=0; endT=0; } restState(v); v.userData.setLevel(o.lStart==null?0.5:o.lStart); return; }
      if(!fits){ cen.userData.setLid(!t.running); cen.userData.setSpin(t.running?24:0); return; }
      if(t.done || t.progress>=1){
        if(phase!=="end"){ phase="end"; endT=0; }
        endT+=dt;
        cen.userData.setSpin(0);
        if(endT<0.9){ dock(); cen.userData.setLid(false); }
        else if(endT<1.5){ cen.userData.setLid(true); }
        else { undock(); inPath(v, 1-clamp((endT-1.5)/0.6,0,1)); }
        return;
      }
      if(phase!=="run"){ phase="run"; runT=0; }
      runT+=dt;
      var ent=clamp(runT/0.55,0,1);
      if(ent<1 && !docked){ inPath(v, ent); cen.userData.setLid(true); cen.userData.setSpin(0); }
      else { dock(); cen.userData.setLid(false); cen.userData.setSpin(t.running?24:0); }
      if(o.lEnd!=null) v.userData.setLevel(lerp(o.lStart==null?0.5:o.lStart,o.lEnd,easeInOut(clamp(t.progress,0,1))));
    };
    st.timeline=function(p){
      var v=SAMPLE[o.vessel]; v.visible=true;
      if(!fits){                                // a rejected vessel never enters; the rotor runs empty
        restState(v); cen.userData.setLid(!(p>0.26 && p<0.8)); cen.userData.setSpin(p>0.26 && p<0.8 ? 24 : 0);
      } else if(p<0.26){                        // 1 · over the open rotor, tilt, down the slot axis
        undock(); inPath(v, clamp(p/0.26,0,1)); cen.userData.setSpin(0); cen.userData.setLid(true);
      } else if(p<0.30){                        // 2 · seated in the slot; lid closes over it
        dock(); cen.userData.setSpin(0); cen.userData.setLid(false);
      } else if(p<0.80){                        // 3 · lid closed + SPINNING — the sample rides the rotor
        dock(); cen.userData.setSpin(24); cen.userData.setLid(false);
      } else if(p<0.90){                        // 4 · rotor stops; lid opens
        dock(); cen.userData.setSpin(0); cen.userData.setLid(true);
      } else {                                  // 5 · out along the slot axis, back over the rotor
        undock(); inPath(v, 1-easeInOut((p-0.90)/0.10));
        cen.userData.setSpin(0); cen.userData.setLid(true);
      }
      if(o.lEnd!=null) v.userData.setLevel(lerp(o.lStart==null?0.5:o.lStart, o.lEnd, easeInOut(clamp(p,0,1))));
    };
  }

buildGelRig = streams.wrap('buildGelRig', buildGelRig)
buildBackdrop = streams.wrap('buildBackdrop', buildBackdrop)
buildEnvMap = streams.wrap('buildEnvMap', buildEnvMap)
makeGradientTexture = streams.wrap('makeGradientTexture', makeGradientTexture)
makeCineBackdrop = streams.wrap('makeCineBackdrop', makeCineBackdrop)
buildFloor = streams.wrap('buildFloor', buildFloor)
buildStainingTray = streams.wrap('buildStainingTray', buildStainingTray)
buildSample = streams.wrap('buildSample', buildSample)

export { buildFloor, buildGelRig, buildStainingTray, buildEnvMap, makeCineBackdrop, makeGradientTexture, dispenseProgress, pipetteRun, addPipetteRig, pipRest, restPoint, backRowPlace, buildSample, addBottle, stationReagent, stationSpin, benchPlace, benchSlot, benchExtents, held }
