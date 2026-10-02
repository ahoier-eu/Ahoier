import { prepareSocialImage } from "./social-media";

const DATABASE = "ahoier-demo-media";
const STORE = "images";
const VERSION = 1;

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("Lokaler Bildspeicher ist in diesem Browser nicht verfügbar.")); return; }
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Lokaler Bildspeicher konnte nicht geöffnet werden."));
    request.onblocked = () => reject(new Error("Schließe andere Ahoier-Tabs und versuche es erneut."));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(new Error("Das Bild konnte lokal nicht gespeichert oder geladen werden."));
      tx.onabort = () => reject(new Error("Das Bild konnte lokal nicht gespeichert oder geladen werden."));
      action(tx.objectStore(STORE), value => { result = value; });
    });
  } finally { db.close(); }
}

export async function putDemoImage(source: File): Promise<string> {
  const image = await prepareSocialImage(source);
  const id = `demo-media:${crypto.randomUUID()}`;
  await transaction<void>("readwrite", (store, done) => {
    const request = store.put(image, id);
    request.onsuccess = () => done();
  });
  return id;
}

export async function getDemoImage(id: string): Promise<Blob | null> {
  return transaction<Blob | null>("readonly", (store, done) => {
    const request = store.get(id);
    request.onsuccess = () => done(request.result instanceof Blob ? request.result : null);
  });
}

export async function deleteDemoImages(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await transaction<void>("readwrite", (store, done) => {
    for (const id of ids) store.delete(id);
    done();
  });
}

export async function clearDemoImages(): Promise<void> {
  await transaction<void>("readwrite", (store, done) => {
    store.clear();
    done();
  });
}
