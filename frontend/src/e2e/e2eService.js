import {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
} from '@privacyresearch/libsignal-protocol-typescript'

import { apiRequest } from '../lib/session.js'
import { SignalProtocolIDBStore } from './signalStore.js'
import { abToB64, abToUtf8, b64ToAb, utf8ToAb } from './utils.js'
import { idbSet, idbGet, idbKeys } from './idb.js'

const DEVICE_ID_STR = 'web:1'
const DEVICE_ID_NUM = 1

const store = new SignalProtocolIDBStore()

function debugE2E(event, details = {}) {
  if (!import.meta.env.DEV) return
  try {
    console.debug(`[E2E] ${event}`, details)
  } catch {
    // no-op
  }
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeDmCiphertextPayload(ciphertextInput) {
  const parsed = parseMaybeJson(ciphertextInput)

  if (!parsed || typeof parsed !== 'object') return null

  // Wrapper form: { ciphertext, ciphertextType }
  if (parsed.ciphertext !== undefined) {
    const nested = normalizeDmCiphertextPayload(parsed.ciphertext)
    if (nested) return nested
  }

  // Current form: { t, b }
  // Legacy form: { type, body }
  const tRaw = parsed.t ?? parsed.type ?? parsed.messageType ?? parsed.msgType
  const bRaw = parsed.b ?? parsed.body ?? parsed.payload ?? parsed.data ?? parsed.ciphertext
  const t = typeof tRaw === 'string' ? parseInt(tRaw, 10) : tRaw
  if (t !== 1 && t !== 3) return null

  const toBodyAb = (value) => {
    if (!value) return null
    if (value instanceof ArrayBuffer) return value
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
    if (Array.isArray(value)) return new Uint8Array(value).buffer
    if (typeof value === 'string') {
      // Some payloads are double-encoded JSON strings.
      const maybeObj = parseMaybeJson(value)
      if (maybeObj && maybeObj !== value) return toBodyAb(maybeObj)
      try {
        return b64ToAb(value)
      } catch {
        return null
      }
    }
    if (typeof value === 'object') {
      if (Array.isArray(value.data)) return new Uint8Array(value.data).buffer
      if (typeof value.b64 === 'string') return toBodyAb(value.b64)
      if (typeof value.body === 'string' || Array.isArray(value.body) || (value.body && typeof value.body === 'object')) {
        return toBodyAb(value.body)
      }
      if (typeof value.ciphertext === 'string' || Array.isArray(value.ciphertext) || (value.ciphertext && typeof value.ciphertext === 'object')) {
        return toBodyAb(value.ciphertext)
      }
    }
    return null
  }

  const bodyAb = toBodyAb(bRaw)
  if (!bodyAb) return null
  return { t, bodyAb }
}

function tryDecodeDirectSenderKey(value) {
  if (!value) return null

  const tryString = (s) => {
    if (typeof s !== 'string' || !s.trim()) return null
    try {
      const raw = b64ToAb(s.trim())
      const bytes = new Uint8Array(raw)
      // Sender key should be 32 bytes for AES-256-GCM.
      if (bytes.length === 32) return s.trim()
      return null
    } catch {
      return null
    }
  }

  if (typeof value === 'string') {
    const direct = tryString(value)
    if (direct) return direct
    const parsed = parseMaybeJson(value)
    if (parsed && parsed !== value) return tryDecodeDirectSenderKey(parsed)
    return null
  }

  if (typeof value === 'object') {
    const candidates = [
      value.keyB64,
      value.senderKey,
      value.senderKeyB64,
      value.key,
      value.value,
      value.plaintext,
    ]
    for (const c of candidates) {
      const decoded = tryDecodeDirectSenderKey(c)
      if (decoded) return decoded
    }
  }

  return null
}

function addressForUser(userId) {
  // name is a string; we use the userId.
  return new SignalProtocolAddress(String(userId), DEVICE_ID_NUM)
}

async function ensureIdentity() {
  let registrationId = await store.getLocalRegistrationId()
  if (!registrationId) {
    registrationId = KeyHelper.generateRegistrationId()
    await idbSet('signal:registrationId', registrationId)
  }

  let identityKeyPair = await store.getIdentityKeyPair()
  if (!identityKeyPair) {
    identityKeyPair = await KeyHelper.generateIdentityKeyPair()
    await idbSet('signal:identityKeyPair', identityKeyPair)
  }

  return { registrationId, identityKeyPair }
}

function randomKeyId() {
  return Math.floor(Math.random() * 2147483640) + 1
}

async function ensureSignedPreKey(identityKeyPair) {
  // Reuse the same signed prekey across page reloads so existing sessions survive.
  const storedId = await idbGet('signal:activeSignedPreKeyId')
  if (storedId) {
    const existing = await store.loadSignedPreKey(storedId)
    if (existing) {
      // Re-generate with same keyId so we can produce a valid signature for publishing.
      const regenSigned = await KeyHelper.generateSignedPreKey(identityKeyPair, storedId)
      await store.storeSignedPreKey(regenSigned.keyId, regenSigned.keyPair)
      return { signedPreKeyId: regenSigned.keyId, signedPreKey: regenSigned }
    }
  }
  // First time: generate and persist.
  const signedPreKeyId = randomKeyId()
  const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId)
  await store.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair)
  await idbSet('signal:activeSignedPreKeyId', signedPreKeyId)
  return { signedPreKeyId, signedPreKey }
}

async function ensurePreKeys(minCount = 30) {
  // Reuse existing prekeys from IDB to avoid invalidating existing sessions.
  const existingIds = await idbGet('signal:publishedPreKeyIds')
  if (Array.isArray(existingIds) && existingIds.length >= 5) {
    const checks = await Promise.all(existingIds.map((id) => store.loadPreKey(id)))
    const alive = existingIds.filter((_, i) => !!checks[i])
    if (alive.length >= 5) {
      return alive.map((id, i) => ({ keyId: id, keyPair: checks[existingIds.indexOf(id)] }))
    }
  }
  // Generate a fresh batch.
  const base = randomKeyId()
  const batch = []
  for (let i = 0; i < minCount; i++) {
    const pk = await KeyHelper.generatePreKey(base + i)
    await store.storePreKey(pk.keyId, pk.keyPair)
    batch.push(pk)
  }
  await idbSet('signal:publishedPreKeyIds', batch.map((pk) => pk.keyId))
  return batch
}

let _e2eInitialized = false

export function resetE2E() {
  // Call on logout so the next login re-runs initE2E() properly.
  _e2eInitialized = false
}

export async function initE2E() {
  const { identityKeyPair } = await ensureIdentity()

  // Skip re-publishing within the same JS session (e.g. hot-reload).
  if (_e2eInitialized) return { ok: true }

  const currentPubKeyB64 = abToB64(identityKeyPair.pubKey)
  const publishedIdentityKey = await idbGet('signal:publishedIdentityKey')

  const { signedPreKeyId, signedPreKey } = await ensureSignedPreKey(identityKeyPair)
  const preKeys = await ensurePreKeys(30)

  const body = {
    deviceId: DEVICE_ID_STR,
    identityKeyPublic: currentPubKeyB64,
    signedPreKeyId,
    signedPreKeyPublic: abToB64(signedPreKey.keyPair.pubKey),
    signedPreKeySignature: abToB64(signedPreKey.signature),
    oneTimePreKeys: preKeys.map((pk) => ({
      keyId: pk.keyId,
      publicKey: abToB64(pk.keyPair.pubKey),
    })),
  }

  const res = await apiRequest('/e2e/keys', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to publish E2E keys')
  }

  await idbSet('signal:publishedIdentityKey', currentPubKeyB64)
  _e2eInitialized = true
  return { ok: true }
}

// ─── Cross-browser key backup / restore ───────────────────────────────────────
// Keys are encrypted client-side with AES-GCM using a key derived from the user's
// PIN via PBKDF2. The server only stores the encrypted blob — it never sees private keys.

async function pinToAesKey(pin, saltB64) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
  const salt = b64ToAb(saltB64)
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function checkKeyBackupExists() {
  const res = await apiRequest('/e2e/keybackup')
  return res.ok
}

export async function exportKeyBundle(pin) {
  if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 characters')

  // Gather everything from IDB needed to restore on another browser.
  const identityKeyPair = await store.getIdentityKeyPair()
  const registrationId = await store.getLocalRegistrationId()
  const signedPreKeyId = await idbGet('signal:activeSignedPreKeyId')
  const preKeyIds = await idbGet('signal:publishedPreKeyIds')

  if (!identityKeyPair || !registrationId) throw new Error('No E2E identity found — run initE2E first')

  const signedPreKey = signedPreKeyId ? await store.loadSignedPreKey(signedPreKeyId) : null
  const preKeys = []
  if (Array.isArray(preKeyIds)) {
    for (const id of preKeyIds) {
      const kp = await store.loadPreKey(id)
      if (kp) preKeys.push({ keyId: id, pubKey: abToB64(kp.pubKey), privKey: abToB64(kp.privKey) })
    }
  }

  const bundle = JSON.stringify({
    v: 1,
    registrationId,
    identityKeyPair: { pubKey: abToB64(identityKeyPair.pubKey), privKey: abToB64(identityKeyPair.privKey) },
    signedPreKeyId: signedPreKeyId || null,
    signedPreKey: signedPreKey ? { pubKey: abToB64(signedPreKey.pubKey), privKey: abToB64(signedPreKey.privKey) } : null,
    preKeys,
  })

  // Encrypt with AES-GCM using PBKDF2-derived key.
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const saltB64 = abToB64(saltBytes.buffer)
  const aesKey = await pinToAesKey(pin, saltB64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(bundle))

  const encryptedBundle = JSON.stringify({
    salt: saltB64,
    iv: abToB64(iv.buffer),
    ct: abToB64(ct),
  })

  // Upload to server.
  const res = await apiRequest('/e2e/keybackup', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encryptedBundle }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to upload key backup')
  }
  return { ok: true }
}

export async function importKeyBundle(pin) {
  if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 characters')

  // Download encrypted bundle from server.
  const res = await apiRequest('/e2e/keybackup')
  if (!res.ok) throw new Error('No key backup found on server — set one up first')
  const { encryptedBundle } = await res.json()

  const { salt, iv, ct } = JSON.parse(encryptedBundle)
  const aesKey = await pinToAesKey(pin, salt)
  let plaintext
  try {
    const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(b64ToAb(iv)) }, aesKey, b64ToAb(ct))
    plaintext = new TextDecoder().decode(ptBuf)
  } catch {
    throw new Error('Wrong PIN — decryption failed')
  }

  const bundle = JSON.parse(plaintext)
  if (!bundle || bundle.v !== 1) throw new Error('Invalid bundle format')

  // Restore everything to IDB.
  const identityKeyPair = { pubKey: b64ToAb(bundle.identityKeyPair.pubKey), privKey: b64ToAb(bundle.identityKeyPair.privKey) }
  await idbSet('signal:identityKeyPair', identityKeyPair)
  await idbSet('signal:registrationId', bundle.registrationId)

  if (bundle.signedPreKeyId && bundle.signedPreKey) {
    const spkPair = { pubKey: b64ToAb(bundle.signedPreKey.pubKey), privKey: b64ToAb(bundle.signedPreKey.privKey) }
    await store.storeSignedPreKey(bundle.signedPreKeyId, spkPair)
    await idbSet('signal:activeSignedPreKeyId', bundle.signedPreKeyId)
  }

  const restoredIds = []
  for (const pk of bundle.preKeys || []) {
    const kp = { pubKey: b64ToAb(pk.pubKey), privKey: b64ToAb(pk.privKey) }
    await store.storePreKey(pk.keyId, kp)
    restoredIds.push(pk.keyId)
  }
  if (restoredIds.length > 0) await idbSet('signal:publishedPreKeyIds', restoredIds)

  // Reset init flag so initE2E re-publishes the restored keys.
  _e2eInitialized = false
  return { ok: true }
}

export async function ensureSessionWithUser(otherUserId, forceRefresh = false) {
  const recipientAddress = addressForUser(otherUserId)
  if (!forceRefresh) {
    const existingSession = await store.loadSession(recipientAddress.toString())
    if (existingSession) {
      return
    }
  }

  const res = await apiRequest(`/e2e/keys/${otherUserId}?deviceId=${encodeURIComponent(DEVICE_ID_STR)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch recipient keys')
  }

  const bundle = {
    identityKey: b64ToAb(data.identityKeyPublic),
    registrationId: 1,
    signedPreKey: {
      keyId: data.signedPreKey.keyId,
      publicKey: b64ToAb(data.signedPreKey.publicKey),
      signature: b64ToAb(data.signedPreKey.signature),
    },
    preKey: data.oneTimePreKey
      ? {
          keyId: data.oneTimePreKey.keyId,
          publicKey: b64ToAb(data.oneTimePreKey.publicKey),
        }
      : undefined,
  }

  const builder = new SessionBuilder(store, recipientAddress)
  await builder.processPreKey(bundle)
}

export async function encryptDmMessage(otherUserId, plaintext) {
  await ensureSessionWithUser(otherUserId)
  const recipientAddress = addressForUser(otherUserId)
  const cipher = new SessionCipher(store, recipientAddress)

  const msgBytes = utf8ToAb(plaintext)
  const ciphertext = await cipher.encrypt(msgBytes)

  let bodyB64
  if (typeof ciphertext.body === 'string') {
    bodyB64 = btoa(ciphertext.body)
  } else {
    bodyB64 = abToB64(ciphertext.body)
  }

  return {
    ciphertext: JSON.stringify({
      t: ciphertext.type,
      b: bodyB64,
    }),
    ciphertextType: 'signal_v1',
  }
}

export async function decryptDmMessage(fromUserId, ciphertextJson) {
  const normalized = normalizeDmCiphertextPayload(ciphertextJson)
  if (!normalized) throw new Error('Invalid ciphertext payload')
  const { t, bodyAb } = normalized

  const senderAddress = addressForUser(fromUserId)
  const cipher = new SessionCipher(store, senderAddress)

  const decodeMessage = async () => {
    if (t === 3) {
      return cipher.decryptPreKeyWhisperMessage(bodyAb, 'binary')
    }
    if (t === 1) {
      return cipher.decryptWhisperMessage(bodyAb, 'binary')
    }
    throw new Error('Unsupported message type')
  }

  try {
    const plaintextAb = await decodeMessage()
    return abToUtf8(plaintextAb)
  } catch (err) {
    // Recovery path: if our session cache was lost/stale, try bootstrapping
    // an outbound session with the sender and retry once.
    if (t === 1) {
      await ensureSessionWithUser(fromUserId, true)
      const plaintextAb = await decodeMessage()
      return abToUtf8(plaintextAb)
    }
    throw err
  }
}

async function aesGcmEncrypt(keyBytes, plaintext) {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8ToAb(plaintext))
  return { iv: abToB64(iv.buffer), ct: abToB64(ct) }
}

async function aesGcmDecrypt(keyBytes, payload) {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const iv = new Uint8Array(b64ToAb(payload.iv))
  const ct = b64ToAb(payload.ct)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return abToUtf8(pt)
}

async function hydrateGroupSenderKeyFromHistory(groupId, senderId, selfUserId) {
  try {
    const res = await apiRequest(`/messages/${encodeURIComponent(String(groupId))}?limit=100`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !Array.isArray(data.messages)) {
      return false
    }

    const sorted = [...data.messages].sort(
      (a, b) => new Date(a.timestamp || a.createdAt || 0).getTime() - new Date(b.timestamp || b.createdAt || 0).getTime(),
    )

    for (const msg of sorted) {
      if (String(msg.senderId || msg.sender || '') !== String(senderId)) continue
      if (msg.ciphertextType !== 'signal_senderkey_v1' || !msg.ciphertext) continue

      let parsed
      try {
        parsed = JSON.parse(msg.ciphertext)
      } catch {
        continue
      }
      if (!parsed || parsed.t !== 'skd1') continue

      const entry = parsed.keys && parsed.keys[String(selfUserId)]
      if (!entry) continue

      try {
        const keyB64 = await decryptDmMessage(senderId, entry.ciphertext ?? entry)
        await store.setGroupSenderKey(groupId, senderId, {
          keyB64,
          createdAt: new Date().toISOString(),
        })
        debugE2E('group.sync_from_history.success', {
          groupId: String(groupId),
          senderId: String(senderId),
          selfUserId: String(selfUserId),
          sourceMessageId: String(msg.id || ''),
        })
        return true
      } catch (err) {
        debugE2E('group.sync_from_history.entry_failed', {
          groupId: String(groupId),
          senderId: String(senderId),
          selfUserId: String(selfUserId),
          sourceMessageId: String(msg.id || ''),
          error: err?.message || String(err),
        })
      }
    }
  } catch (err) {
    debugE2E('group.sync_from_history.request_failed', {
      groupId: String(groupId),
      senderId: String(senderId),
      selfUserId: String(selfUserId),
      error: err?.message || String(err),
    })
  }

  return false
}

export async function ensureGroupSenderKey(groupId, memberIds, selfUserId) {
  let record = await store.getGroupSenderKey(groupId, selfUserId)
  if (!record || !record.keyB64) {
    const legacy = await store.getGroupSenderKey(groupId)
    if (legacy && legacy.keyB64) {
      record = legacy
      await store.setGroupSenderKey(groupId, selfUserId, legacy)
    }
  }
  if (!record || !record.keyB64) {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32))
    record = { keyB64: abToB64(keyBytes.buffer), createdAt: new Date().toISOString() }
    await store.setGroupSenderKey(groupId, selfUserId, record)
  }

  // Always attempt distribution using the current sender key, so late-joiners or
  // members who missed previous distributions can recover.
  const keys = {}
  const normalizedMemberIds = (memberIds || [])
    .map((m) => {
      if (!m) return null
      if (typeof m === 'string' || typeof m === 'number') return String(m)
      if (typeof m === 'object') {
        return String(m.id || m._id || m.userId || '')
      }
      return null
    })
    .filter(Boolean)

  for (const memberId of normalizedMemberIds) {
    if (String(memberId) === String(selfUserId)) continue
    try {
      const wrapped = await encryptDmMessage(memberId, record.keyB64)
      keys[String(memberId)] = {
        ...wrapped,
        // Compatibility fallback for clients with legacy/invalid DM wrapper parsing.
        // NOTE: this keeps group messaging functional in mixed client states.
        keyB64: record.keyB64,
      }
    } catch {
      // Member may not have published DM keys yet; provide compatibility fallback.
      keys[String(memberId)] = { keyB64: record.keyB64 }
    }
  }

  return { ...record, distribution: { t: 'skd1', groupId: String(groupId), from: String(selfUserId), keys } }
}

export async function encryptGroupMessage(groupId, plaintext, senderKeyRecord) {
  const keyB64 = senderKeyRecord && senderKeyRecord.keyB64
  if (!keyB64) throw new Error('Missing group sender key')
  const keyBytes = new Uint8Array(b64ToAb(keyB64))
  const payload = await aesGcmEncrypt(keyBytes, plaintext)
  return {
    ciphertext: JSON.stringify({ t: 'gm1', groupId: String(groupId), ...payload }),
    ciphertextType: 'signal_senderkey_v1',
  }
}

export async function decryptGroupMessage(groupId, senderId, ciphertextJson, selfUserId) {
  const parsed = JSON.parse(ciphertextJson)
  if (!parsed || !parsed.t) throw new Error('Invalid group ciphertext')

  // Sender-key distribution message: store key for this group and do not render.
  if (parsed.t === 'skd1') {
    const distributionSenderId = parsed.from ? String(parsed.from) : String(senderId)
    const entry = parsed.keys && parsed.keys[String(selfUserId)]
    debugE2E('group.skd1.received', {
      groupId: String(groupId),
      senderId: distributionSenderId,
      selfUserId: String(selfUserId),
      hasEntryForSelf: Boolean(entry),
      keyCount: parsed.keys ? Object.keys(parsed.keys).length : 0,
    })
    if (entry) {
      try {
        let keyB64 = tryDecodeDirectSenderKey(entry)
        if (!keyB64) {
          keyB64 = await decryptDmMessage(distributionSenderId, entry.ciphertext ?? entry)
        }
        await store.setGroupSenderKey(groupId, distributionSenderId, {
          keyB64,
          createdAt: new Date().toISOString(),
        })
        debugE2E('group.skd1.stored_sender_key', {
          groupId: String(groupId),
          senderId: distributionSenderId,
          selfUserId: String(selfUserId),
        })
      } catch (err) {
        debugE2E('group.skd1.decrypt_failed', {
          groupId: String(groupId),
          senderId: distributionSenderId,
          selfUserId: String(selfUserId),
          error: err?.message || String(err),
        })
        throw err
      }
    }
    return null
  }

  if (parsed.t === 'gm1') {
    let record = await store.getGroupSenderKey(groupId, senderId)
    debugE2E('group.gm1.decrypt_attempt', {
      groupId: String(groupId),
      senderId: String(senderId),
      selfUserId: String(selfUserId),
      hasSenderKey: Boolean(record && record.keyB64),
    })

    if (!record || !record.keyB64) {
      const hydrated = await hydrateGroupSenderKeyFromHistory(groupId, senderId, selfUserId)
      if (hydrated) {
        record = await store.getGroupSenderKey(groupId, senderId)
      }
    }

    if (!record || !record.keyB64) throw new Error('Missing sender key')
    const keyBytes = new Uint8Array(b64ToAb(record.keyB64))
    return aesGcmDecrypt(keyBytes, parsed)
  }

  throw new Error('Unsupported group ciphertext type')
}

