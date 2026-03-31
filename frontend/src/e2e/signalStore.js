import { Direction } from '@privacyresearch/libsignal-protocol-typescript'
import { idbDel, idbGet, idbKeys, idbSet } from './idb.js'

const K = {
  registrationId: 'signal:registrationId',
  identityKeyPair: 'signal:identityKeyPair',
  identity: (addr) => `signal:identity:${addr}`,
  preKey: (id) => `signal:preKey:${String(id)}`,
  signedPreKey: (id) => `signal:signedPreKey:${String(id)}`,
  session: (addr) => `signal:session:${addr}`,
  // Legacy (group-only) key namespace kept for backward compatibility.
  senderKeyLegacy: (groupId) => `signal:senderKey:${String(groupId)}`,
  // Sender-key protocol requires one key per (group, sender).
  senderKeyBySender: (groupId, senderId) => `signal:senderKey:${String(groupId)}:${String(senderId)}`,
}

/**
 * Implements the library StorageType interface using IndexedDB.
 * Values are stored as structured-cloneable JS objects containing ArrayBuffers.
 */
export class SignalProtocolIDBStore {
  async getIdentityKeyPair() {
    return (await idbGet(K.identityKeyPair)) || undefined
  }

  async getLocalRegistrationId() {
    return (await idbGet(K.registrationId)) || undefined
  }

  async isTrustedIdentity(identifier, identityKey /* ArrayBuffer */, _direction /* Direction */) {
    const existing = await idbGet(K.identity(identifier))
    if (!existing) return true
    try {
      const a = new Uint8Array(existing)
      const b = new Uint8Array(identityKey)
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
      return true
    } catch {
      return false
    }
  }

  async saveIdentity(encodedAddress, publicKey /* ArrayBuffer */) {
    const key = K.identity(encodedAddress)
    const existing = await idbGet(key)
    await idbSet(key, publicKey)
    // Return true if it changed.
    if (!existing) return false
    const a = new Uint8Array(existing)
    const b = new Uint8Array(publicKey)
    if (a.length !== b.length) return true
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true
    return false
  }

  async loadPreKey(keyId) {
    return (await idbGet(K.preKey(keyId))) || undefined
  }

  async storePreKey(keyId, keyPair) {
    await idbSet(K.preKey(keyId), keyPair)
  }

  async removePreKey(keyId) {
    await idbDel(K.preKey(keyId))
  }

  async loadSignedPreKey(keyId) {
    return (await idbGet(K.signedPreKey(keyId))) || undefined
  }

  async storeSignedPreKey(keyId, keyPair) {
    await idbSet(K.signedPreKey(keyId), keyPair)
  }

  async removeSignedPreKey(keyId) {
    await idbDel(K.signedPreKey(keyId))
  }

  async storeSession(encodedAddress, record) {
    await idbSet(K.session(encodedAddress), record)
  }

  async loadSession(encodedAddress) {
    return (await idbGet(K.session(encodedAddress))) || undefined
  }

  // ---- Custom group sender-key storage (not part of libsignal StorageType) ----
  async getGroupSenderKey(groupId, senderId) {
    if (senderId !== undefined && senderId !== null) {
      return (await idbGet(K.senderKeyBySender(groupId, senderId))) || null
    }
    return (await idbGet(K.senderKeyLegacy(groupId))) || null
  }

  async setGroupSenderKey(groupId, senderId, value) {
    if (value === undefined) {
      await idbSet(K.senderKeyLegacy(groupId), senderId)
      return
    }
    await idbSet(K.senderKeyBySender(groupId, senderId), value)
  }

  async clearAllSessions() {
    const keys = await idbKeys('signal:session:')
    await Promise.all(keys.map((k) => idbDel(k)))
  }
}

export { Direction }

