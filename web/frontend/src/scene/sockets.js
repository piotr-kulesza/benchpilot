// sockets.js — SOCKETS INSTEAD OF COORDINATES. An instrument declares named mount points
// (a rotor slot, a block well, a shelf, a stage, a tank platform). Each socket is an anchor
// Object3D inside the instrument: its origin is the point the vessel's BASE CENTRE sits on,
// its +Y the vessel's up axis, and it lists the vessel classes (dimensions.json ids) it
// accepts. A vessel is PLACED INTO a socket — never positioned by typed coordinates — and a
// vessel class the socket does not accept is an ERROR (SocketError), not a wrong render.
// Pure three.js; no DOM.
import { Object3D, Vector3, Quaternion, Matrix4 } from 'three'
import { dims } from './dims.js'

export class SocketError extends Error {
  constructor(msg, info) { super(msg); this.name = 'SocketError'; this.info = info }
}

// declare a socket on `host`, anchored under `parent` (default the host; a rotor holder for
// a slot that spins). position/quaternion are in `parent`'s local frame.
export function addSocket(host, name, { parent = host, position = new Vector3(), quaternion = null, accepts, kind = 'floor' }) {
  const a = new Object3D()
  a.name = `socket:${name}`
  a.position.copy(position)
  if (quaternion) a.quaternion.copy(quaternion)
  a.userData.socket = { name, host, accepts, kind }
  parent.add(a)
  ;(host.userData.sockets || (host.userData.sockets = {}))[name] = a
  return a
}

export function getSocket(host, name) {
  const s = host && host.userData.sockets && host.userData.sockets[name]
  if (!s) throw new SocketError(`no socket "${name}" on ${host?.userData?.spec || host?.name || 'host'}`, { name })
  return s
}
export const socketNames = (host) => Object.keys((host && host.userData.sockets) || {})

// accepts list: the socket's own, else the host's dimensions.json `accepts`
export function socketAccepts(anchor) {
  const s = anchor.userData.socket
  if (s.accepts) return s.accepts
  const spec = s.host?.userData?.spec
  return spec ? dims(spec).accepts : []
}

export function canPlace(vessel, host, name) {
  const a = host?.userData?.sockets?.[name]
  return !!(a && socketAccepts(a).includes(vessel.userData.spec))
}

// Where a socket is, in the frame of `frame` (the station group, usually): the point a
// vessel's base centre goes to, and the orientation of its up axis.
const _m = new Matrix4(), _inv = new Matrix4()
export function socketPose(anchor, frame = null) {
  anchor.updateWorldMatrix(true, false)
  _m.copy(anchor.matrixWorld)
  if (frame) { frame.updateWorldMatrix(true, false); _m.premultiply(_inv.copy(frame.matrixWorld).invert()) }
  const p = new Vector3(), q = new Quaternion(), s = new Vector3()
  _m.decompose(p, q, s)
  return { position: p, quaternion: q }
}

// Put `vessel` INTO host's socket `name`. Throws SocketError if the class is not accepted.
//  ride = true  → reparent into the anchor (it moves with the socket: a spinning rotor)
//  ride = false → leave it where it is in the graph; the caller moves it to the returned
//                 station-local pose (the travelling sample glides there)
export function placeInto(vessel, host, name, { ride = false, frame = null } = {}) {
  const a = getSocket(host, name)
  const acc = socketAccepts(a)
  if (!acc.includes(vessel.userData.spec)) {
    throw new SocketError(`${vessel.userData.spec || 'vessel'} does not fit socket "${name}" of ${host.userData.spec} (accepts ${acc.join(', ') || 'nothing'})`,
      { vessel: vessel.userData.spec, host: host.userData.spec, socket: name, accepts: acc })
  }
  vessel.userData.placement = { host: a.userData.socket.host, socket: name }  // the socket's OWN host (a rig's tank)
  if (ride) {
    a.add(vessel)
    vessel.position.set(0, 0, 0)
    vessel.quaternion.identity()
    // cancel the anchor's world scale so the vessel keeps its real size
    const ws = new Vector3(); a.getWorldScale(ws)
    vessel.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z)
    return socketPose(a, frame)
  }
  return socketPose(a, frame)
}

// the vessel stands on the bare bench (or is lifted out of a socket)
export function placeOnBench(obj) { obj.userData.placement = { host: 'bench', socket: null } }
export function clearPlacement(obj) { obj.userData.placement = null }
