import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ColorSchemeProvider } from './contexts/ColorSchemeContext.jsx'
import './styles/index.css'
import './styles/orbit-redesign.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ColorSchemeProvider>
        <App />
      </ColorSchemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
