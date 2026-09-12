/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_BACKEND_SCHEMA?: 'workspace-v2' | 'legacy-v1'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

type WebMcpTool = {
  name: string
  title?: string
  description: string
  inputSchema: object
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
  execute(input: unknown): unknown | Promise<unknown>
}

interface Document {
  readonly modelContext?: {
    registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void>
  }
}
