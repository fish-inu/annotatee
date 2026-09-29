<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { AnnotationRecord, ContextMode } from './domain/annotationContext';
import { formatAnnotationsAsMarkdown } from './domain/markdown';
import { isStateChangedMessage } from './extension/messages';
import { getUserSettings, writeUserSettings } from './extension/storage';
import type {
  ContentRequest,
  DeleteAnnotationResponse,
  ExtensionState,
  StoredAnnotation,
  UpdateAnnotationNoteResponse,
  UpdateSettingsResponse,
  UserSettings
} from './extension/types';
import {
  CONTEXT_MODES,
  CONTEXT_RANGE_LIMIT,
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings
} from './extension/types';

const CONTEXT_MODE_LABELS: Record<ContextMode, string> = {
  paragraph: 'Paragraphs',
  sentence: 'Sentences',
  words: 'Words'
};

const contextModeOptions = CONTEXT_MODES.map((mode) => ({
  label: CONTEXT_MODE_LABELS[mode],
  value: mode
}));
const settings = ref<UserSettings>(normalizeUserSettings(DEFAULT_USER_SETTINGS));
const state = ref<ExtensionState>(createUnavailableState(settings.value));
const copyStatus = ref('Copy');
const isRefreshing = ref(false);
let customTextSaveTimer = 0;

const records = computed<AnnotationRecord[]>(() =>
  state.value.annotations.map((annotation) => ({
    context: annotation.context,
    createdAt: annotation.createdAt,
    id: annotation.id,
    note: annotation.note,
    span: annotation.span,
    updatedAt: annotation.updatedAt
  }))
);
const title = computed(() => state.value.article?.articleTitle || state.value.article?.pageTitle || 'Annotatee');
const subtitle = computed(() => {
  if (!state.value.enabled) {
    return 'Inactive';
  }

  return state.value.article?.siteName || state.value.article?.areaLabel || 'Article ready';
});
const annotationCountLabel = computed(() =>
  `${state.value.annotations.length} annotation${state.value.annotations.length === 1 ? '' : 's'}`
);
const canCopy = computed(
  () =>
    state.value.annotations.length > 0 ||
    settings.value.copy.customText.trim().length > 0
);

onMounted(() => {
  void refreshState();
  if (hasChromeRuntime()) {
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  }
});

onBeforeUnmount(() => {
  persistCurrentSettings();

  if (hasChromeRuntime()) {
    chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
  }
});

function handleRuntimeMessage(message: unknown) {
  if (isStateChangedMessage(message)) {
    applyExtensionState(message.state);
  }
}

async function refreshState() {
  isRefreshing.value = true;

  try {
    const [storedSettings, activeState] = await Promise.all([
      getUserSettings(),
      sendMessageToActiveTab<ExtensionState>({ type: 'GET_STATE' })
    ]);

    if (activeState) {
      applyExtensionState(activeState);
    } else {
      const nextSettings = normalizeUserSettings(storedSettings);
      settings.value = nextSettings;
      state.value = createUnavailableState(nextSettings);
    }
  } finally {
    isRefreshing.value = false;
  }
}

async function deleteAnnotation(annotation: StoredAnnotation) {
  const response = await sendMessageToActiveTab<DeleteAnnotationResponse>({
    id: annotation.id,
    type: 'DELETE_ANNOTATION'
  });

  if (response?.ok) {
    applyExtensionState(response.state);
  }
}

async function updateAnnotationNote(annotation: StoredAnnotation, event: Event) {
  const note = (event.target as HTMLTextAreaElement).value;
  const response = await sendMessageToActiveTab<UpdateAnnotationNoteResponse>({
    id: annotation.id,
    note,
    type: 'UPDATE_ANNOTATION_NOTE'
  });

  if (response?.ok) {
    applyExtensionState(response.state);
  }
}

async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(
      formatAnnotationsAsMarkdown(records.value, {
        customText: settings.value.copy.customText
      })
    );
    copyStatus.value = 'Copied';
  } catch {
    copyStatus.value = 'Failed';
  }

  window.setTimeout(() => {
    copyStatus.value = 'Copy';
  }, 1400);
}

function updateContextMode(event: Event) {
  const mode = (event.target as HTMLSelectElement).value as ContextMode;

  void applySettings({
    ...settings.value,
    context: {
      ...settings.value.context,
      mode
    }
  });
}

function updateContextRange(event: Event) {
  const range = Number((event.target as HTMLInputElement).value);

  void applySettings({
    ...settings.value,
    context: {
      ...settings.value.context,
      range
    }
  });
}

function updateCustomText(event: Event) {
  const customText = (event.target as HTMLTextAreaElement).value;
  const nextSettings = {
    ...settings.value,
    copy: {
      ...settings.value.copy,
      customText
    }
  };

  settings.value = nextSettings;
  state.value = {
    ...state.value,
    settings: nextSettings
  };
  scheduleSettingsSave();
}

function scheduleSettingsSave() {
  window.clearTimeout(customTextSaveTimer);
  customTextSaveTimer = window.setTimeout(() => {
    customTextSaveTimer = 0;
    void applySettings(settings.value);
  }, 350);
}

function persistCurrentSettings() {
  if (customTextSaveTimer === 0) {
    return;
  }

  window.clearTimeout(customTextSaveTimer);
  customTextSaveTimer = 0;
  void applySettings(settings.value);
}

async function applySettings(nextSettings: UserSettings) {
  const savedSettings = await writeUserSettings(nextSettings);
  settings.value = savedSettings;
  state.value = {
    ...state.value,
    settings: savedSettings
  };

  const response = await sendMessageToActiveTab<UpdateSettingsResponse>({
    settings: savedSettings,
    type: 'UPDATE_SETTINGS'
  });

  if (response?.ok) {
    applyExtensionState(response.state);
  }
}

function applyExtensionState(nextState: ExtensionState) {
  const nextSettings = normalizeUserSettings(nextState.settings);
  settings.value = nextSettings;
  state.value = {
    ...nextState,
    settings: nextSettings
  };
}

function createUnavailableState(nextSettings: UserSettings): ExtensionState {
  return {
    annotations: [],
    enabled: false,
    reason: 'Open an article tab to use Annotatee.',
    settings: nextSettings
  };
}

function sendMessageToActiveTab<T>(message: ContentRequest): Promise<T | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;

      if (typeof tabId !== 'number') {
        resolve(null);
        return;
      }

      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve((response as T) ?? null);
      });
    });
  });
}

function hasChromeRuntime(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.onMessage);
}
</script>

<template>
  <main class="popup-shell">
    <header class="topbar">
      <div class="brand-mark" aria-hidden="true">A</div>
      <div class="title-block">
        <p>{{ subtitle }}</p>
        <h1>{{ title }}</h1>
      </div>
      <button
        class="icon-button"
        type="button"
        title="Refresh"
        aria-label="Refresh"
        :disabled="isRefreshing"
        @click="refreshState"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 0 1-15.4 6.4" />
          <path d="M3 12A9 9 0 0 1 18.4 5.6" />
          <path d="M18 2v4h4" />
          <path d="M6 22v-4H2" />
        </svg>
      </button>
    </header>

    <section class="status-strip" aria-label="Annotation summary">
      <div>
        <span>{{ state.annotations.length }}</span>
        <p>{{ annotationCountLabel }}</p>
      </div>
      <button
        class="copy-button"
        type="button"
        :disabled="!canCopy"
        @click="copyMarkdown"
      >
        {{ copyStatus }}
      </button>
    </section>

    <section class="settings-panel" aria-label="Annotation settings">
      <label class="field field--textarea">
        <span>Append text</span>
        <textarea
          rows="3"
          :value="settings.copy.customText"
          @input="updateCustomText"
          @change="updateCustomText"
        ></textarea>
      </label>

      <div class="settings-grid">
        <label class="field">
          <span>Context</span>
          <select :value="settings.context.mode" @change="updateContextMode">
            <option
              v-for="option in contextModeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="field field--range">
          <span>Range</span>
          <input
            type="number"
            inputmode="numeric"
            :min="CONTEXT_RANGE_LIMIT.min"
            :max="CONTEXT_RANGE_LIMIT.max"
            :value="settings.context.range"
            @change="updateContextRange"
          />
        </label>
      </div>
    </section>

    <section v-if="!state.enabled" class="notice" aria-live="polite">
      {{ state.reason }}
    </section>

    <section v-else class="annotation-list" aria-label="Annotations">
      <article v-if="state.annotations.length === 0" class="notice">
        No annotations yet.
      </article>

      <article
        v-for="annotation in state.annotations"
        v-else
        :key="annotation.id"
        class="annotation-card"
      >
        <div>
          <p class="quote">{{ annotation.span.text }}</p>
          <p class="context">{{ annotation.context.text }}</p>
          <label class="annotation-note">
            <span>Note</span>
            <textarea
              rows="2"
              :value="annotation.note"
              @change="updateAnnotationNote(annotation, $event)"
            ></textarea>
          </label>
        </div>
        <button
          class="delete-button"
          type="button"
          title="Delete annotation"
          aria-label="Delete annotation"
          @click="deleteAnnotation(annotation)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v5" />
            <path d="M14 11v5" />
          </svg>
        </button>
      </article>
    </section>
  </main>
</template>
