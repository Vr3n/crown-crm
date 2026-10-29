Research about the topic on internet first, and only then you provide solutions.

This is a Tauri 2 desktop application for Windows. The stack is React + Shadcn for
the UI, Rust for the backend, and SQLite through `rusqlite` (bundled). The
Electron app it replaced lives in git history only; `docs/19-tauri-migration.md`
records how the two map onto each other.

You should thoroughly plan everything.

1. For UI/UX related queries its always mandatory to use the skills `design-taste-frontend`, `high-end-visual-design`.
2. Implementing the React code it is mandatory to use the `react-patterns` skill with the `tanstack` skills.
3. Read `src-tauri/PORTING.md` before writing any Rust, and `docs/backend-implementation-guidelines.md` for the layering rules.
4. The backend is Rust, not TypeScript. `drizzle`/`drizzle-orm-patterns` apply only to schema questions; the SQL itself is `rusqlite`. The schema and column names are in `docs/02-database-schema.md` and `src-tauri/migrations/`.
5. Read `docs/form-implementation-guideline.md` when building or modifying any capture form or dialog.

Implementing backend, or business logic, follow the steps below — they are mandatory:

1. `docs\` modules should be understood thoroughly, and get better context of our business.
2. use `react-patterns` and `tanstack` skills for the renderer; read `src-tauri/PORTING.md` for the Rust side.
3. Always write tests. Rust unit tests live beside the code; the end-to-end backend test is `src-tauri/tests/rpc_flow.rs`. Renderer tests live in `tests/renderer`.
4. After implementation, review your code again using the appropriate skills, and refactor to improve the code & performance.
5. Write the implementation details in `docs` folder. Give appropriate name with a prefix so it is easier to find the documentation.
