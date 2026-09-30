// instruments/staining.js — extracted VERBATIM from demoScene.js (the hand-built demo's builder library):
// the slide staining tray. Every body below is byte-identical to its original; only the module boundary
// (imports / exports / the per-builder random-stream wraps) is new.
/* eslint-disable */
import { streams } from '../rng.js'
import * as THREE from 'three'
import { dims } from '../dims.js'
import { addSocket } from '../sockets.js'
import { makeLabel } from '../labels.js'
import { matPlastic } from '../materials.js'
import { fitArt, fx, tagSpec } from '../modelKit.js'

  function buildStainingTray(){
    var grp=new THREE.Group();
    var tray=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.24,1.3), matPlastic(0x394049));
    tray.position.y=0.12; tray.castShadow=true; tray.receiveShadow=true; grp.add(tray);
    var well=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.001,1.1), new THREE.MeshStandardMaterial({ color:0x20262d, roughness:0.8, side:THREE.DoubleSide }));
    well.position.y=0.2405; fx(well,'decal'); grp.add(well);        // the dark drip well, printed on the tray top
    var label=makeLabel("Staining tray",""); label.position.set(0,0.9,0); grp.add(label);
    grp.userData.label=label; grp.userData.update=function(){};
    var D=dims('staining_tray'), SL=dims('slide_iso8037');
    var root=fitArt(grp,'staining_tray',{ size:{ height:D.tray_height } });
    // two RAILS the slide BRIDGES, lengthwise: spaced inside the slide's REAL length so it
    // rests on both (they stood 80 mm apart under a 76 mm slide that lay along them)
    var RH=D.rail_height, RW=RH*0.4, SPAN=SL.width*0.6;
    for(var s=0;s<2;s++){ var rail=new THREE.Mesh(new THREE.BoxGeometry(D.width*0.9,RH,RW), matPlastic(0x596270));
      rail.position.set(0,D.tray_height+RH/2,(s?1:-1)*SPAN/2); root.add(rail); }
    // the slide lies ACROSS the rails: its length along z (socket turned 90° about y)
    addSocket(root,'rails',{ position:new THREE.Vector3(0,D.tray_height+RH,0), quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2) });
    root.userData.sampleSocket='rails';
    return tagSpec(root,'staining_tray');
  }

// per-builder seeded random streams (rng.js) — the same names as before the split
buildStainingTray = streams.wrap('buildStainingTray', buildStainingTray)

export { buildStainingTray }
