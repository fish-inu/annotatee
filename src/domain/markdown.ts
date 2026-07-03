import type { AnnotationRecord } from './annotationContext';

interface MarkdownOptions {
  articleText?: string;
  customText?: string;
}

export function formatAnnotationsAsMarkdown(
  records: AnnotationRecord[],
  options: MarkdownOptions = {}
): string {
  const annotations =
    records.length === 0
      ? '# Annotations\n\nNo annotations yet.'
      : records
          .flatMap((record) => formatAnnotationRecord(record))
          .join('\n');
  const articleText = options.articleText?.trim();
  const customText = options.customText?.trim();
  const segments = articleText ? [articleText, annotations] : [annotations];

  if (customText) {
    segments.push(customText);
  }

  return segments.join('\n\n');
}

function formatAnnotationRecord(record: AnnotationRecord): string[] {
  const lines = [
    `## ${escapeMarkdownHeading(record.span.text)}`,
    '',
    '> ' + record.context.text.replace(/\n+/g, '\n> '),
    ''
  ];
  const note = record.note?.trim();

  if (note) {
    lines.push('**Note**', '', note, '');
  }

  return lines;
}

function escapeMarkdownHeading(value: string): string {
  return value.replace(/[#`*_{}[\]()]/g, '').trim().slice(0, 80) || 'Untitled span';
}
