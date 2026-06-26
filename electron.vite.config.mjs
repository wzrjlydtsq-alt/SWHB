import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

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
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    build: {
      minify: 'esbuild',
      chunkSizeWarningLimit: 700,
      rollupOptions: {
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
  }
})
