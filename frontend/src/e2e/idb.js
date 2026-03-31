import { openDB } from 'idb'

const DB_NAME = 'chatapp-e2e'
const DB_VERSION = 1

let dbPromise = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv')
        }
      },
    })
  }
  return dbPromise
}

export async function idbGet(key) {
  const db = await getDb()
  return db.get('kv', key)
}

export async function idbSet(key, value) {
  const db = await getDb()
  await db.put('kv', value, key)
}

export async function idbDel(key) {
  const db = await getDb()
  await db.delete('kv', key)
}

export async function idbKeys(prefix) {
  const db = await getDb()
  const keys = await db.getAllKeys('kv')
  if (!prefix) return keys
  return keys.filter((k) => typeof k === 'string' && k.startsWith(prefix))
}

