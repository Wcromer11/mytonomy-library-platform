import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: r => resolve(r),
      error: reject,
    })
  })
}

function downloadCSV(rows, filename) {
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function queryData(apiKey, question, dataset) {
  const sample = dataset.slice(0, 200)
  const headers = Object.keys(sample[0] || {})
  const rows = sample.map(r => headers.map(h => r[h]).join('\t')).join('\n')

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `You are a data analyst assistant. Answer the user's question about the dataset below.

Dataset columns: ${headers.join(', ')}
Total rows in dataset: ${dataset.length}
Sample rows (up to 200):
${headers.join('\t')}
${rows}

User question: "${question}"

First, confirm your interpretation in one sentence.
Then respond with a JSON object:
{
  "interpretation": "Filtering by ..., found N assets.",
  "answer_text": "brief prose answer if the question is not about rows",
  "rows": [ /* array of matching row objects, or empty array if not applicable */ ]
}

If the question asks to filter/show rows, populate "rows". If it's a count or factual question, populate "answer_text" and leave "rows" empty.`,
      },
    ],
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  const text = data.content[0].text

  // extract JSON from response
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch { /* fall through */ }
  }
  return { interpretation: '', answer_text: text, rows: [] }
}

const s = {
  card: { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 24, marginBottom: 20 },
  h2: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a1a2e' },
  uploadBox: {
    border: '2px dashed #cbd5e1', borderRadius: 8, padding: '16px', textAlign: 'center',
    cursor: 'pointer', background: '#f8fafc', fontSize: 13, color: '#94a3b8', marginBottom: 16,
  },
  chatArea: {
    height: 420, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8,
    padding: 16, background: '#f8fafc', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12,
  },
  bubble: (role) => ({
    maxWidth: '85%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? '#2563eb' : '#fff',
    color: role === 'user' ? '#fff' : '#1a1a2e',
    borderRadius: role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
    padding: '10px 14px',
    fontSize: 13,
    border: role === 'user' ? 'none' : '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  }),
  inputRow: { display: 'flex', gap: 8 },
  input: {
    flex: 1, padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: 8,
    fontSize: 13, outline: 'none',
  },
  sendBtn: {
    background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
    padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 },
  th: { background: '#f1f5f9', padding: '7px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e2e8f0', color: '#475569' },
  td: { padding: '6px 10px', borderBottom: '1px solid #f1f5f9' },
}

export default function QueryTab({ apiKey }) {
  const [dataset, setDataset] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatRef = useRef(null)

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  const loadFile = async (file) => {
    const parsed = await parseCSV(file)
    setDataset({ name: file.name, rows: parsed.data, headers: parsed.meta.fields })
    setMessages([{
      role: 'assistant',
      text: `Loaded **${file.name}** — ${parsed.data.length} rows, columns: ${parsed.meta.fields.join(', ')}. Ask me anything about this data.`,
      rows: [],
    }])
  }

  const send = async () => {
    if (!input.trim() || loading) return
    if (!dataset) {
      setMessages(m => [...m, { role: 'user', text: input }, { role: 'assistant', text: 'Please upload a dataset file first.', rows: [] }])
      setInput('')
      return
    }
    if (!apiKey) {
      setMessages(m => [...m, { role: 'user', text: input }, { role: 'assistant', text: 'Enter your Anthropic API key at the top of the page to use the query feature.', rows: [] }])
      setInput('')
      return
    }

    const userMsg = input
    setInput('')
    setMessages(m => [...m, { role: 'user', text: userMsg }])
    setLoading(true)

    try {
      const result = await queryData(apiKey, userMsg, dataset.rows)
      setMessages(m => [...m, {
        role: 'assistant',
        text: result.interpretation || result.answer_text || '',
        rows: result.rows || [],
      }])
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', text: `Error: ${e.message}`, rows: [] }])
    }

    setLoading(false)
  }

  const suggestions = [
    'Filter out the pediatrics assets from this list',
    'Show me everything unique to Health Nuts',
    'Which assets have no ICD code?',
    'How many assets are available?',
    'Show me all partial matches that need review',
  ]

  return (
    <div>
      <div style={s.card}>
        <div style={s.h2}>Natural Language Query</div>
        <label style={s.uploadBox}>
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => e.target.files[0] && loadFile(e.target.files[0])} />
          {dataset ? `✓ ${dataset.name} (${dataset.rows.length} rows)` : 'Upload a CSV to query (crosswalk results, video catalog, etc.)'}
        </label>

        {messages.length === 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Example queries:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => setInput(s)}
                  style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 20, padding: '5px 14px', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={s.chatArea} ref={chatRef}>
          {messages.map((msg, i) => (
            <div key={i}>
              <div style={s.bubble(msg.role)}>
                {msg.text}
                {msg.rows && msg.rows.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => downloadCSV(msg.rows, 'query_result.csv')}
                      style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 12px', fontSize: 11, cursor: 'pointer', marginBottom: 8 }}>
                      Download CSV ({msg.rows.length} rows)
                    </button>
                    <div style={{ overflowX: 'auto', maxHeight: 240, overflowY: 'auto' }}>
                      <table style={s.table}>
                        <thead>
                          <tr>{Object.keys(msg.rows[0]).map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {msg.rows.slice(0, 50).map((row, ri) => (
                            <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              {Object.values(row).map((v, vi) => <td key={vi} style={s.td}>{String(v ?? '')}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {msg.rows.length > 50 && <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 8px' }}>Showing 50 of {msg.rows.length} — download CSV for all</div>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={s.bubble('assistant')}>
              <span style={{ color: '#94a3b8' }}>Thinking…</span>
            </div>
          )}
        </div>

        <div style={s.inputRow}>
          <input
            style={s.input}
            placeholder="Ask anything about your data…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button style={s.sendBtn} onClick={send} disabled={loading}>Send</button>
        </div>
      </div>
    </div>
  )
}
