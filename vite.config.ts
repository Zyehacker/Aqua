import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
})
