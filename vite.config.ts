import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import monkey from 'vite-plugin-monkey';
import { licenseBanner } from './scripts/licenses.mjs';
import { downloadURL, iconURL, metaFile, scriptFile, updateURL, version } from './scripts/release-config.mjs';

export default defineConfig(({ command }) => {
  return {
    define: {
      __GUANYU_VERSION__: JSON.stringify(command === 'serve' ? `${version}-dev` : version),
    },
    plugins: [
      svelte({ emitCss: false }),
      monkey({
        entry: 'src/main.ts',
        generate: ({ userscript, mode }) => mode === 'build' ? `${userscript}\n\n${licenseBanner}` : userscript,
        userscript: {
          name: '观鱼',
          namespace: 'https://github.com/Virace2022/guanyu',
          version,
          author: 'Virace2022',
          description: '原生优先的斗鱼网页看播增强：音量增益、团播、官方多屏、签到与每日任务。',
          icon: iconURL,
          match: [
            ...Array.from({ length: 10 }, (_, digit) => `https://www.douyu.com/${digit}*`),
            'https://www.douyu.com/beta/*',
            'https://www.douyu.com/topic/*',
            'https://www.douyu.com/member/cp/getFansBadgeList',
          ],
          'run-at': 'document-idle',
          noframes: true,
          connect: ['douyu.com', 'douyucdn.cn'],
          license: 'MIT',
          ...(command === 'build' ? { updateURL, downloadURL } : {}),
        },
        server: {
          open: false,
          prefix: (name) => `开发 · ${name}`,
        },
        build: {
          fileName: scriptFile,
          metaFileName: metaFile,
        },
      }),
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      open: false,
    },
    build: {
      target: 'es2022',
      minify: 'oxc',
      rolldownOptions: {
        output: {
          minify: {
            compress: true,
            mangle: false,
            codegen: { removeWhitespace: true },
          },
        },
      },
      cssMinify: true,
    },
  };
});
