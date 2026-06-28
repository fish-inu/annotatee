import {
  DEFAULT_USER_SETTINGS,
  normalizeAnnotationStyle,
  normalizeUserSettings,
  type StoredAnnotation,
  type UserSettings
} from './types';

const STORAGE_KEY = 'annotatee.annotations.v1';
const SETTINGS_KEY = 'annotatee.settings.v1';

let memoryFallback: StoredAnnotation[] = [];
let memorySettingsFallback: UserSettings = normalizeUserSettings(DEFAULT_USER_SETTINGS);

export async function getStoredAnnotations(): Promise<StoredAnnotation[]> {
  if (!hasChromeStorage()) {
    return readFallbackAnnotations();
  }

  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (items) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }

      resolve(normalizeAnnotations(items[STORAGE_KEY]));
    });
  });
}

export async function getAnnotationsForPage(pageKey: string): Promise<StoredAnnotation[]> {
  const annotations = await getStoredAnnotations();
  return annotations
    .filter((annotation) => annotation.pageKey === pageKey)
    .sort((first, second) => first.span.start - second.span.start);
}

export async function upsertStoredAnnotation(annotation: StoredAnnotation): Promise<void> {
  const annotations = await getStoredAnnotations();
  const next = [
    ...annotations.filter((candidate) => candidate.id !== annotation.id),
    annotation
  ].sort((first, second) => first.createdAt.localeCompare(second.createdAt));

  await writeStoredAnnotations(next);
}

export async function deleteStoredAnnotation(id: string): Promise<boolean> {
  const annotations = await getStoredAnnotations();
  const next = annotations.filter((annotation) => annotation.id !== id);

  if (next.length === annotations.length) {
    return false;
  }

  await writeStoredAnnotations(next);
  return true;
}

export async function getUserSettings(): Promise<UserSettings> {
  if (!hasChromeStorage()) {
    return readFallbackSettings();
  }

  return new Promise((resolve) => {
    chrome.storage.local.get({ [SETTINGS_KEY]: DEFAULT_USER_SETTINGS }, (items) => {
      if (chrome.runtime.lastError) {
        resolve(normalizeUserSettings(DEFAULT_USER_SETTINGS));
        return;
      }

      resolve(normalizeUserSettings(items[SETTINGS_KEY]));
    });
  });
}

export async function writeUserSettings(settings: UserSettings): Promise<UserSettings> {
  const next = normalizeUserSettings(settings);

  if (!hasChromeStorage()) {
    memorySettingsFallback = next;
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: next }, () => resolve());
  });

  return next;
}

async function writeStoredAnnotations(annotations: StoredAnnotation[]): Promise<void> {
  if (!hasChromeStorage()) {
    memoryFallback = annotations;
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(annotations));
    return;
  }

  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: annotations }, () => resolve());
  });
}

function readFallbackAnnotations(): StoredAnnotation[] {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    memoryFallback = normalizeAnnotations(stored ? JSON.parse(stored) : memoryFallback);
  } catch {
    memoryFallback = [];
  }

  return memoryFallback;
}

function readFallbackSettings(): UserSettings {
  try {
    const stored = globalThis.localStorage?.getItem(SETTINGS_KEY);
    memorySettingsFallback = normalizeUserSettings(
      stored ? JSON.parse(stored) : memorySettingsFallback
    );
  } catch {
    memorySettingsFallback = normalizeUserSettings(DEFAULT_USER_SETTINGS);
  }

  return memorySettingsFallback;
}

function normalizeAnnotations(value: unknown): StoredAnnotation[] {
  return Array.isArray(value)
    ? value.filter(isStoredAnnotation).map(normalizeStoredAnnotation)
    : [];
}

function normalizeStoredAnnotation(annotation: StoredAnnotation): StoredAnnotation {
  return {
    ...annotation,
    style: normalizeAnnotationStyle(annotation.style)
  };
}

function isStoredAnnotation(value: unknown): value is StoredAnnotation {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoredAnnotation).id === 'string' &&
    typeof (value as StoredAnnotation).pageKey === 'string' &&
    typeof (value as StoredAnnotation).span?.start === 'number' &&
    typeof (value as StoredAnnotation).span?.end === 'number'
  );
}

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}
