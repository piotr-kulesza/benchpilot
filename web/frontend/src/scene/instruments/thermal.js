// instruments/thermal.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the temperature instruments (heat block, water bath, ice bucket, thermocycler, CO2 incubator, -80 freezer). Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from '../rng.js'
import * as THREE from 'three'
import { dims, clearance } from '../dims.js'
import { addSocket } from '../sockets.js'
import { makeLabel } from '../labels.js'
import { glassMaterial, matAnodized, matBrushed, matPainted, matPlastic } from '../materials.js'
import { LABEL_GAP, declareCutaway, fitArt, fx, openTopBox, slabWithHoles, tagSpec } from '../modelKit.js'
import { MAX_ANISO, clamp, easeInOut, lerp } from '../util.js'


  /* ---------- dry heat block (ThermoStat-class) ---------- */
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
    // muted stainless inner LINER (open-topped — nothing lowered in passes through a lid).
    // Its FRONT face is part of the near wall, so it is its own mesh: the cutaway takes the
    // near wall away and leaves the back and side lining — the backdrop the tube is read
    // against — solid (it used to turn the whole liner translucent).
    var innerMat=new THREE.MeshStandardMaterial({ color:0x6b7580, roughness:0.5, metalness:0.25, side:THREE.DoubleSide });
    var linerGeo=new THREE.BoxGeometry(IW,IH,ID), lIdx=linerGeo.index.array, lKeep=[];
    linerGeo.groups.forEach(function(g,k){ if(k===2||k===4) return; for(var i=g.start;i<g.start+g.count;i++) lKeep.push(lIdx[i]); });   // drop +y (top) and +z (front)
    linerGeo.setIndex(lKeep); linerGeo.clearGroups(); linerGeo.addGroup(0,lKeep.length,0);
    var liner=new THREE.Mesh(linerGeo, innerMat); liner.position.y=FLOOR_Y+IH/2; fx(liner,'decal'); grp.add(liner);
    var linerFront=new THREE.Mesh(new THREE.PlaneGeometry(IW,IH), innerMat); linerFront.position.set(0,FLOOR_Y+IH/2,ID/2); fx(linerFront,'decal'); grp.add(linerFront);
    // the submerged tube RACK: a perforated steel platform on four legs
    var RW=IW*0.5, RD=ID*0.7, RT=D.rack_height*0.08;
    var rackMat=matBrushed(0x9aa4b0);
    var plat=new THREE.Mesh(new THREE.BoxGeometry(RW,RT,RD), rackMat); plat.position.y=RACK_Y-RT/2; grp.add(plat);
    for(var lg=0;lg<4;lg++){ var leg=new THREE.Mesh(new THREE.BoxGeometry(RT,D.rack_height-RT,RT), rackMat);
      leg.position.set((lg&1?1:-1)*(RW/2-RT), FLOOR_Y+(D.rack_height-RT)/2, (lg&2?1:-1)*(RD/2-RT)); grp.add(leg); }
    addSocket(grp,'rack',{ position:new THREE.Vector3(0,RACK_Y,0) });
    // WATER — RESTRAINED: a muted blue, NO emissive glow — but dense enough to read as a
    // body of liquid (at 0.36 over a cut-away wall it read as a grey haze)
    var waterMat=new THREE.MeshPhysicalMaterial({ color:0x3d6d88, roughness:0.16, metalness:0,
      transparent:true, opacity:0.5, depthWrite:false, clearcoat:0.15, clearcoatRoughness:0.3, envMapIntensity:0.25 });
    var water=new THREE.Mesh(new THREE.BoxGeometry(IW*0.998,SURFY-FLOOR_Y,ID*0.998), waterMat); water.position.y=(SURFY+FLOOR_Y)/2; fx(water,'fluid'); grp.add(water);
    // the water is drawn BEFORE the vessels in it: the tube stands INSIDE the water box and
    // both are transparent with centres at the same depth, so their order was a coin toss —
    // the water's front face washed over the tube's submerged half and the cone read as a
    // separate ghost. The subject is never veiled: tube and contents draw as one object.
    water.renderOrder=-1;
    // faint surface sheen — a reflective meniscus, not a glowing cap
    var surfMat=new THREE.MeshPhysicalMaterial({ color:0xb6ccd6, roughness:0.09, metalness:0.15, transparent:true, opacity:0.12, depthWrite:false, envMapIntensity:0.4 });
    var surf=new THREE.Mesh(new THREE.BoxGeometry(IW*0.99,IH*0.01,ID*0.99), surfMat); surf.position.y=SURFY; surf.renderOrder=-1; fx(surf,'fluid'); grp.add(surf);
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
    var WS=ID*0.03;      // a wisp is a few cm across, not a 15 cm ball
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
    declareCutaway(grp, [frontW, linerFront]);   // the NEAR wall only: its steel and its lining
    return tagSpec(grp,'water_bath_5l');
  }

  /* ---------- open ice bucket (keep on ice) ---------- */
  function buildIceBucket(){
    // REAL SIZE from dims('ice_bucket_4l'): an open insulated tub, the tube stands on its
    // FLOOR (socket 'bed') and crushed ice is packed round it to ice_depth. (The old tube
    // hovered among the cubes with nothing under it.)
    var grp = new THREE.Group();
    var D=dims('ice_bucket_4l'), T=dims('microtube_1_5');
    var R=D.radius, H=D.height, WALL=D.wall, RB=R*0.84, FL=WALL;
    var steel = matBrushed(0xc4cbd4); steel.roughness=0.4;
    var steelDk = matBrushed(0x929ba6);
    // the tub's wall, rim and lining are each drawn as a FRONT half (camera side, +z) and a
    // BACK half: the cutaway takes the near half away and leaves the back — the backdrop the
    // tube is read against — solid (it used to turn the whole tub translucent)
    var FRONT=-Math.PI/2, BACK=Math.PI/2, HALF=Math.PI;             // CylinderGeometry: z = r·cos θ
    var wall = new THREE.Mesh(new THREE.CylinderGeometry(R,RB,H,22,1,true,FRONT,HALF), steel);
    wall.position.y=H/2; wall.castShadow=true; wall.receiveShadow=true; grp.add(wall);
    var wallBack = new THREE.Mesh(new THREE.CylinderGeometry(R,RB,H,22,1,true,BACK,HALF), steel);
    wallBack.position.y=H/2; wallBack.castShadow=true; wallBack.receiveShadow=true; grp.add(wallBack);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(R-WALL*0.2,WALL*0.2,14,24,Math.PI), steelDk);   // arc 0..π → z ≥ 0
    rim.rotation.x=Math.PI/2; rim.position.y=H-WALL*0.2; grp.add(rim);
    var rimBack = new THREE.Mesh(new THREE.TorusGeometry(R-WALL*0.2,WALL*0.2,14,24,Math.PI), steelDk);
    rimBack.rotation.set(Math.PI/2,0,Math.PI); rimBack.position.y=H-WALL*0.2; grp.add(rimBack);
    var innerMat = new THREE.MeshStandardMaterial({ color:0x6f7d89, metalness:0.3, roughness:0.55, envMapIntensity:0.7, side:THREE.DoubleSide }); // muted cool-grey interior
    var inner = new THREE.Mesh(new THREE.CylinderGeometry(R-WALL,RB-WALL,H-FL,22,1,true,FRONT,HALF), innerMat);
    inner.position.y=FL+(H-FL)/2; fx(inner,'decal'); grp.add(inner);
    var innerBack = new THREE.Mesh(new THREE.CylinderGeometry(R-WALL,RB-WALL,H-FL,22,1,true,BACK,HALF), innerMat);
    innerBack.position.y=FL+(H-FL)/2; fx(innerBack,'decal'); grp.add(innerBack);
    var base = new THREE.Mesh(new THREE.CylinderGeometry(RB,RB,FL,44), innerMat);
    base.position.y=FL/2; grp.add(base);                                 // the insulated floor
    addSocket(grp,'bed',{ position:new THREE.Vector3(0,FL,0) });
    // crushed ICE packed to ice_depth, leaving the centre clear for the tube
    var iceMat=new THREE.MeshPhysicalMaterial({ color:0xd4e2ea, roughness:0.14,
      transparent:true, opacity:0.55, clearcoat:0.8, envMapIntensity:1.0, flatShading:true, depthWrite:false });
    // real-size pieces (dims ice_piece), packed to ice_depth — which is BELOW the tube's top
    var iceTop=FL+D.ice_depth, clearR=T.radius*1.8;
    for(var ic=0;ic<48;ic++){
      var a=Math.random()*Math.PI*2, cs=D.ice_piece*(0.35+Math.random()*0.3), rr=clearR+cs+Math.random()*(RB-WALL-clearR-2*cs);
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
      var fs=R*(0.014+Math.random()*0.027); fm.scale.set(fs,fs,fs); fx(fm,'effect');
      if(Math.abs(fm.position.z)>fs) grp.add(fm);   // a blob straddling the cut plane would half-vanish (same random draws either way)
    }
    var label = makeLabel("On ice","");   // (was sublabelled "store −80 °C" — ice is not −80 °C)
    label.position.set(0,H+LABEL_GAP,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    grp.userData.sampleSocket='bed';
    var near=[wall,rim,inner]; grp.children.forEach(function(c){ if(c.userData.fx==='effect' && c.position.z>c.scale.z) near.push(c); });   // the near half of the tub + the frost on it
    declareCutaway(grp, near);
    return tagSpec(grp,'ice_bucket_4l');
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

  /* −80 °C freezer box — the vessel is placed inside; door opens, frost breathes out */
  function buildFreezer(){
    // REAL SIZE from dims('ult_freezer_portable'): a HOLLOW insulated shell around a real
    // cavity (inner dimensions from the spec) behind a hinged door. The old freezer was a
    // SOLID box with the cavity drawn inside it — a stored vial sat inside solid shell.
    var grp=new THREE.Group();
    var D=dims('ult_freezer_portable');
    var W=D.width, H=D.height, DEP=D.depth, IW=D.inner_width, IH=D.inner_height, ID=D.inner_depth;
    var shell=matPainted(0xd7dbe0,0.5);
    // the external depth includes the door and its handle: the body is what is left
    var DT=DEP*0.035, HR=H*0.023, BODY_D=DEP-DT-HR*4, BZ=-DEP/2+BODY_D/2, FRONT=BZ+BODY_D/2;
    var CB=(H-IH)/2, CT=CB+IH, SW=(W-IW)/2, CZ=FRONT-ID/2;  // cavity bottom/top, side wall, cavity centre z
    function part(w,h,d,x,y,z){ var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), shell); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; grp.add(m); return m; }
    part(W,CB,BODY_D, 0,CB/2,BZ);                   // floor block
    part(W,H-CT,BODY_D, 0,(H+CT)/2,BZ);             // lid block
    part(SW,IH,BODY_D, -(W-SW)/2,CB+IH/2,BZ);       // side walls
    part(SW,IH,BODY_D, (W-SW)/2,CB+IH/2,BZ);
    part(IW,IH,BODY_D-ID, 0,CB+IH/2,-DEP/2+(BODY_D-ID)/2); // back wall
    var cavityMat=new THREE.MeshStandardMaterial({ color:0xaeb8c4, roughness:0.5, metalness:0.1, side:THREE.DoubleSide });
    var liner=new THREE.Mesh(openTopBox(IW,ID,IH), cavityMat);   // five faces, OPEN to the front
    liner.rotation.x=Math.PI/2; liner.position.set(0,CB+IH/2,CZ); fx(liner,'decal'); grp.add(liner);
    addSocket(grp,'shelf',{ position:new THREE.Vector3(0,CB,CZ) });
    // hinged door (front)
    var doorPivot=new THREE.Group(); doorPivot.position.set(-W/2,H/2,FRONT+DT/2); grp.add(doorPivot);
    var door=new THREE.Mesh(new THREE.BoxGeometry(W*0.96,H*0.96,DT), matPainted(0xe6e9ed,0.5));
    door.position.set(W/2,0,0); doorPivot.add(door);
    // prominent vertical PULL HANDLE on the door's free edge, on standoff brackets
    var HL=H*0.73, HX=W*0.85;
    var handleBar=new THREE.Mesh(new THREE.CylinderGeometry(HR,HR,HL,16), matBrushed(0x868f9b));
    handleBar.position.set(HX,0,DT/2+HR*3); doorPivot.add(handleBar);
    for(var hb=0;hb<2;hb++){ var brk=new THREE.Mesh(new THREE.BoxGeometry(HR*1.7,HR*1.5,HR*3), matBrushed(0x868f9b));
      brk.position.set(HX,(hb?1:-1)*HL*0.37,DT/2+HR*1.5); doorPivot.add(brk); }
    // hinge barrels on the hinge side so the door reads as a door
    for(var hg=0;hg<2;hg++){ var hinge=new THREE.Mesh(new THREE.CylinderGeometry(HR,HR,H*0.1,12), matBrushed(0x868f9b));
      hinge.position.set(HR,(hg?1:-1)*H*0.35,DT/2+HR); doorPivot.add(hinge); }
    // a THIN, translucent cold mist that spills from the bottom door seam and lies low
    var frostMat=new THREE.MeshBasicMaterial({ color:0xdfeaf4, transparent:true, opacity:0.0, depthWrite:false, fog:false });
    var frost=new THREE.Mesh(new THREE.SphereGeometry(0.5,20,12), frostMat); frost.position.set(0,H*0.05,FRONT+DT*3); frost.scale.set(W*0.4,H*0.04,DEP*0.15); fx(frost,'effect'); grp.add(frost);
    var label=makeLabel("−80 °C",""); label.position.set(0,H+LABEL_GAP,0); grp.add(label);
    var st={ door:0, tDoor:0 }; // CLOSED at rest (the store animation opens it)
    grp.userData.label=label;
    grp.userData.setDoor=function(open){ st.tDoor=open?1:0; };
    grp.userData.setFrost=function(a){ frostMat.opacity=clamp(a,0,0.5)*0.4; };  // at most a faint mist
    grp.userData.update=function(dt){ st.door=lerp(st.door,st.tDoor,1-Math.pow(0.02,dt)); doorPivot.rotation.y=-easeInOut(st.door)*1.2; };   // swings OUT (+z) — a +angle swung it back through the body
    grp.userData.cavity={ bottom:CB, top:CT, front:FRONT, back:FRONT-ID, halfW:IW/2 };
    grp.userData.sampleSocket='shelf';
    declareCutaway(grp, doorPivot.children.slice());   // the door (and its handle) is the near wall
    return tagSpec(grp,'ult_freezer_portable');
  }

// per-builder seeded random streams (rng.js) — the same names as before the split
buildColdBlock = streams.wrap('buildColdBlock', buildColdBlock)
buildWaterBath = streams.wrap('buildWaterBath', buildWaterBath)
buildThermocycler = streams.wrap('buildThermocycler', buildThermocycler)
buildIceBucket = streams.wrap('buildIceBucket', buildIceBucket)
buildFreezer = streams.wrap('buildFreezer', buildFreezer)

export { buildColdBlock, buildWaterBath, buildIceBucket, buildThermocycler, buildCO2Incubator, buildFreezer }
