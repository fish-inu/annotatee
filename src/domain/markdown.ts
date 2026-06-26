import type { AnnotationRecord, ContextMode } from './annotationContext';

const MODE_LABELS: Record<ContextMode, string> = {
  words: 'words',
  sentence: 'sentences',
  paragraph: 'paragraphs'
};

export function formatAnnotationsAsMarkdown(records: AnnotationRecord[]): string {
  if (records.length === 0) {
    return '# Annotations\n\nNo annotations yet.';
  }

  return [
    '# Annotations',
    '',
    ...records.flatMap((record, index) => [
      `## ${index + 1}. ${escapeMarkdownHeading(record.span.text)}`,
      '',
      `- Span: "${record.span.text}"`,
      `- Offsets: ${record.span.start}-${record.span.end}`,
      `- Context: ${record.context.range} ${MODE_LABELS[record.context.mode]} around selection`,
      '',
      '> ' + record.context.text.replace(/\n+/g, '\n> '),
      ''
    ])
  ].join('\n');
}

function escapeMarkdownHeading(value: string): string {
  return value.replace(/[#`*_{}[\]()]/g, '').trim().slice(0, 80) || 'Untitled span';
}
