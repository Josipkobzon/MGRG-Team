// ═══════════════════════════════════════════════════════════════════
// store.js — lokale Speicherung (nur auf diesem Gerät, kein Server)
// ═══════════════════════════════════════════════════════════════════
const K = {
  plan: "mgwp-plan-v1",        // entschlüsselter Plan (wenn keine Sperre)
  planEnc: "mgwp-plan-enc-v1", // verschlüsselte Datei (wenn Sperre aktiv)
  settings: "mgwp-settings-v1",
  done: "mgwp-done-v1",
};

const read = (k, fallback) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    if (v === null || v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch (e) {
    return false;
  }
};

export const DEFAULT_SETTINGS = {
  me: null,            // Mitarbeiter-Schlüssel (z. B. "J.Abraham")
  theme: "auto",       // auto | light | dark
  textSize: "normal",  // normal | large
  showDone: true,
  coordinator: false,  // Verteiler-Funktionen sichtbar
};

export const store = {
  loadSettings: () => ({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) }),
  saveSettings: (s) => write(K.settings, s),
  loadPlan: () => read(K.plan, null),
  loadEncrypted: () => read(K.planEnc, null),
  /** plan speichern: entweder Klartext oder (bei Sperre) die verschlüsselte Datei */
  savePlan: (plan, encryptedFile) => {
    if (encryptedFile) {
      write(K.plan, null);
      return write(K.planEnc, encryptedFile);
    }
    write(K.planEnc, null);
    return write(K.plan, plan);
  },
  clearPlan: () => { write(K.plan, null); write(K.planEnc, null); },
  loadDone: () => read(K.done, {}),
  saveDone: (d) => write(K.done, d),
  clearAll: () => Object.values(K).forEach((k) => write(k, null)),
};
