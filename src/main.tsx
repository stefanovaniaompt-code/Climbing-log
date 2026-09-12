import {
  StrictMode,
} from 'react'

import {
  createRoot,
} from 'react-dom/client'

import {
  BrowserRouter,
} from 'react-router-dom'

import AppRoot from './AppRoot'

import {
  AuthProvider,
} from './auth/AuthProvider'

import {
  registerPwaUpdateManager,
} from './pwa/updateManager'

import './styles.css'

registerPwaUpdateManager()

createRoot(
  document.getElementById(
    'root',
  )!,
).render(
  <StrictMode>
    <BrowserRouter
      basename={
        import.meta.env
          .BASE_URL
      }
    >
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
