import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    esbuild: {
      pure: ['console.log', 'console.info']
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer')
      }
    },
    plugins: [tailwindcss(), react()],
    build: {
      minify: 'esbuild',
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-flow': ['@xyflow/react'],
            'vendor-zustand': ['zustand'],
            'vendor-icons': ['lucide-react'],
            'vendor-marked': ['marked']
          }
        }
      }
    },
    esbuild: {
      pure: ['console.log', 'console.info']
    }
  }
})
