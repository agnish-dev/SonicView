import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'dna.png'],
      manifest: {
        name: 'SonicView',
        short_name: 'SonicView',
        description: 'AI Music Sonic Analysis',
        theme_color: '#0d0b14',
        background_color: '#0d0b14',
        display: 'standalone',
        icons: [
          {
            src: 'dna.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'dna.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
})
