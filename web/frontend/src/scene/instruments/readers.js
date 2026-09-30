// instruments/readers.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the reading instruments (plate reader, NanoDrop, microscopes, UV transilluminator). Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from '../rng.js'
import * as THREE from 'three'
import { dims, clearance } from '../dims.js'
import { addSocket } from '../sockets.js'
import { makeLabel } from '../labels.js'
import { TEX, matBrushed, matPainted, matPlastic } from '../materials.js'
import { LABEL_GAP, declareCutaway, fitArt, fx, openTopBox, tagSpec } from '../modelKit.js'
import { MAX_ANISO, clamp, lerp } from '../util.js'


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
    var above=part(W,H-TBOT-TH,DEP, 0,(H+TBOT+TH)/2,0);             // above it
    var sideW=(W-TW)/2;
    var sideL=part(sideW,TH,DEP, -(W-sideW)/2,TBOT+TH/2,0);         // its two sides
    var sideR=part(sideW,TH,DEP, (W-sideW)/2,TBOT+TH/2,0);
    part(TW,TH,DEP-TDEP, 0,TBOT+TH/2,-DEP/2+(DEP-TDEP)/2);          // and its back wall
    // dark tunnel lining — OPEN at the front (its front face used to close the tunnel mouth)
    var inner=new THREE.Mesh(openTopBox(TW,TDEP,TH), new THREE.MeshStandardMaterial({ color:0x181d23, roughness:0.8, side:THREE.DoubleSide }));
    inner.rotation.x=Math.PI/2; inner.position.set(0,TBOT+TH/2,DEP/2-TDEP/2); fx(inner,'decal'); grp.add(inner);
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
    // the NEAR wall only: the drawer's front lip, which stands in front of the plate in the
    // tunnel (at the rail's 13.5° the plate is seen through the tunnel mouth); the housing,
    // its sides and the tunnel lining stay solid — they used to go translucent with it
    declareCutaway(grp, [lip]);
    return tagSpec(grp,'plate_reader');
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

// per-builder seeded random streams (rng.js) — the same names as before the split
buildPlateReader = streams.wrap('buildPlateReader', buildPlateReader)
buildNanoDrop = streams.wrap('buildNanoDrop', buildNanoDrop)
buildInvertedMicroscope = streams.wrap('buildInvertedMicroscope', buildInvertedMicroscope)
buildLightMicroscope = streams.wrap('buildLightMicroscope', buildLightMicroscope)
buildUVTransilluminator = streams.wrap('buildUVTransilluminator', buildUVTransilluminator)

export { buildPlateReader, buildNanoDrop, drawTrace, buildInvertedMicroscope, buildLightMicroscope, buildUVTransilluminator }
