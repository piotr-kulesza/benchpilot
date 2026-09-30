// instruments/motion.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the instruments that move the sample (centrifuge, vortex mixer, plate shaker). Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from '../rng.js'
import * as THREE from 'three'
import { dims, clearance } from '../dims.js'
import { addSocket } from '../sockets.js'
import { makeLabel } from '../labels.js'
import { fresnelize, matAnodized, matBrushed, matPainted, matPlastic, matRubber } from '../materials.js'
import { declareCutaway, fitArt, fx, tagSpec } from '../modelKit.js'
import { MAX_ANISO, easeInOut, lerp } from '../util.js'


  /* ---------- benchtop centrifuge ---------- */
  function buildCentrifuge(){
    var grp = new THREE.Group();
    var shell = matPainted(0xa6aeb9, 0.42);      // dove-grey upper shell (two-tone top)
    var shellDk = matPainted(0x2b323c, 0.5);     // graphite accent panels
    var metalBase = matBrushed(0x707a86);        // brushed graphite metal base (catches key light)
    // realistic light-grey instrument shell with just a slim brand-blue accent (no glow)
    var trim  = new THREE.MeshStandardMaterial({ color:0x9fb6cf, metalness:0.3, roughness:0.42,
      envMapIntensity:0.7 });
    // THE ROUND SHELL IN HALVES: every round part is a FRONT half (camera side, +z) and a BACK
    // half, so the cutaway can take the near wall away and leave the back of the machine — the
    // backdrop the tube is read against — solid (it used to turn the whole machine and its
    // rotor translucent). A solid half is closed on its cut face.
    var near=[];
    var F0=-Math.PI/2, B0=Math.PI/2, HALF=Math.PI;                 // CylinderGeometry: z = r·cos θ
    function cylHalves(rt,rb,h,seg,open,mat,y,shadow){
      var out=[F0,B0].map(function(t0,i){
        var m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg/2,1,open,t0,HALF), mat);
        m.position.y=y; if(shadow){ m.castShadow=true; m.receiveShadow=true; } grp.add(m); return m; });
      if(!open){   // close the back half's cut face (a trapezoid in the x-y plane, facing +z)
        var sh=new THREE.Shape(); sh.moveTo(-rb,-h/2); sh.lineTo(rb,-h/2); sh.lineTo(rt,h/2); sh.lineTo(-rt,h/2); sh.lineTo(-rb,-h/2);
        var cap=new THREE.Mesh(new THREE.ShapeGeometry(sh), mat); cap.position.y=y; grp.add(cap); }
      near.push(out[0]); return out[0];
    }
    function torusHalves(r,t,rs,ts,mat,y,parent,z){   // torus laid flat (rotation.x = π/2): arc 0..π is z ≥ 0
      parent=parent||grp;
      var f=new THREE.Mesh(new THREE.TorusGeometry(r,t,rs,ts/2,Math.PI), mat); f.rotation.x=Math.PI/2; f.position.set(0,y,z||0); parent.add(f);
      var b=new THREE.Mesh(new THREE.TorusGeometry(r,t,rs,ts/2,Math.PI), mat); b.rotation.set(Math.PI/2,0,Math.PI); b.position.set(0,y,z||0); parent.add(b);
      near.push(f); return f;
    }
    var foot = cylHalves(1.5,1.58,0.18,56,false,matBrushed(0x7c8590),0.09,false);
    var base = cylHalves(1.35,1.5,0.62,56,false,metalBase,0.44,true);
    // rubber feet
    var cfFoot=matRubber(0x161a20);
    for(var ft=0;ft<4;ft++){ var fa=ft/4*Math.PI*2+Math.PI/4;
      var fm=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.18,0.1,16), cfFoot);
      fm.position.set(Math.cos(fa)*1.34,0.05,Math.sin(fa)*1.34); grp.add(fm); if(fm.position.z>0.18) near.push(fm); }
    // cooling vent slits around the base
    var cfVent=new THREE.MeshStandardMaterial({ color:0x11151a, roughness:0.85, metalness:0.3, envMapIntensity:0.4 });
    for(var vv=0;vv<20;vv++){ var va=vv/20*Math.PI*2;
      var vent=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.24,0.03), cfVent);
      vent.position.set(Math.cos(va)*1.40,0.4,Math.sin(va)*1.40); vent.rotation.y=-va; grp.add(vent); if(vent.position.z>0.05) near.push(vent); }
    // the body is a RING around the bowl (open walls + a top annulus): the old solid
    // cylinder put the rotor, and every tube in it, inside solid shell
    var body = cylHalves(1.25,1.3,0.5,56,true,shell,0.9,false);
    // the top annulus: RingGeometry lies in x-y; turned flat (rotation.x = −π/2) θ π..2π is z ≥ 0
    var bodyTop = new THREE.Mesh(new THREE.RingGeometry(1.15,1.25,28,1,Math.PI,Math.PI), shell);
    bodyTop.rotation.x=-Math.PI/2; bodyTop.position.y=1.15; grp.add(bodyTop); near.push(bodyTop);
    var bodyTopBack = new THREE.Mesh(new THREE.RingGeometry(1.15,1.25,28,1,0,Math.PI), shell);
    bodyTopBack.rotation.x=-Math.PI/2; bodyTopBack.position.y=1.15; grp.add(bodyTopBack);
    var lipRing = torusHalves(1.24,0.05,16,60,shellDk,1.14);
    var ringT = torusHalves(1.2,0.072,16,60,trim,1.12);
    // bold petrol-teal accent band wrapping the metal base — a real colour panel, not a dot
    var accentBand = cylHalves(1.315,1.315,0.13,56,true,trim,0.7,false);

    var bowl = cylHalves(1.15,1.0,0.5,48,true,
      new THREE.MeshStandardMaterial({color:0x15191f,metalness:0.4,roughness:0.7,side:THREE.DoubleSide}),0.9,false);

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
    roFrame.position.set(0,0.62,1.29); roFrame.rotation.x=-0.32; grp.add(roFrame); near.push(roFrame);

    var domeMat = fresnelize(new THREE.MeshPhysicalMaterial({ color:0x282d36, roughness:0.12,
      transparent:true, opacity:0.5, clearcoat:1, clearcoatRoughness:0.08, envMapIntensity:1.1,
      side:THREE.DoubleSide, depthWrite:false }));
    var lidPivot = new THREE.Group(); lidPivot.position.set(0,1.16,-1.2); grp.add(lidPivot);
    var dome = new THREE.Mesh(new THREE.SphereGeometry(1.22,44,30,0,Math.PI*2,0,Math.PI*0.5), domeMat);
    dome.position.set(0,0,1.2); lidPivot.add(dome);
    var lidRim = torusHalves(1.2,0.045,14,60,matBrushed(0x6d7783),0.01,lidPivot,1.2);
    var handle = new THREE.Mesh(new THREE.TorusGeometry(0.16,0.03,12,24,Math.PI), matPlastic(0x232a33));
    handle.position.set(0,0.6,2.2); handle.rotation.x=Math.PI/2; lidPivot.add(handle); near.push(handle);

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
    // the NEAR WALL only: the front halves of the round shell, the front feet / vents / panel,
    // the closed lid's front rim + handle. The back of the machine and the hub stay solid.
    // The CARRIER — the rotor disc the tube passes through and its slots — is cut
    // with it: it spins with the tube, so no fixed half of it is "near" (any slot can turn
    // between the camera and the tube).
    var carried=[disc]; holders.forEach(function(h){ h.traverse(function(o){ if(o.isMesh) carried.push(o); }); });
    declareCutaway(root, near, { node:rotor, meshes:carried });
    root.userData.rimY=F.toWorld(0,1.16,0).y; // the bowl rim (lid seat)
    return tagSpec(root,'microcentrifuge');
  }
  function buildVortexMixer(){
    var grp=new THREE.Group();
    var body=new THREE.Mesh(new THREE.BoxGeometry(1.25,0.62,1.05), matPainted(0x3b424b,0.5));
    body.position.y=0.31; body.castShadow=true; body.receiveShadow=true; grp.add(body);
    var neck=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.34,0.16,20), matAnodized(0x2a2e34));
    neck.position.y=0.68; grp.add(neck);
    var dial=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.06,16), matPlastic(0x8a94a0));
    dial.rotation.x=Math.PI/2; dial.position.set(0.42,0.36,0.53); grp.add(dial);
    var label=makeLabel("Vortex",""); label.position.set(0,1.3,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    // body + neck take the table's envelope below the cup head; the CUP is functional,
    // sized from dims('vortex_mixer').cup_diameter, and a tube presses onto its floor
    var D=dims('vortex_mixer'), CUP_H=D.height*0.22, CR=D.cup_diameter/2;
    var root=fitArt(grp,'vortex_mixer',{ size:{ height:D.height-CUP_H } });
    var y0=D.height-CUP_H, rub=matRubber(0x1b1e23);
    var cup=new THREE.Mesh(new THREE.CylinderGeometry(CR,CR*0.8,CUP_H,24,1,true), rub);
    cup.position.y=y0+CUP_H/2; root.add(cup);
    var cupFloor=new THREE.Mesh(new THREE.CylinderGeometry(CR*0.8,CR*0.8,CUP_H*0.12,24), rub);
    cupFloor.position.y=y0+CUP_H*0.06; root.add(cupFloor);
    addSocket(root,'cup',{ position:new THREE.Vector3(0,y0+CUP_H*0.12,0) });
    root.userData.sampleSocket='cup';
    return tagSpec(root,'vortex_mixer');
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

// per-builder seeded random streams (rng.js) — the same names as before the split
buildPlateShaker = streams.wrap('buildPlateShaker', buildPlateShaker)
buildCentrifuge = streams.wrap('buildCentrifuge', buildCentrifuge)
buildVortexMixer = streams.wrap('buildVortexMixer', buildVortexMixer)

export { buildCentrifuge, buildVortexMixer, buildPlateShaker }
