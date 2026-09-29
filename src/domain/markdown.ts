import type { AnnotationRecord } from './annotationContext';

export const ANNOTATION_MARKDOWN_FORMATS = ['list', 'table'] as const;
export type AnnotationMarkdownFormat = (typeof ANNOTATION_MARKDOWN_FORMATS)[number];

export interface AnnotationMarkdownRenderOptions {
  includeContext?: boolean;
}

export interface AnnotationMarkdownOptions extends AnnotationMarkdownRenderOptions {
  customText?: string;
  format?: AnnotationMarkdownFormat;
}

export interface AnnotationMarkdownFormatter {
  readonly id: AnnotationMarkdownFormat;
  render(
    records: readonly AnnotationRecord[],
    options: AnnotationMarkdownRenderOptions
  ): string;
}

export type AnnotationMarkdownFormatterRegistry = ReadonlyMap<
  AnnotationMarkdownFormat,
  AnnotationMarkdownFormatter
>;

export function createAnnotationMarkdownFormatterRegistry(
  formatters: readonly AnnotationMarkdownFormatter[]
): AnnotationMarkdownFormatterRegistry {
  const registry = new Map<AnnotationMarkdownFormat, AnnotationMarkdownFormatter>();

  for (const formatter of formatters) {
    if (registry.has(formatter.id)) {
      throw new Error('Only one Markdown formatter can be registered for each format.');
    }

    registry.set(formatter.id, formatter);
  }

  return registry;
}

export const annotationListMarkdownFormatter: AnnotationMarkdownFormatter = {
  id: 'list',
  render(records) {
    return records
      .map((record) => '- ' + escapeMarkdownListItem(record.span.text))
      .join('\n');
  }
};

export const annotationTableMarkdownFormatter: AnnotationMarkdownFormatter = {
  id: 'table',
  render(records, options) {
    const includeContext = options.includeContext ?? true;
    const headers = includeContext ? ['Span', 'Context'] : ['Span'];
    const divider = headers.map(() => '---');
    const rows = records.map((record) => {
      const cells = [record.span.text];

      if (includeContext) {
        cells.push(record.context.text);
      }

      return '| ' + cells.map(escapeMarkdownTableCell).join(' | ') + ' |';
    });

    return [
      '| ' + headers.join(' | ') + ' |',
      '| ' + divider.join(' | ') + ' |',
      ...rows
    ].join('\n');
  }
};

export const DEFAULT_ANNOTATION_MARKDOWN_FORMATTERS =
  createAnnotationMarkdownFormatterRegistry([
    annotationListMarkdownFormatter,
    annotationTableMarkdownFormatter
  ]);

export function formatAnnotationsAsMarkdown(
  records: readonly AnnotationRecord[],
  options: AnnotationMarkdownOptions = {},
  formatterRegistry: AnnotationMarkdownFormatterRegistry =
    DEFAULT_ANNOTATION_MARKDOWN_FORMATTERS
): string {
  const format = options.format ?? 'list';
  const formatter = formatterRegistry.get(format);

  if (!formatter) {
    throw new Error('No Markdown formatter is registered for "' + format + '".');
  }

  const annotations =
    records.length === 0 ? 'No annotations yet.' : formatter.render(records, options);
  const customText = options.customText?.trim();
  const segments = [annotations];

  if (customText) {
    segments.push(customText);
  }

  return segments.join('\n\n');
}

function escapeMarkdownListItem(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\*_{}\[\]()])/g, '\\$1');
}

function escapeMarkdownTableCell(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim();
}
