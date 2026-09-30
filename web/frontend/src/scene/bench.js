// bench.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// bench layout (footprint slots, the back row) and reagent sources. Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import * as THREE from 'three'
import { solidBox } from './solids.js'
import { dims, clearance } from './dims.js'
import { placeOnBench } from './sockets.js'
import { buildBottle } from './props.js'
import { buildTube } from './vessels.js'


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

export { benchExtents, benchPlace, benchSlot, backRowPlace, layoutBackRow, smallVolume, addBottle }
