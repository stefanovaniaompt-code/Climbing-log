import {
  defineConfig,
  type Plugin,
} from 'vite'

import react from '@vitejs/plugin-react'

function buildVersionPlugin(
  buildId: string,
): Plugin {
  return {
    name:
      'climbing-coach-build-version',

    generateBundle() {
      this.emitFile({
        type:
          'asset',

        fileName:
          'version.json',

        source:
          JSON.stringify(
            {
              buildId,
            },
            null,
            2,
          ),
      })
    },
  }
}

export default defineConfig(
  () => {
    const buildId =
      process.env.GITHUB_SHA ||
      process.env.VITE_BUILD_ID ||
      `local-${Date.now()}`

    return {
      base:
        process.env
          .VITE_BASE_PATH ||
        '/',

      plugins: [
        react(),
        buildVersionPlugin(
          buildId,
        ),
      ],

      define: {
        __APP_BUILD_ID__:
          JSON.stringify(
            buildId,
          ),
      },

      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (
                id.includes(
                  '@supabase',
                )
              ) {
                return 'supabase'
              }

              if (
                id.includes(
                  'react-router',
                )
              ) {
                return 'router'
              }

              if (
                id.includes(
                  'lucide-react',
                )
              ) {
                return 'icons'
              }

              if (
                id.includes(
                  'react',
                )
              ) {
                return 'react'
              }
            },
          },
        },
      },
    }
  },
)
