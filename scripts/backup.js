import { APP_NAME, APP_VERSION } from './constants.js?v=0.2.15';
import { migrateV2, normalizePreferences } from './state.js?v=0.2.15';
import { validateState } from './rules.js?v=0.2.15';

export function createBackupPayload(state, now = new Date()) {
  const safeState = structuredClone(state);
  delete safeState.parentPasscode;
  return {
    app: APP_NAME,
    version: 2,
    appVersion: APP_VERSION,
    exportedAt: now.toISOString(),
    state: safeState
  };
}

export function prepareImportedState(payload, currentState) {
  if (payload?.app !== APP_NAME || payload?.version !== 2 || !payload.state) throw new Error('백업 파일 형식이 올바르지 않아요.');
  const raw = structuredClone(payload.state);
  const normalized = raw.schemaVersion === 2 ? migrateV2(raw) : normalizePreferences(raw);
  normalized.parentPasscode = String(currentState?.parentPasscode || '');
  normalized.audio = structuredClone(currentState?.audio || {name:'',saveToDevice:true});
  return validateState(normalized);
}
