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
import { solidBox } from './solids.js'
import { dims, clearance } from './dims.js'
import { placeInto, placeOnBench, clearPlacement, getSocket, socketPose, canPlace } from './sockets.js'
import { buildCentrifuge } from './instruments/motion.js'
import { COL } from './palette.js'
import { buildBottle, buildPipette } from './props.js'
import { SAMPLE, getSample, scene } from './sample.js'
import { clamp, easeInOut, lerp } from './util.js'
import { buildTube } from './vessels.js'
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
export * from './instruments/gel.js'
export * from './instruments/staining.js'
export * from './environment.js'
export * from './sample.js'


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

export { dispenseProgress, pipetteRun, addPipetteRig, pipRest, restPoint, backRowPlace, addBottle, stationReagent, stationSpin, benchPlace, benchSlot, benchExtents, held }
