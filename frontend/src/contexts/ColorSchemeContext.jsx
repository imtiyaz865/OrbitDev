import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ColorSchemeContext = createContext(null)
const storageKey = 'orbit-color-scheme'

function getStoredScheme() {
  try {
    const stored = window.localStorage.getItem(storageKey)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch (error) {
    console.error('ORBIT could not read the saved color scheme.', error)
    return null
  }
}

function getSystemScheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ColorSchemeProvider({ children }) {
  const [scheme, setScheme] = useState(() => (
    document.documentElement.dataset.theme || getStoredScheme() || getSystemScheme()
  ))

  useEffect(() => {
    document.documentElement.dataset.theme = scheme
    document.documentElement.style.colorScheme = scheme
    const themeColor = document.querySelector('meta[name="theme-color"]')
    if (themeColor) themeColor.setAttribute('content', scheme === 'dark' ? '#050915' : '#54c2f2')
  }, [scheme])

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const updateFromSystem = (event) => {
      if (!getStoredScheme()) setScheme(event.matches ? 'dark' : 'light')
    }
    preference.addEventListener?.('change', updateFromSystem)
    return () => preference.removeEventListener?.('change', updateFromSystem)
  }, [])

  const value = useMemo(() => ({
    scheme,
    toggleScheme() {
      const nextScheme = scheme === 'dark' ? 'light' : 'dark'
      setScheme(nextScheme)
      try {
        window.localStorage.setItem(storageKey, nextScheme)
      } catch (error) {
        console.error('ORBIT could not save the color scheme preference.', error)
      }
    },
  }), [scheme])

  return (
    <ColorSchemeContext.Provider value={value}>
      {children}
    </ColorSchemeContext.Provider>
  )
}

export function useColorScheme() {
  const context = useContext(ColorSchemeContext)
  if (!context) throw new Error('useColorScheme must be used within ColorSchemeProvider.')
  return context
}

export function useTouchFirstDevice() {
  const [isTouchFirst, setIsTouchFirst] = useState(() => (
    window.matchMedia('(hover: none) and (pointer: coarse)').matches
  ))

  useEffect(() => {
    const capability = window.matchMedia('(hover: none) and (pointer: coarse)')
    const updateCapability = (event) => setIsTouchFirst(event.matches)
    capability.addEventListener?.('change', updateCapability)
    return () => capability.removeEventListener?.('change', updateCapability)
  }, [])

  return isTouchFirst
}
