// props.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// bench props and hand tools (pipette, stand, bottle, waste, syringe, spreader, drop). Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from './rng.js'
import * as THREE from 'three'
import { dims, clearance } from './dims.js'
import { makeLabel } from './labels.js'
import { innerRadiusFn, liquidProfileGeo } from './liquid.js'
import { TEX, glassMaterial, matBrushed, matFrosted, matPainted, matPlastic, matRubber, matSilicone } from './materials.js'
import { fitArt, fx, tagSpec } from './modelKit.js'
import { COL } from './palette.js'
import { MAX_ANISO, clamp, easeInOut, lerp } from './util.js'


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
    // the liquid IN THE TIP follows the tip's own inner wall, from its end up to the fill line
    // (it was a 7 mm cylinder scaled in height only: a part-filled tip showed a wide slab
    // sticking out of a narrow cone — a 'full' cone, a disc at a tube's mouth)
    var tipInner=innerRadiusFn(tp, 0.8), fluidH=-1;
    var fluid = new THREE.Mesh(liquidProfileGeo(tipInner, -0.84, -0.83, 24), fluidMat);
    fluid.visible=false; fx(fluid,'fluid'); grp.add(fluid);
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
      else{ fluid.visible=true; var yTop=-0.84+st.fill*0.8;           // fill = the fraction of the tip's height
        if(Math.abs(yTop-fluidH)>0.004){ fluid.geometry.dispose(); fluid.geometry=liquidProfileGeo(tipInner, -0.84, yTop, 24); fluidH=yTop; } }
    };
    // a pipette is positioned by its TIP: its origin is the tip end (the lowest point),
    // not its footprint centre (the finger hook makes it asymmetric) — see PIVOT_AT_TIP
    return tagSpec(fitArt(grp,'pipette_p200',{ pivot:'origin' }),'pipette_p200');
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
      // a FLAT foot: the base used to rise 2 mm from centre to rim — a convex bottom that
      // rocks on its centre point (the stability check measured a 0.1 % support span)
      new THREE.Vector2(0.001,0), new THREE.Vector2(0.34,0), new THREE.Vector2(0.36,0.06),
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
    // NO TEXT on the label: a 256-px canvas wrapped round the bottle cropped the reagent's
    // name mid-word ("er … di"), which read as a bug. The reagent is identified by a COLOUR
    // BAND in its own colour here and by the station title in the HUD.
    var band0=new THREE.Color(col==null?0x2b7f74:col);
    lg.fillStyle="#"+band0.getHexString(); lg.fillRect(0,30,256,38);
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
      var o=bState.open, UP=bState.capBaseY+0.42, BZ=-(0.36+0.17+0.3), e;   // BEHIND the bottle (the subject is in front)
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
    return tagSpec(fitArt(grp,'cell_spreader'),'cell_spreader');
  }

  /* ---------- eluate droplet ---------- */
  function buildDrop(color){
    var m = new THREE.MeshPhysicalMaterial({ color:color, roughness:0.14,
      transparent:false, emissive:color, emissiveIntensity:0.08, clearcoat:0.8, envMapIntensity:1.0 });
    var d = new THREE.Mesh(new THREE.SphereGeometry(0.07,22,18), m);
    d.scale.set(1,1.3,1); d.visible=false;
    return fx(d,'fluid');
  }

  /* ---------- muted warning ring (⛔ caution) ---------- */
  function buildWarnRing(){
    // red caution ring removed per user — return an empty, inert group so the step logic
    // (which toggles .visible and calls .update) still works with nothing to show.
    var grp=new THREE.Group();
    grp.userData.update=function(){};
    return grp;
  }

// per-builder seeded random streams (rng.js) — the same names as before the split
buildPipette = streams.wrap('buildPipette', buildPipette)
buildWaste = streams.wrap('buildWaste', buildWaste)
buildSyringe = streams.wrap('buildSyringe', buildSyringe)
buildDrop = streams.wrap('buildDrop', buildDrop)
buildPipetteStand = streams.wrap('buildPipetteStand', buildPipetteStand)
buildBottle = streams.wrap('buildBottle', buildBottle)
buildWarnRing = streams.wrap('buildWarnRing', buildWarnRing)
buildSpreader = streams.wrap('buildSpreader', buildSpreader)

export { buildPipette, buildPipetteStand, buildBottle, buildWaste, buildSyringe, buildSpreader, buildDrop, buildWarnRing }
