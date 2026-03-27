// 轻量级 passive event listener 错误过滤（仅拦截特定错误，避免对所有日志做字符串检查）
;(function () {
  const originalError = console.error
  console.error = function (...args) {
    if (typeof args[0] === 'string' && args[0].includes('passive event listener')) return
    originalError.apply(console, args)
  }
})()

import { createRoot } from 'react-dom/client'

import './styles/global.css'
import './styles/CanvasBoard.css'

import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import App from './App.jsx'

// Handle Vite HMR hot reloading of the root safely without warnings
const container = document.getElementById('root')
if (!window.__react_root) {
  window.__react_root = createRoot(container)
}
window.__react_root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

export default App
