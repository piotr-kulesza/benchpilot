// liquid.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// liquids that conform to their vessel, and the sample-liquid contract. Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import * as THREE from 'three'
import { COL } from './palette.js'
import { clamp, lerp } from './util.js'


  // vertical vertex-colour gradient for a liquid volume
  function tintGradient(geo, lo, hi){
    var p=geo.attributes.position, n=p.count;
    var col=new Float32Array(n*3);
    var ymin=Infinity, ymax=-Infinity, i;
    for(i=0;i<n;i++){ var y=p.getY(i); if(y<ymin)ymin=y; if(y>ymax)ymax=y; }
    var span=(ymax-ymin)||1;
    for(i=0;i<n;i++){
      var t=(p.getY(i)-ymin)/span, v=lerp(lo,hi,t);
      col[i*3]=v; col[i*3+1]=v; col[i*3+2]=v;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col,3));
  }

  /* ---- liquid that CONFORMS to its vessel's interior ---------------------
     A vessel's glass is a lathe of a 2D profile (x = radius, y = height). Its
     liquid must obey the SAME contour, not a floating cylinder. `innerRadiusFn`
     samples that profile (slightly inset so the fluid reads as inside the wall);
     `liquidProfileGeo` revolves the inner profile from the vessel bottom up to
     the fill line and caps it FLAT there — wide where the vessel is wide,
     narrow where it tapers, no dome. */
  function innerRadiusFn(profPts, inset){
    inset = (inset==null)?0.9:inset;
    return function(y){
      if(y<=profPts[0].y) return profPts[0].x*inset;
      for(var i=1;i<profPts.length;i++){
        if(y<=profPts[i].y){
          var a=profPts[i-1], b=profPts[i], t=(y-a.y)/((b.y-a.y)||1);
          return (a.x+(b.x-a.x)*t)*inset;
        }
      }
      return profPts[profPts.length-1].x*inset;
    };
  }
  function liquidProfileGeo(innerR, y0, yTop, seg){
    seg = seg||48;
    if(yTop <= y0+0.001) yTop = y0+0.001;
    var steps=16, pts=[], i;
    pts.push(new THREE.Vector2(0.0006, y0));                 // centre of the bottom
    for(i=0;i<=steps;i++){
      var y=y0+(yTop-y0)*(i/steps);
      pts.push(new THREE.Vector2(Math.max(innerR(y),0.0008), y));   // follow the inner wall
    }
    pts.push(new THREE.Vector2(0.0006, yTop));               // flat top at the fill line
    return new THREE.LatheGeometry(pts, seg);
  }

  // ─── Stage-8 container vessels (the sample-follow model shows exactly one) ───
  // Shared liquid state matching buildTube's contract: setLevel/setColor/setLabel +
  // an update() that lerps and calls apply(liq, level, color). Stylized (no
  // transmission, no postprocessing) — reuses the demo's mat* helpers throughout.
  function attachSampleLiquid(grp, liq, apply, label, level0){
    var L0=(level0==null?0.35:level0);
    var st={ level:L0, tLevel:L0, color:new THREE.Color(COL.lysis), tColor:new THREE.Color(COL.lysis) };
    grp.userData.label=label||null;
    grp.userData.setLevel=function(v){ st.tLevel=clamp(v,0,1); };
    grp.userData.setColor=function(h){ st.tColor.set(h); };
    grp.userData.setLabel=function(t,s){ if(grp.userData.label) grp.userData.label.userData.update(t,s||""); };
    grp.userData.update=function(dt){
      st.level=lerp(st.level,st.tLevel,1-Math.pow(0.001,dt));
      st.color.lerp(st.tColor,1-Math.pow(0.004,dt));
      apply(liq, st.level, st.color, st);
    };
    return st;
  }
  function liquidMat(){
    return new THREE.MeshPhysicalMaterial({ color:COL.lysis, roughness:0.32, metalness:0,
      emissive:COL.lysis, emissiveIntensity:0.12, clearcoat:0.3, clearcoatRoughness:0.4, envMapIntensity:0.6 });
  }

  // THE LEVEL THAT HOLDS A VOLUME: the liquid fills the vessel's inner profile (`innerR`,
  // drawing units) from y0 up; returns the fill fraction of [y0, yMax] whose volume is `ul`
  // microlitres — 1 world unit = 100 mm, so 1 world unit³ = 10⁶ mm³ = 10⁶ µL. `sr` / `sy`
  // scale the drawing's radius / height to world units (1 for a vessel drawn at real size).
  function levelForVolume(innerR, y0, yMax, ul, sr, sy){
    sr = sr||1; sy = sy||1;
    var want = Math.max(0, ul)/1e6, N = 400, dy = (yMax-y0)/N, v = 0;
    for(var i=0;i<N;i++){
      var r = innerR(y0+(i+0.5)*dy)*sr, dv = Math.PI*r*r*dy*sy;
      if(v+dv >= want) return (i + (want-v)/dv)/N;
      v += dv;
    }
    return 1;
  }

export { tintGradient, innerRadiusFn, liquidProfileGeo, attachSampleLiquid, liquidMat, levelForVolume }
