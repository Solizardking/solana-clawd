/**
 * SVM-A2A Web Frontend Entry
 *
 * React entry point with AgentAuthProvider for CAAP/1.0
 * authentication, DAS NFT verification, and CLAWD tier gating.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../../../src/App'
import { AgentAuthProvider } from '@auth/agent'

const root = document.getElementById('root')

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AgentAuthProvider>
        <App />
      </AgentAuthProvider>
    </React.StrictMode>,
  )
}