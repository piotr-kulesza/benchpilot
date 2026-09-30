// spin.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the centrifuge station (sample into a rotor-slot socket). Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import * as THREE from 'three'
import { dims, clearance } from './dims.js'
import { placeInto, placeOnBench, clearPlacement, getSocket, socketPose, canPlace } from './sockets.js'
import { standFor } from './holders.js'
import { benchSlot } from './bench.js'
import { buildCentrifuge } from './instruments/motion.js'
import { SAMPLE, scene, getSnap } from './sample.js'
import { clamp, easeInOut, lerp } from './util.js'

  // A vessel IN HAND is not resting on anything (the geometry audit's contact check)
  function held(v, on){ v.userData.held=!!on; }
  function stationSpin(st, Y, o){
    // the CENTRIFUGE is the subject, on the bench at the origin. The sample is placed INTO
    // a rotor slot (socket) — tilted to the rotor's real fixed angle, riding the rotor as it
    // spins — never scaled down to fit a slot it does not fit (the old SEAT_SCALE 0.6).
    var cen=buildCentrifuge();
    st.group.add(cen); placeOnBench(cen); st.updatables.push(cen); st.cen=cen;
    var v0=SAMPLE[o.vessel];
    var SOCK=cen.userData.socketFor ? cen.userData.socketFor(v0.userData.spec) : cen.userData.sampleSocket;
    var fits=canPlace(v0, cen, SOCK);
    if(fits && cen.userData.setAdapter) cen.userData.setAdapter(SOCK, /p$/.test(SOCK));   // a PCR tube rides in its adapter
    if(!fits) (st.socketErrors||(st.socketErrors=[])).push({ vessel:v0.userData.spec, host:'microcentrifuge', socket:SOCK });
    if(fits) cen.userData.setCutaway&&cen.userData.setCutaway(true);   // CUTAWAY: the tube is seen in its slot
    var VH=dims(v0.userData.spec).height, LIFT=clearance('lift');
    var CEN_TOP=dims('microcentrifuge').height;
    // the sample waits on the bench beside the centrifuge (a rejected one stays there)
    var BENCH=new THREE.Vector3(benchSlot(st, dims(v0.userData.spec).width/2, +1),0,0);
    // the sample ARRIVES at that bench spot (in its stand) and is then loaded into the rotor
    if(fits) st.extraSpots=[{ x:BENCH.x, z:BENCH.z, stand:standFor(v0.userData.spec) }];
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
    // THE REPRESENTATIVE MOMENT IS THE TUBE IN THE ROTOR: at rest the station shows it
    // LOADED (lid open, rotor still). A jump (snapped) seats it there; a sequential arrival
    // glides it to its stand beside the centrifuge and then loads it down the slot axis —
    // it never teleports into the slot.
    var arrive=0;
    function loaded(v){ undock(); inPath(v,1); dock(); cen.userData.setSpin(0); cen.userData.setLid(true); }
    st.enter=function(){
      SAMPLE.only(o.vessel);
      var v=SAMPLE[o.vessel];
      if(o.vlabel) v.userData.setLabel(o.vlabel, o.vsub||"");
      if(o.color!=null) v.userData.setColor(o.color);
      v.userData.setLevel(o.lStart==null?0.5:o.lStart);
      v.visible=true;
      cen.userData.setLabel(o.cenLabel||"Centrifuge", o.cenSub||"");
      if(!fits){ restState(v); return; }
      if(getSnap()){ loaded(v); arrive=-1; } else { restState(v); arrive=0; }
    };
    if(o.seconds) st.hud={label:o.hudLabel||"Centrifuge", seconds:o.seconds};
    // COUNTDOWN-OWNED SPIN (Stage 19): the rotor spins for exactly as long as the digits
    // run; entry (into the slot + lid close) and exit (spin-down, lid open, out along the
    // slot axis) use ABSOLUTE time. t = { hasTimer, running, done, progress }.
    var phase="rest", runT=0, endT=0;
    st.driveTimed=function(t,dt){
      var v=SAMPLE[o.vessel]; v.visible=true;
      var engaged = t.running || t.done || t.progress>0.0001;
      if(!engaged){
        if(phase!=="rest"){ phase="rest"; runT=0; endT=0; }
        v.userData.setLevel(o.lStart==null?0.5:o.lStart);
        if(!fits){ restState(v); return; }
        if(arrive<0 || docked){ cen.userData.setSpin(0); cen.userData.setLid(true); return; }    // loaded, waiting
        // arrived in its stand beside the centrifuge? then load it (0.55 s, down the slot axis)
        var bw=new THREE.Vector3(st.x+BENCH.x,0,BENCH.z);
        if(arrive===0 && v.position.distanceTo(bw)>0.02){ restState(v); return; }
        arrive+=dt; var q=clamp(arrive/0.55,0,1);
        if(q<1) inPath(v,q); else { inPath(v,1); dock(); arrive=-1; }
        return;
      }
      if(!fits){ cen.userData.setLid(!t.running); cen.userData.setSpin(t.running?24:0); return; }
      if(t.done || t.progress>=1){
        if(phase!=="end"){ phase="end"; endT=0; }
        endT+=dt;
        cen.userData.setSpin(0);
        dock(); cen.userData.setLid(endT>=0.9);        // rotor stops, lid opens; it stays in its slot
        return;
      }
      if(phase!=="run"){ phase="run"; runT=0; }
      runT+=dt;
      if(!docked){ inPath(v,1); dock(); }            // (loaded at rest — this only catches a jump)
      cen.userData.setLid(false); cen.userData.setSpin(t.running?24:0);
      if(o.lEnd!=null) v.userData.setLevel(lerp(o.lStart==null?0.5:o.lStart,o.lEnd,easeInOut(clamp(t.progress,0,1))));
    };
    // while the rotor SPINS, the step acts on the sample THROUGH it: the rotor carrying the
    // sample round the ring is the subject (framed whole, legible at any angle it stops at);
    // before and after, the sample itself
    // docked, the step acts on the sample THROUGH the rotor: the rotor carrying it is the
    // subject at every pose (a 21 mm PCR tube framed alone buried the camera in the machine)
    st.subjectAt=function(p){ return fits ? cen.userData.rotor : SAMPLE[o.vessel]; };
    // framed on the rotor and the tube in it — not widened to the whole machine and its bench
    if(fits) st.tightFrame=true;
    st.timeline=function(p){
      var v=SAMPLE[o.vessel]; v.visible=true;
      if(!fits){                                // a rejected vessel never enters; the rotor runs empty
        restState(v); cen.userData.setLid(!(p>0.26 && p<0.8)); cen.userData.setSpin(p>0.26 && p<0.8 ? 24 : 0);
      } else if(p<0.12){                        // 1 · LOADED in its slot (lid open); the lid closes
        if(!docked){ undock(); inPath(v,1); } dock(); cen.userData.setSpin(0); cen.userData.setLid(p<0.04);
      } else if(p<0.86){                        // 2 · lid closed + SPINNING — the sample rides the rotor
        dock(); cen.userData.setSpin(24); cen.userData.setLid(false);
      } else {                                  // 3 · rotor stops; lid opens — the tube is still in its slot
        dock(); cen.userData.setSpin(0); cen.userData.setLid(p>0.93);
      }
      if(o.lEnd!=null) v.userData.setLevel(lerp(o.lStart==null?0.5:o.lStart, o.lEnd, easeInOut(clamp(p,0,1))));
    };
  }

export { held, stationSpin }
