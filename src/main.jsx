import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: '24px',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          background: '#F7FBF9', color: '#2D4A3E', textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌱</div>
          <h2 style={{ marginBottom: '8px' }}>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: '24px', fontSize: '14px' }}>
            {this.state.error?.message || 'Please refresh to try again'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#7BC4A0', color: '#fff', border: 'none',
              borderRadius: '12px', padding: '12px 24px', fontSize: '16px', cursor: 'pointer'
            }}
          >
            Refresh App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
