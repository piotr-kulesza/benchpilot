// util.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// easing / clamping helpers and small canvas helpers. Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import * as THREE from 'three'


  /* helpers */
  function lerp(a,b,t){ return a + (b-a)*t; }
  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function easeInOut(t){ t=clamp(t,0,1); return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
  var MAX_ANISO = 8;

  function radialTex(stops){
    var c=document.createElement("canvas"); c.width=128; c.height=128;
    var g=c.getContext("2d");
    var grad=g.createRadialGradient(64,64,0,64,64,64);
    for(var i=0;i<stops.length;i++) grad.addColorStop(stops[i][0],stops[i][1]);
    g.fillStyle=grad; g.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  var GLOW_TEX = null, DUST_TEX = null;
  // muted "glow" — really just a soft, low-opacity light bloom (no neon)
  function addGlow(color, size, opacity){
    var m=new THREE.SpriteMaterial({ map:GLOW_TEX, color:color, transparent:true,
      opacity:opacity==null?0.18:opacity, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:true });
    var s=new THREE.Sprite(m); s.scale.set(size,size,1); return s;
  }

  function roundRect(g,x,y,w,h,r){
    g.beginPath();
    g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
    g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
  }

export { lerp, clamp, easeInOut, MAX_ANISO, radialTex, GLOW_TEX, DUST_TEX, addGlow, roundRect }
