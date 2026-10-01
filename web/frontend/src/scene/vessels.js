// vessels.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the sample vessels (tube, spin column, cryovial, plate, flask, dish, slide, membrane, gel, agar plate). Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from './rng.js'
import * as THREE from 'three'
import { dims } from './dims.js'
import { makeLabel } from './labels.js'
import { attachSampleLiquid, innerRadiusFn, liquidMat, liquidProfileGeo, tintGradient, levelForVolume } from './liquid.js'
import { glassMaterial, matFrosted, matPlastic } from './materials.js'
import { LABEL_GAP, fitArt, fx, slabWithHoles, tagSpec } from './modelKit.js'
import { COL } from './palette.js'
import { MAX_ANISO, clamp, easeInOut, lerp, roundRect } from './util.js'


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
    // NO TEXT on the writing patch: a reagent name at 30 px on a 150 px patch wrapped round a
    // 10.8 mm tube rendered cropped and mid-word — it read as a bug. The patch stays blank
    // (ruled); what the tube holds is named by the station title in the HUD.
    g.strokeStyle="rgba(120,130,146,0.35)"; g.lineWidth=1.5;
    g.beginPath(); g.moveTo(lx+16,ly+52); g.lineTo(lx+lw-16,ly+52); g.stroke();
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
    // the level that holds `ul` µL in THIS tube (its own inner profile, drawn at real size)
    grp.userData.levelFor=function(ul){ return levelForVolume(innerFn, liqBottom, liqFillMax, ul, 1, 1); };
    // where a pipette delivers: the MOUTH (top centre) and how deep the tip goes in
    grp.userData.mouth={ x:0, y:H, z:0, approach:'top' };
    grp.userData.entry=H*0.32;
    return tagSpec(grp, D.id);
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
    grp.userData.collection=collGrp;   // the station seats it where it is left (a stand)
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
    // the level that holds `ul` µL above the membrane (the cup's inner profile, scaled to world)
    root.userData.levelFor=function(ul){ var F=root.userData.fit; return levelForVolume(colInnerFn, colBottom, colFillMax, ul, F.sx, F.sy); };
    // the tip stops just below the cup rim, ABOVE the silica bed (membrane at drawing y 0.9)
    root.userData.mouth={ x:0, y:root.userData.fit.toWorld(0,1.56,0).y, z:0, approach:'top' };
    root.userData.entry=root.userData.fit.toWorld(0,1.2,0).y;
    // the underside of the column's FLANGE (drawing: torus at 1.5, tube 0.028) — what rests on a tube rim
    root.userData.flangeY=root.userData.fit.toWorld(0,1.5-0.028,0).y;
    return tagSpec(root,'spin_column_mini');
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
    var neck=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,0.52,24,1,true), psMat.clone());   // OPEN: a tube a tip goes down, not a plug
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
    // the tip goes IN the neck (0.3 of its length) and dispenses there — it stops above where
    // the neck meets the body (the old 0.95 plunged it through the body's top into the medium)
    root.userData.mouth={ x:m.x, y:m.y, z:m.z, approach:'angled', tilt:-Math.atan2(ax,ay), depth:0.3*0.52*alen, standoff:0.75*alen };
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
    root.userData.entry=gm.y;   // at the well MOUTH: the slab is solid, its wells are printed on it
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

// per-builder seeded random streams (rng.js) — the same names as before the split
buildTube = streams.wrap('buildTube', buildTube)
buildSpinColumn = streams.wrap('buildSpinColumn', buildSpinColumn)
buildCryovial = streams.wrap('buildCryovial', buildCryovial)
buildWellPlate = streams.wrap('buildWellPlate', buildWellPlate)
buildFlask = streams.wrap('buildFlask', buildFlask)
buildDish = streams.wrap('buildDish', buildDish)
buildSlide = streams.wrap('buildSlide', buildSlide)
buildMembrane = streams.wrap('buildMembrane', buildMembrane)
buildGelSlab = streams.wrap('buildGelSlab', buildGelSlab)
buildAgarPlate = streams.wrap('buildAgarPlate', buildAgarPlate)

export { tubeGraphicTex, buildTube, buildSpinColumn, buildCryovial, buildWellPlate, buildFlask, buildDish, buildSlide, buildMembrane, buildGelSlab, buildAgarPlate }
