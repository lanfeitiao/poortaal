import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'inject-zod-validation-runtime',
      transformIndexHtml() {
        return [
          {
            tag: 'script',
            attrs: { src: 'zod-validation.js' },
            injectTo: 'body',
          },
        ];
      },
    },
  ],
});
