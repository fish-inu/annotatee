import type { TextAnnotation } from '@recogito/text-annotator';

export type ContextMode = 'words' | 'sentence' | 'paragraph';

export interface ContextSettings {
  mode: ContextMode;
  range: number;
}

export interface TextSpan {
  text: string;
  start: number;
  end: number;
}

export interface AnnotationContext {
  mode: ContextMode;
  range: number;
  text: string;
  start: number;
  end: number;
}

export interface AnnotationRecord {
  id: string;
  span: TextSpan;
  context: AnnotationContext;
  createdAt?: string;
  updatedAt?: string;
}

interface Segment {
  text: string;
  start: number;
  end: number;
}

const WORD_PATTERN = /\S+/g;
const SENTENCE_PATTERN = /[^.!?]+[.!?]+|[^.!?]+$/g;
const PARAGRAPH_PATTERN = /[^\n]+(?:\n+|$)/g;

export function toAnnotationRecord(
  annotation: TextAnnotation,
  sourceText: string,
  settings: ContextSettings
): AnnotationRecord | null {
  const selector = annotation.target.selector[0];

  if (!selector || typeof selector.start !== 'number' || typeof selector.end !== 'number') {
    return null;
  }

  const span = {
    text: selector.quote || sourceText.slice(selector.start, selector.end),
    start: selector.start,
    end: selector.end
  };

  return {
    id: annotation.id,
    span,
    context: getContext(sourceText, span, settings),
    createdAt: formatDate(annotation.target.created),
    updatedAt: formatDate(annotation.target.updated)
  };
}

export function getContext(
  sourceText: string,
  span: TextSpan,
  settings: ContextSettings
): AnnotationContext {
  const segments = getSegments(sourceText, settings.mode);
  const overlapping = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.end > span.start && segment.start < span.end);

  if (overlapping.length === 0) {
    return contextFromBounds(sourceText, span.start, span.end, settings);
  }

  const firstIndex = Math.max(0, overlapping[0].index - settings.range);
  const lastIndex = Math.min(
    segments.length - 1,
    overlapping[overlapping.length - 1].index + settings.range
  );

  return contextFromBounds(
    sourceText,
    segments[firstIndex].start,
    segments[lastIndex].end,
    settings
  );
}

function getSegments(sourceText: string, mode: ContextMode): Segment[] {
  if (mode === 'words') {
    return getRegexSegments(sourceText, WORD_PATTERN);
  }

  if (mode === 'sentence') {
    return getRegexSegments(sourceText, SENTENCE_PATTERN);
  }

  return getRegexSegments(sourceText, PARAGRAPH_PATTERN).map(trimSegmentBounds(sourceText));
}

function getRegexSegments(sourceText: string, pattern: RegExp): Segment[] {
  const segments: Segment[] = [];
  pattern.lastIndex = 0;

  for (const match of sourceText.matchAll(pattern)) {
    const start = match.index ?? 0;
    const text = match[0];
    segments.push({
      text,
      start,
      end: start + text.length
    });
  }

  return segments;
}

function trimSegmentBounds(sourceText: string) {
  return (segment: Segment): Segment => {
    let start = segment.start;
    let end = segment.end;

    while (start < end && /\s/.test(sourceText[start])) {
      start += 1;
    }

    while (end > start && /\s/.test(sourceText[end - 1])) {
      end -= 1;
    }

    return {
      text: sourceText.slice(start, end),
      start,
      end
    };
  };
}

function contextFromBounds(
  sourceText: string,
  start: number,
  end: number,
  settings: ContextSettings
): AnnotationContext {
  return {
    mode: settings.mode,
    range: settings.range,
    text: sourceText.slice(start, end).trim(),
    start,
    end
  };
}

function formatDate(value: Date | string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : value;
}
