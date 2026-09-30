// labels.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// floating name plates and the bench number decal. Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from './rng.js'
import * as THREE from 'three'
import { MAX_ANISO, roundRect } from './util.js'

  // floating vessel label — muted editorial card
  // The floating station label. The plate is sized FROM the measured text (never a
  // fixed sprite the text can overflow) — it grows to fit, the text never shrinks or
  // clips, and the two-line case (name + volume) grows the plate taller. The name is
  // IBM Plex Sans; the sub line is a numeric/spec (volume, ×g, temp) so it uses IBM
  // Plex Mono. Requires the faces loaded before first draw (StationView gates the
  // canvas on document.fonts.ready) — else measureText + fillText bake the fallback.
  function makeLabel(text, sub){
    var SS=2;                              // supersample the canvas for crisp text
    var FS=42*SS, FSS=26*SS;               // main / sub px
    var PADX=40*SS, PADY=26*SS, GAP=10*SS, LG=6*SS, RAD=16*SS;  // pad / line gaps
    var MAXW=680*SS, MINW=300*SS;          // wrap past MAXW; short labels get MINW presence
    var PIX=0.0032/SS;                     // world units per device px (overall label size)
    var FMAIN="500 "+FS+"px 'IBM Plex Sans'";
    var FSUB="500 "+FSS+"px 'IBM Plex Mono'";
    var c=document.createElement("canvas");
    var g=c.getContext("2d");
    var tex=null, sp=null;
    // wrap `t` to lines that fit `maxW` in the current font — never shrink a glyph,
    // grow DOWN instead (a long reagent name wraps rather than blowing the plate wide).
    function wrap(t, font, maxW){
      g.font=font;
      var words=String(t||"").split(/\s+/).filter(Boolean), lines=[], cur="";
      for(var i=0;i<words.length;i++){
        var t2=cur?cur+" "+words[i]:words[i];
        if(cur && g.measureText(t2).width>maxW){ lines.push(cur); cur=words[i]; }
        else cur=t2;
      }
      if(cur) lines.push(cur);
      return lines;
    }
    function widest(lines, font){ g.font=font; var w=0; for(var i=0;i<lines.length;i++) w=Math.max(w,g.measureText(lines[i]).width); return w; }
    function draw(t2,s2){
      // NOTHING to say -> NO plate: an empty label used to paint a blank dark bar that
      // floated over the vessel (the cryovial) carrying no information
      if(!String(t2||"").trim() && !String(s2||"").trim()){
        c.width=4; c.height=4; g=c.getContext("2d"); g.clearRect(0,0,4,4);
        if(tex) tex.needsUpdate=true;
        if(sp){ sp.scale.set(0.0001,0.0001,1); sp.userData.worldH=0; }
        return;
      }
      var mLines=wrap(t2, FMAIN, MAXW);          // name (may wrap)
      var sLines=s2?wrap(s2, FSUB, MAXW):[];      // volume / spec (mono, may wrap)
      var textW=Math.max(widest(mLines,FMAIN), widest(sLines,FSUB));
      var mH=mLines.length*FS + (mLines.length-1)*LG;
      var sH=sLines.length?(sLines.length*FSS + (sLines.length-1)*LG):0;
      var textH=mH + (sLines.length?GAP+sH:0);
      var cw=Math.ceil(Math.max(textW,MINW)+PADX*2), ch=Math.ceil(textH+PADY*2);
      c.width=cw; c.height=ch; g=c.getContext("2d");   // resize resets the context
      g.clearRect(0,0,cw,ch);
      var b=1.5*SS;
      g.fillStyle="rgba(20,23,27,0.82)"; roundRect(g,b,b,cw-2*b,ch-2*b,RAD); g.fill();
      g.lineWidth=b; g.strokeStyle="rgba(150,160,175,0.28)"; roundRect(g,b,b,cw-2*b,ch-2*b,RAD); g.stroke();
      g.textAlign="center"; g.textBaseline="middle";
      var y=PADY;
      g.fillStyle="#e9edf1"; g.font=FMAIN;
      for(var i=0;i<mLines.length;i++){ g.fillText(mLines[i], cw/2, y+FS/2); y+=FS+LG; }
      if(sLines.length){ y+=GAP-LG; g.fillStyle="#8fcabf"; g.font=FSUB;
        for(var j=0;j<sLines.length;j++){ g.fillText(sLines[j], cw/2, y+FSS/2); y+=FSS+LG; } }
      if(tex) tex.needsUpdate=true;
      if(sp){ sp.scale.set(cw*PIX, ch*PIX, 1); sp.userData.worldH=ch*PIX; }
    }
    draw(text, sub);                       // size + paint the canvas once
    tex=new THREE.CanvasTexture(c); tex.anisotropy=MAX_ANISO;
    sp=new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false, depthWrite:false }));
    sp.renderOrder=999;
    if(c.width>4){ sp.scale.set(c.width*PIX, c.height*PIX, 1); sp.userData.worldH=c.height*PIX; }
    else { sp.scale.set(0.0001,0.0001,1); sp.userData.worldH=0; }
    sp.userData.update=function(t2,s2){ draw(t2,s2); };
    return sp;
  }


  function stationDecal(n){
    var c=document.createElement("canvas"); c.width=256; c.height=128; var g=c.getContext("2d");
    g.clearRect(0,0,256,128);
    // dark slate on the pale bench so the number actually reads (Stage-13 #4 — the old
    // 0.5-alpha grey vanished against the greige resin).
    g.fillStyle="rgba(58,68,82,0.9)"; g.font="500 74px 'IBM Plex Sans'"; g.textAlign="left"; g.textBaseline="middle";
    g.fillText(("0"+n).slice(-2), 12, 70);
    g.strokeStyle="rgba(64,150,138,0.9)"; g.lineWidth=5; g.beginPath(); g.moveTo(14,104); g.lineTo(150,104); g.stroke();
    var t=new THREE.CanvasTexture(c); t.anisotropy=MAX_ANISO;
    var m=new THREE.Mesh(new THREE.PlaneGeometry(1.7,0.85), new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));
    m.rotation.x=-Math.PI/2; return m;
  }

// per-builder seeded random streams (rng.js) — the same names as before the split
makeLabel = streams.wrap('makeLabel', makeLabel)

export { makeLabel, stationDecal }
