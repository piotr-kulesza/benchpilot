// pipetting.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the held pipette: its rest, its run, and the single-reagent station. Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import * as THREE from 'three'
import { solidBox } from './solids.js'
import { clearance } from './dims.js'
import { placeOnBench } from './sockets.js'
import { addBottle } from './bench.js'
import { COL } from './palette.js'
import { buildPipette } from './props.js'
import { SAMPLE, getSample, scene } from './sample.js'
import { clamp, easeInOut, lerp } from './util.js'


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

export { DISPENSE_FROM, DISPENSE_TO, dispenseProgress, cruiseY, pipetteRun, addPipetteRig, restPoint, pipRest, stationReagent }
