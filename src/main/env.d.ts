/// <reference types="vite/client" />

/**
 * Declares Vite `?raw` imports for the main-process bundle. electron-vite and
 * vitest bundle the migration SQL files as plain strings at build/test time;
 * this lets TypeScript typecheck the imports in `src/main/db/migrations.ts`.
 */
declare module '*?raw' {
  const content: string
  export default content
}
