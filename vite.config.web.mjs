/**
 * Web 独立构建配置 — M4-2 预研版
 *
 * 用途：`npm run build:web` 生成纯浏览器可运行的静态资源
 * 与 electron.vite.config.mjs 的区别：
 *   - 不包含 main/preload 进程构建
 *   - 不依赖 electron-vite，使用原生 vite
 *   - 注入 window.electron/dbAPI/fileAPI 的空桩（polyfill）
 */
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: '/',
  publicDir: resolve(__dirname, 'src/renderer/public'),
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // 标记当前构建目标为 Web，运行时可用 if (__BUILD_TARGET__ === 'web') 分支
    __BUILD_TARGET__: JSON.stringify('web')
  },
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    minify: 'esbuild',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
      output: {
        manualChunks: {
          'vendor-flow': ['@xyflow/react'],
          'vendor-zustand': ['zustand'],
          'vendor-icons': ['lucide-react'],
          'vendor-marked': ['marked'],
          'vendor-motion': ['framer-motion'],
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei']
        }
      }
    }
  },
  esbuild: {
    pure: ['console.log', 'console.info']
  }
})
