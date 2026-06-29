import { useState } from 'react'
import CrosswalkTab from './components/CrosswalkTab'
import SummariesTab from './components/SummariesTab'
import QueryTab from './components/QueryTab'

const TABS = ['Crosswalk', 'Summaries', 'Query']

const styles = {
  header: {
    background: '#1a1a2e',
    color: '#fff',
    padding: '0 32px',
    display: 'flex',
    alignItems: 'center',
    gap: 32,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    padding: '18px 0',
    letterSpacing: '-0.3px',
    color: '#7ecfff',
  },
  nav: {
    display: 'flex',
    gap: 4,
    flex: 1,
  },
  tab: (active) => ({
    padding: '18px 20px',
    background: 'none',
    border: 'none',
    color: active ? '#fff' : 'rgba(255,255,255,0.55)',
    fontWeight: active ? 600 : 400,
    fontSize: 14,
    borderBottom: active ? '2px solid #7ecfff' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  }),
  apiKeyBar: {
    background: '#fff',
    borderBottom: '1px solid #e2e8f0',
    padding: '8px 32px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: 13,
  },
  apiKeyInput: {
    flex: 1,
    maxWidth: 420,
    padding: '6px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  content: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '32px 24px',
  },
}

export default function App() {
  const [activeTab, setActiveTab] = useState('Crosswalk')
  const [apiKey, setApiKey] = useState('')

  return (
    <div>
      <header style={styles.header}>
        <div style={styles.logo}>Mytonomy Content Library</div>
        <nav style={styles.nav}>
          {TABS.map(tab => (
            <button key={tab} style={styles.tab(activeTab === tab)} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </nav>
      </header>

      <div style={styles.apiKeyBar}>
        <span style={{ color: '#64748b' }}>Anthropic API Key:</span>
        <input
          type="password"
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          style={styles.apiKeyInput}
        />
        {apiKey && <span style={{ color: '#16a34a', fontSize: 12 }}>✓ Key set</span>}
      </div>

      <main style={styles.content}>
        {activeTab === 'Crosswalk' && <CrosswalkTab apiKey={apiKey} />}
        {activeTab === 'Summaries' && <SummariesTab apiKey={apiKey} />}
        {activeTab === 'Query' && <QueryTab apiKey={apiKey} />}
      </main>
    </div>
  )
}
