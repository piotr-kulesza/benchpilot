// instruments/gel.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the electrophoresis rig (tank + power supply). Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from '../rng.js'
import * as THREE from 'three'
import { dims, clearance } from '../dims.js'
import { addSocket } from '../sockets.js'
import { makeLabel } from '../labels.js'
import { matPainted, matPlastic, matRubber } from '../materials.js'
import { declareCutaway, fitArt, fx, openTopBox, tagSpec } from '../modelKit.js'
import { MAX_ANISO, clamp, easeInOut, lerp } from '../util.js'


  /* ---------- gel electrophoresis rig: buffer tank + gel with wells + power box.
     setProgress(p) migrates the dye front / bands down the gel and ramps the
     voltage readout. Stylized to match the bench (matFrosted tank, matPainted box). */
  // opts.psuGap: the bench gap between the tank and its power supply (default one bench gap);
  // a loading close-up sets the supply further off so it is not cropped at the frame edge —
  // the leads are built to wherever it stands
  function buildGelRig(opts){
    opts=opts||{};
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
    // straight up, leads with it; `aside` (0–1) then carries the raised lid BACK behind the
    // tank (0–0.5) and sets it DOWN on the bench there (0.5–1) — to load a gel the lid is off
    // and out of the way, resting on the bench, not hanging in the air over the wells
    var LID_BACK=1.9, LID_DOWN=-(0.96-0.045-0.19);          // lid centre 0.96, half-thickness 0.045; the tank's base at 0.19
    grp.userData.setLidLift=function(q, aside){
      var a=clamp(aside||0,0,1), up=clamp(q,0,1)*1.15;
      lidGrp.position.z=-LID_BACK*easeInOut(clamp(a/0.5,0,1));
      lidGrp.position.y=lerp(up, LID_DOWN, easeInOut(clamp((a-0.5)/0.5,0,1)));
    };
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
    declareCutaway(tankRoot, [rims[0]]);   // the NEAR rail of the rim frame only (+z): the side rails, back rail and base frame stay solid
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
    psu.position.set(GD.width/2+(opts.psuGap!=null?opts.psuGap:gap)+PS.width/2, 0, 0);
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

// per-builder seeded random streams (rng.js) — the same names as before the split
buildGelRig = streams.wrap('buildGelRig', buildGelRig)

export { buildGelRig }
