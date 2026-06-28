import { defineConfig } from 'rolldown';

const banner = '/* Annotatee extension bundle */';

export default defineConfig([
  {
    input: 'src/extension/background.ts',
    output: {
      banner,
      file: 'dist/assets/background.js',
      format: 'iife',
      name: 'AnnotateeBackground'
    }
  },
  {
    input: 'src/extension/contentScript.ts',
    output: {
      banner,
      file: 'dist/assets/contentScript.js',
      format: 'iife',
      name: 'AnnotateeContent'
    }
  }
]);
