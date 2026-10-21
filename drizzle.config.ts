import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle Kit config. Schema lives in `src/main/db/schema/`; generated SQL goes
 * to `src/main/db/migrations/`. We only ever `generate` (never `push`): the
 * packaged app applies migrations at startup via the `?raw`-bundled runner.
 * The `url` is unused by `generate` but required by the config type.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema/index.ts',
  out: './src/main/db/migrations',
  dbCredentials: {
    url: 'CrownCRM.db'
  }
})
