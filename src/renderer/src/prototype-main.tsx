import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Toaster } from './components/ui/sonner'
import { ExcelImportPage } from './features/imports/pages/ExcelImportPage'

/**
 * A browser entry for the importer prototype.
 *
 * It mounts the same page the app routes to, but without the auth shell and
 * with the demo runtime, so the whole flow can be clicked through from
 * `http://localhost:5173/prototype.html`.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false }
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ExcelImportPage />
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>
  </StrictMode>
)
