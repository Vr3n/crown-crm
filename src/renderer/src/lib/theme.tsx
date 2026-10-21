import { useEffect, useState, useCallback } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'crowncrm:theme'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Applies the resolved theme to <html>: toggles `.dark` and sets `color-scheme`. */
function applyTheme(theme: Theme): void {
  const root = document.documentElement
  const resolved = theme === 'system' ? getSystemTheme() : theme
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

export function useTheme(): {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (t: Theme) => void
} {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY) as Theme | null
      return stored ?? 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      // localStorage can be unavailable in some sandboxed contexts; ignore.
    }
  }, [])

  const resolved = theme === 'system' ? getSystemTheme() : theme

  return { theme, resolved, setTheme }
}
