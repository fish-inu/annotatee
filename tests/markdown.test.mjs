import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnnotationMarkdownFormatterRegistry,
  formatAnnotationsAsMarkdown
} from '../src/domain/markdown.ts';

const records = [
  {
    id: 'first',
    span: { text: 'A *quoted* span', start: 0, end: 15 },
    context: { text: 'A nearby | sentence\ncontinues here', mode: 'sentence', range: 1, start: 0, end: 40 }
  },
  {
    id: 'second',
    span: { text: 'Second\nitem', start: 20, end: 31 },
    context: { text: 'Another sentence.', mode: 'sentence', range: 1, start: 16, end: 35 }
  }
];

test('formats annotations as simple Markdown list items by default', () => {
  assert.equal(
    formatAnnotationsAsMarkdown(records),
    '- A \\*quoted\\* span\n- Second item'
  );
});

test('formats annotations as a table with span text and context', () => {
  assert.equal(
    formatAnnotationsAsMarkdown(records, { format: 'table' }),
    '| Span | Context |\n| --- | --- |\n| A *quoted* span | A nearby \\| sentence<br>continues here |\n| Second<br>item | Another sentence. |'
  );
});

test('omits the context column when context is disabled', () => {
  assert.equal(
    formatAnnotationsAsMarkdown(records, { format: 'table', includeContext: false }),
    '| Span |\n| --- |\n| A *quoted* span |\n| Second<br>item |'
  );
});

test('appends custom text after the selected format', () => {
  assert.equal(
    formatAnnotationsAsMarkdown([records[0]], {
      customText: '  Extra note  ',
      format: 'list'
    }),
    '- A \\*quoted\\* span\n\nExtra note'
  );
});

test('allows an injected formatter to control the output', () => {
  const formatters = createAnnotationMarkdownFormatterRegistry([
    {
      id: 'list',
      render(items) {
        return 'injected: ' + items.length;
      }
    }
  ]);

  assert.equal(formatAnnotationsAsMarkdown(records, {}, formatters), 'injected: 2');
});

test('rejects duplicate formatter registrations', () => {
  const formatter = { id: 'list', render: () => '' };

  assert.throws(
    () => createAnnotationMarkdownFormatterRegistry([formatter, formatter]),
    /Only one Markdown formatter/
  );
});

test('returns an empty-state message when there are no annotations', () => {
  assert.equal(formatAnnotationsAsMarkdown([], { format: 'table' }), 'No annotations yet.');
});
