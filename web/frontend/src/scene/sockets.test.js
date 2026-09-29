import { describe, it, expect } from 'vitest'
import { Group, Vector3 } from 'three'
import { addSocket, placeInto, canPlace, SocketError, socketPose } from './sockets.js'

const host = () => { const h = new Group(); h.userData.spec = 'dry_block_heater'; return h }
const vessel = (spec) => { const v = new Group(); v.userData.spec = spec; return v }

describe('sockets', () => {
  it('places an accepted vessel at the socket and records the placement', () => {
    const h = host(); h.position.set(2, 0, 0)
    addSocket(h, 'well', { position: new Vector3(0.1, 0.2, 0), accepts: ['microtube_1_5'] })
    const v = vessel('microtube_1_5')
    const pose = placeInto(v, h, 'well')
    expect(pose.position.toArray()).toEqual([2.1, 0.2, 0])
    expect(v.userData.placement.host).toBe(h)
    expect(v.userData.placement.socket).toBe('well')
  })

  it('a vessel class the socket does not accept is an ERROR, not a render', () => {
    const h = host()
    addSocket(h, 'well', { accepts: ['pcr_tube_0_2'] })
    const v = vessel('microtube_1_5')
    expect(canPlace(v, h, 'well')).toBe(false)
    expect(() => placeInto(v, h, 'well')).toThrow(SocketError)
    expect(v.userData.placement).toBeUndefined()
  })

  it('an unknown socket is an error', () => {
    expect(() => placeInto(vessel('microtube_1_5'), host(), 'nope')).toThrow(SocketError)
  })

  it('ride=true parents the vessel into the socket and cancels its world scale', () => {
    const h = host(); const holder = new Group(); holder.scale.setScalar(0.5); h.add(holder)
    addSocket(h, 'slot', { parent: holder, accepts: ['microtube_1_5'] })
    const v = vessel('microtube_1_5')
    placeInto(v, h, 'slot', { ride: true })
    const ws = new Vector3(); v.getWorldScale(ws)
    expect(ws.x).toBeCloseTo(1); expect(ws.y).toBeCloseTo(1)
  })

  it('socketPose is relative to a frame', () => {
    const st = new Group(); st.position.set(8.4, 0, 0)
    const h = host(); h.position.set(1, 0, 0); st.add(h)
    const a = addSocket(h, 'well', { position: new Vector3(0, 0.3, 0), accepts: ['microtube_1_5'] })
    expect(socketPose(a, st).position.toArray()).toEqual([1, 0.3, 0])
  })
})
