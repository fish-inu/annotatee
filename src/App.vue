<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  createTextAnnotator,
  type StoreChangeEvent,
  type TextAnnotation,
  type TextAnnotator
} from '@recogito/text-annotator';
import '@recogito/text-annotator/text-annotator.css';
import { articleDeck, articleText, articleTitle } from './data/sampleArticle';
import {
  type AnnotationRecord,
  type ContextMode,
  type ContextSettings,
  toAnnotationRecord
} from './domain/annotationContext';
import { formatAnnotationsAsMarkdown } from './domain/markdown';

const articleElement = ref<HTMLElement | null>(null);
const annotations = ref<TextAnnotation[]>([]);
const contextMode = ref<ContextMode>('sentence');
const contextRange = ref(1);
const copyStatus = ref('Copy markdown');

let annotator: TextAnnotator<TextAnnotation> | null = null;

const contextSettings = computed<ContextSettings>(() => ({
  mode: contextMode.value,
  range: contextRange.value
}));

const records = computed<AnnotationRecord[]>(() =>
  annotations.value
    .map((annotation) => toAnnotationRecord(annotation, articleText, contextSettings.value))
    .filter((record): record is AnnotationRecord => record !== null)
    .sort((first, second) => first.span.start - second.span.start)
);

const markdown = computed(() => formatAnnotationsAsMarkdown(records.value));

const rangeLabel = computed(() => {
  if (contextMode.value === 'words') {
    return `${contextRange.value} word${contextRange.value === 1 ? '' : 's'}`;
  }

  if (contextMode.value === 'sentence') {
    return `${contextRange.value} sentence${contextRange.value === 1 ? '' : 's'}`;
  }

  return `${contextRange.value} paragraph${contextRange.value === 1 ? '' : 's'}`;
});

onMounted(() => {
  if (!articleElement.value) {
    return;
  }

  const instance = createTextAnnotator<TextAnnotation, TextAnnotation>(articleElement.value, {
    renderer: 'SPANS',
    style: {
      fill: '#ffd166',
      fillOpacity: 0.45,
      underlineColor: '#a86d00',
      underlineThickness: 2
    }
  });

  const syncAnnotations = (event?: StoreChangeEvent<TextAnnotation>) => {
    annotations.value = event?.state ?? instance.getAnnotations();
  };

  instance.state.store.observe(syncAnnotations);
  syncAnnotations();
  annotator = instance;
});

onBeforeUnmount(() => {
  annotator?.destroy();
  annotator = null;
});

watch([contextMode, contextRange], () => {
  copyStatus.value = 'Copy markdown';
});

function removeAnnotation(id: string) {
  annotator?.removeAnnotation(id);
}

async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(markdown.value);
    copyStatus.value = 'Copied';
    window.setTimeout(() => {
      copyStatus.value = 'Copy markdown';
    }, 1400);
  } catch {
    copyStatus.value = 'Copy failed';
  }
}
</script>

<template>
  <main class="workspace">
    <section class="reader-panel" aria-labelledby="article-title">
      <div class="article-heading">
        <p class="eyebrow">Sample Article</p>
        <h1 id="article-title">{{ articleTitle }}</h1>
        <p>{{ articleDeck }}</p>
      </div>

      <article ref="articleElement" class="article-body" aria-label="Annotatable article">
        {{ articleText }}
      </article>
    </section>

    <aside class="state-panel" aria-label="Annotation state">
      <section class="control-strip" aria-label="Context settings">
        <div class="field">
          <label for="context-mode">Context</label>
          <select id="context-mode" v-model="contextMode">
            <option value="words">Words</option>
            <option value="sentence">Sentence</option>
            <option value="paragraph">Paragraph</option>
          </select>
        </div>

        <div class="field">
          <label for="context-range">Range: {{ rangeLabel }}</label>
          <input
            id="context-range"
            v-model.number="contextRange"
            type="range"
            min="0"
            max="4"
            step="1"
          />
        </div>
      </section>

      <section class="summary-row" aria-label="Annotation summary">
        <div>
          <span>{{ records.length }}</span>
          <p>Annotations</p>
        </div>
        <button type="button" class="primary-action" @click="copyMarkdown">
          {{ copyStatus }}
        </button>
      </section>

      <section class="annotation-list" aria-label="Structured annotations">
        <article v-if="records.length === 0" class="empty-state">
          Select text in the article to create an annotation.
        </article>

        <article
          v-for="record in records"
          v-else
          :key="record.id"
          class="annotation-card"
        >
          <header>
            <div>
              <p class="span-label">{{ record.span.text }}</p>
              <p class="offset-label">{{ record.span.start }}-{{ record.span.end }}</p>
            </div>
            <button type="button" class="ghost-action" @click="removeAnnotation(record.id)">
              Delete
            </button>
          </header>
          <p class="context-copy">{{ record.context.text }}</p>
        </article>
      </section>

      <section class="markdown-panel" aria-label="Markdown export preview">
        <header>
          <h2>Markdown</h2>
        </header>
        <pre>{{ markdown }}</pre>
      </section>
    </aside>
  </main>
</template>
