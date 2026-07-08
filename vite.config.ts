import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/tanzer-training-tracker/' : '/',
  plugins: [react(), tailwindcss()],
  define: {
    __APP_COMMIT_SHA__: JSON.stringify(commitSha()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
