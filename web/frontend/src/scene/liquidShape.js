// liquidShape.js — the drawn INNER SHAPE of every vessel that holds liquid, and the one rule
// that turns a volume into a level:
//
//   a volume, as a fraction of the vessel's NOMINAL capacity, fills the SAME fraction of the
//   vessel's DRAWN inner volume (from its liquid floor to its drawn full line).
//
// No vessel is resized: the drawn shapes are the builders' own profiles (moved here verbatim so
// the builder and this module can never disagree). The level a builder takes (`setLevel`) is
// its own height parameter; `levelFor` inverts the drawn volume to find it. Pure math — no DOM.
import * as THREE from 'three'

/* ---- liquid that CONFORMS to its vessel's interior ---------------------
   A vessel's glass is a lathe of a 2D profile (x = radius, y = height). Its
   liquid must obey the SAME contour, not a floating cylinder. `innerRadiusFn`
   samples that profile (slightly inset so the fluid reads as inside the wall);
   `liquidProfileGeo` revolves the inner profile from the vessel bottom up to
   the fill line and caps it FLAT there — wide where the vessel is wide,
   narrow where it tapers, no dome. */
export function innerRadiusFn(profPts, inset){
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
export var PROFILE_STEPS = 16;
export function liquidProfileGeo(innerR, y0, yTop, seg){
  seg = seg||48;
  if(yTop <= y0+1e-5) yTop = y0+1e-5;   // (was 0.001: a floor that held 0.7 µl in a column's wide cup)
  var steps=PROFILE_STEPS, pts=[], i;
  pts.push(new THREE.Vector2(0.0006, y0));                 // centre of the bottom
  for(i=0;i<=steps;i++){
    var y=y0+(yTop-y0)*(i/steps);
    pts.push(new THREE.Vector2(Math.max(innerR(y),0.0008), y));   // follow the inner wall
  }
  pts.push(new THREE.Vector2(0.0006, yTop));               // flat top at the fill line
  return new THREE.LatheGeometry(pts, seg);
}

// ── the builders' profiles (verbatim) ──
// microtube: rounded bell bottom, conical shoulder, straight body, flared rim
export function tubeProfile(H, R){
  return [
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
}
// spin column: the collection tube's outer wall (rounded U-shaped bottom) …
export function collectionProfile(){
  return [
    new THREE.Vector2(0.0,0.0), new THREE.Vector2(0.075,0.012), new THREE.Vector2(0.145,0.05),
    new THREE.Vector2(0.21,0.12), new THREE.Vector2(0.265,0.22), new THREE.Vector2(0.30,0.36),
    new THREE.Vector2(0.32,0.60), new THREE.Vector2(0.32,0.98), new THREE.Vector2(0.335,1.0)
  ];
}
// … and the column's cup (membrane at y 0.9)
export function columnCupProfile(){
  return [
    new THREE.Vector2(0.14,0.86), new THREE.Vector2(0.2,0.9), new THREE.Vector2(0.27,1.02),
    new THREE.Vector2(0.28,1.5), new THREE.Vector2(0.3,1.56)
  ];
}
export function bottleProfile(h){
  return [
    new THREE.Vector2(0.001,0), new THREE.Vector2(0.34,0.02), new THREE.Vector2(0.36,0.08),
    new THREE.Vector2(0.36,h*0.72), new THREE.Vector2(0.3,h*0.82), new THREE.Vector2(0.16,h*0.9),
    new THREE.Vector2(0.15,h), new THREE.Vector2(0.155,h+0.005)
  ];
}

// The volume of the lathe `liquidProfileGeo` draws, from the SAME 16 wall samples it revolves
// (a stack of frustums), as a perfect solid of revolution. The drawn mesh is a 44–48-gon, which
// scales every volume by one constant — it cancels in every fraction below.
export function latheVolume(innerR, y0, yTop){
  if(yTop <= y0+1e-5) yTop = y0+1e-5;
  var v=0, steps=PROFILE_STEPS, ya=y0, ra=Math.max(innerR(y0),0.0008);
  for(var i=1;i<=steps;i++){
    var yb=y0+(yTop-y0)*(i/steps), rb=Math.max(innerR(yb),0.0008);
    v += Math.PI*(yb-ya)/3*(ra*ra+ra*rb+rb*rb);
    ya=yb; ra=rb;
  }
  return v;
}

// Pipette tip liquid (buildPipette): a frustum of height h = 0.66·fill whose top radius follows
// the tip's inner cone, 0.92·(0.014 + 0.06·h), and whose foot is 0.016/0.058 of its top.
export function tipVolumeAtFill(fill){
  var h=Math.max(0,fill)*0.66, rt=0.92*(0.014+0.06*h), rb=rt*0.016/0.058;
  return Math.PI*h/3*(rt*rt+rt*rb+rb*rb);
}

// level ∈ [0, max] whose drawn volume is `frac` of the drawn volume at the full line
export function invert(volAt, full, frac, max){
  max = max==null?1:max;
  if(!(frac>0)) return 0;
  var target=frac*full;
  if(volAt(max) <= target) return max;
  var lo=0, hi=max;
  for(var k=0;k<50;k++){ var mid=(lo+hi)/2; if(volAt(mid)<target) lo=mid; else hi=mid; }
  return (lo+hi)/2;
}

// ── each liquid-holding vessel: nominal capacity (µl) + drawn volume as a function of the
// builder's own level parameter. `full` = the level of the drawn full line. ──
// Capacities: 1.5 mL microtube (std), RNeasy column 700 µl max load (QIAGEN spec), 2 mL
// collection tube (QIAGEN spec), 2 mL cryovial (std), 360 µl per 96-well well (std, ANSI/SLAS
// 96-well flat bottom), 200 µl tip (the pipette is drawn as a P200 — its own decal),
// T-25 flask ≈ 70 mL (est: 25 cm² growth area × ~28 mm internal height), 90 mm dish ≈ 80 mL
// (est: 63.6 cm² × ~12.5 mm), media bottle 250 mL to the shoulder (est: a standard media bottle).
export function tubeShape(H, R, capacityUl){
  var inner=innerRadiusFn(tubeProfile(H,R),0.90), y0=0.03, yMax=H*0.90;
  return { capacityUl: capacityUl||1500, full:1,
    volAt:function(lv){ return latheVolume(inner, y0, y0+lv*(yMax-y0)); } };
}
export function columnShape(){
  var inner=innerRadiusFn(columnCupProfile(),0.90), y0=0.90, yMax=1.44;
  return { capacityUl:700, full:1, volAt:function(lv){ return latheVolume(inner, y0, y0+lv*(yMax-y0)); } };
}
// the collection tube's flow-through: from its floor (0.018) to its rim (0.98) = 2 mL
export var COLL_Y0=0.018, COLL_YMAX=0.98;
export function collectionShape(){
  var inner=innerRadiusFn(collectionProfile(),0.90);
  return { capacityUl:2000, full:1, volAt:function(lv){ return latheVolume(inner, COLL_Y0, COLL_Y0+lv*(COLL_YMAX-COLL_Y0)); } };
}
// straight-walled liquids drawn as a scaled cylinder / box: volume ∝ level. `full` is the level
// at which the liquid fills the vessel's drawn interior (the builder caps level at 1 for
// its usual layer, so a flask's drawn interior is 3.375 of its 0.16 layer: 0.54 / 0.16).
export function linearShape(capacityUl, full){
  return { capacityUl:capacityUl, full:full, volAt:function(lv){ return lv; } };
}
// a P200's tip holds 200 µl, a P1000's 1000 µl: the P1000 is the same pipette drawn larger, so its
// tip's drawn volume follows the same curve of its fill — only the nominal capacity differs
export function tipShape(capacityUl){ return { capacityUl:capacityUl||200, full:1, volAt:tipVolumeAtFill }; }
// a reagent bottle: its liquid is one lathe scaled in height, so volume ∝ scale; its drawn line
// (0.55 h) holds the share of 250 mL that the drawn volume below the line is of the drawn volume
// below the shoulder (0.72 h)
export function bottleStockUl(h){
  h=h||1.3; var inner=innerRadiusFn(bottleProfile(h),0.90);
  return 250000*latheVolume(inner,0.02,h*0.55)/latheVolume(inner,0.02,h*0.72);
}

// the builder level that draws `ul` in `shape`
export function levelFor(shape, ul){
  var frac=Math.max(0,ul)/shape.capacityUl;
  return invert(shape.volAt, shape.volAt(shape.full), frac, Math.max(1, shape.full));
}
// …and back: the µl a level draws (the drawn volume as a share of the drawn full volume)
export function volumeAt(shape, level){
  return shape.capacityUl*shape.volAt(level)/shape.volAt(shape.full);
}
