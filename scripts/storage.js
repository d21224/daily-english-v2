import { DB_NAME, DB_VERSION, V1_AUDIO_DB, V1_STATE_KEY } from './constants.js?v=0.2.12';
import { createDefaultState, migrateV1, migrateV2, normalizePreferences } from './state.js?v=0.2.12';
import { validateState } from './rules.js?v=0.2.6';

const STATE_KEY = 'current';
const AUDIO_KEY = 'current';

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains('ledger')) db.createObjectStore('ledger', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('저장소를 열지 못했어요.'));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadState() {
  const db = await openDatabase();
  let saved;
  try {
    const tx = db.transaction('state', 'readonly');
    saved = await requestValue(tx.objectStore('state').get(STATE_KEY));
  } finally {
    db.close();
  }
  if (saved) {
    const normalized = saved.schemaVersion === 2 ? migrateV2(saved) : normalizePreferences(saved);
    validateState(normalized);
    if (!saved.preferences || !saved.listeningPraiseMessages || !saved.taskPraiseMessages || JSON.stringify(saved.preferences) !== JSON.stringify(normalized.preferences)) await saveState(normalized);
    return normalized;
  }
  const legacyRaw = localStorage.getItem(V1_STATE_KEY);
  const initial = legacyRaw ? migrateV1(JSON.parse(legacyRaw)) : createDefaultState();
  await saveState(initial);
  return initial;
}

export async function saveState(state) {
  validateState(state);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put(structuredClone(state), STATE_KEY);
    tx.oncomplete = () => { db.close(); resolve(state); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error); };
    tx.onabort = () => { const error = tx.error; db.close(); reject(error); };
  });
}

export async function replaceState(state) {
  const normalized = state?.schemaVersion === 2 ? migrateV2(state) : normalizePreferences(state);
  validateState(normalized);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['state','ledger'], 'readwrite');
    tx.objectStore('state').put(structuredClone(normalized), STATE_KEY);
    tx.objectStore('ledger').clear();
    tx.oncomplete = () => { db.close(); resolve(normalized); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error); };
  });
}

export async function saveAudio(file) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').put({ blob: file, name: file.name, type: file.type, savedAt: new Date().toISOString() }, AUDIO_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error); };
  });
}

export async function loadAudio() {
  const db = await openDatabase();
  try {
    const tx = db.transaction('audio', 'readonly');
    return await requestValue(tx.objectStore('audio').get(AUDIO_KEY));
  } finally {
    db.close();
  }
}

export async function copyLegacyAudioIfAvailable(expectedName = '') {
  if (!expectedName) return null;
  const existing = await loadAudio();
  if (existing?.blob) return existing;
  const legacy = await new Promise((resolve, reject) => {
    const request = indexedDB.open(V1_AUDIO_DB);
    let created = false;
    request.onupgradeneeded = () => {
      created = true;
      request.transaction.abort();
    };
    request.onsuccess = () => {
      const db = request.result;
      if (created || !db.objectStoreNames.contains('audio')) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction('audio', 'readonly');
      const get = tx.objectStore('audio').get('current');
      get.onsuccess = () => {
        const value = get.result;
        db.close();
        resolve(value?.file instanceof Blob ? { blob:value.file, name:value.name || expectedName } : null);
      };
      get.onerror = () => { db.close(); reject(get.error); };
    };
    request.onerror = () => {
      if (request.error?.name === 'AbortError') resolve(null);
      else reject(request.error);
    };
  }).catch(()=>null);
  if (!legacy?.blob) return null;
  const file = new File([legacy.blob], legacy.name || expectedName, { type:legacy.blob.type || 'audio/mpeg' });
  await saveAudio(file);
  return { blob:file, name:file.name };
}

export async function clearAudio() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').delete(AUDIO_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error); };
  });
}

export async function clearV2() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 탭에서 앱을 닫은 뒤 다시 시도해 주세요.'));
  });
}
