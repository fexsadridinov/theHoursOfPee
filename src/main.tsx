import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Root from './Root'
import { requireHttpsInProduction } from './config'
import './styles.css'

requireHttpsInProduction()

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
)
