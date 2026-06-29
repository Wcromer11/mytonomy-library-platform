import { useState, useRef } from 'react'
import Papa from 'papaparse'

// Extract text from a PDF using pdf.js via CDN (loaded lazily)
async function extractPDFText(file) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      s.onload = res
      s.onerror = rej
      document.head.appendChild(s)
    })
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  }

  const buffer = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise
  let text = ''
  for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
  }
  return text.slice(0, 6000)
}

async function generateSummary(apiKey, filename, text) {
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `You are summarizing patient education content for a healthcare content library.

File: ${filename}

Content (excerpt):
${text}

Write a 2–3 sentence plain-English summary covering: (1) what the condition or topic is, (2) what the patient needs to know or do, and (3) any critical next step. Use patient-friendly language, not clinical jargon. Respond with the summary only.`,
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

  if (!res.ok) throw new Error(`API ${res.status}`)
  const data = await res.json()
  return data.content[0].text.trim()
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

const STATUS = { pending: '⏳ Pending', running: '⚙️ Processing', done: '✅ Done', error: '❌ Error', skipped: '⏭️ Skipped' }

const s = {
  card: { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 24, marginBottom: 20 },
  h2: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a1a2e' },
  uploadBox: {
    border: '2px dashed #cbd5e1', borderRadius: 8, padding: '28px', textAlign: 'center',
    cursor: 'pointer', background: '#f8fafc', fontSize: 13, color: '#94a3b8', marginBottom: 16,
  },
  progress: { width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBar: (pct) => ({ height: '100%', width: `${pct}%`, background: '#2563eb', borderRadius: 4, transition: 'width 0.3s' }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { background: '#f1f5f9', padding: '8px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: 11 },
  td: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  btn: (color = '#2563eb') => ({
    background: color, color: '#fff', border: 'none', borderRadius: 7,
    padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 8,
  }),
}

export default function SummariesTab({ apiKey }) {
  const [files, setFiles] = useState([])  // { file, name, status, summary, error }
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [resumeFrom, setResumeFrom] = useState(0)
  const abortRef = useRef(false)

  const loadFiles = (fileList) => {
    const newFiles = Array.from(fileList)
      .filter(f => f.name.toLowerCase().endsWith('.pdf'))
      .map(f => ({ file: f, name: f.name, status: 'pending', summary: '', error: '', notes: '' }))
    setFiles(prev => {
      const existingNames = new Set(prev.map(p => p.name))
      const unique = newFiles.filter(f => !existingNames.has(f.name))
      return [...prev, ...unique]
    })
    setDone(0)
    setResumeFrom(0)
  }

  const run = async (startIdx = 0) => {
    if (!apiKey) return alert('Add your Anthropic API key at the top first.')
    setRunning(true)
    abortRef.current = false

    const updated = [...files]

    for (let i = startIdx; i < updated.length; i++) {
      if (abortRef.current) break
      if (updated[i].status === 'done') { setDone(i + 1); continue }

      updated[i] = { ...updated[i], status: 'running' }
      setFiles([...updated])

      try {
        const text = await extractPDFText(updated[i].file)
        if (!text.trim()) {
          updated[i] = { ...updated[i], status: 'error', error: 'Could not extract text (scanned/image PDF?)', notes: 'File unreadable' }
        } else {
          const summary = await generateSummary(apiKey, updated[i].name, text)
          updated[i] = { ...updated[i], status: 'done', summary }
        }
      } catch (e) {
        updated[i] = { ...updated[i], status: 'error', error: e.message, notes: 'Error during processing' }
      }

      setFiles([...updated])
      setDone(i + 1)
      setResumeFrom(i + 1)
    }

    setRunning(false)
  }

  const stop = () => { abortRef.current = true }

  const pct = files.length > 0 ? Math.round((done / files.length) * 100) : 0

  const exportRows = files.map(f => ({
    'PDF File Name': f.name,
    'Summary': f.summary,
    'Status': f.status === 'done' ? 'Generated' : f.status === 'error' ? 'File unreadable' : 'Pending',
    'Assigned to': 'Intern',
    'Notes': f.notes || f.error || '',
  }))

  return (
    <div>
      <div style={s.card}>
        <div style={s.h2}>Written Asset Summary Generator</div>

        <label style={s.uploadBox}>
          <input type="file" accept=".pdf" multiple style={{ display: 'none' }}
            onChange={e => loadFiles(e.target.files)} />
          {files.length > 0
            ? `✓ ${files.length} PDF${files.length !== 1 ? 's' : ''} loaded — click to add more`
            : 'Click to upload PDFs (select multiple)'}
        </label>

        {files.length > 0 && (
          <div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
              {done} / {files.length} processed ({pct}%)
            </div>
            <div style={s.progress}><div style={s.progressBar(pct)} /></div>

            <div style={{ margin: '12px 0' }}>
              {!running ? (
                <>
                  <button style={s.btn()} onClick={() => run(resumeFrom > 0 ? resumeFrom : 0)}>
                    {resumeFrom > 0 && done < files.length ? `Resume from #${resumeFrom + 1}` : 'Generate Summaries'}
                  </button>
                  {done > 0 && (
                    <button style={s.btn('#059669')} onClick={() => downloadCSV(exportRows, 'summaries_tracking_sheet.csv')}>
                      Export Tracking Sheet
                    </button>
                  )}
                  {resumeFrom > 0 && done < files.length && (
                    <button style={s.btn('#6b7280')} onClick={() => { setResumeFrom(0); setDone(0); setFiles(files.map(f => ({ ...f, status: 'pending', summary: '', error: '' }))) }}>
                      Start Over
                    </button>
                  )}
                </>
              ) : (
                <button style={s.btn('#dc2626')} onClick={stop}>Stop (resume later)</button>
              )}
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, width: 30 }}>#</th>
                    <th style={s.th}>File Name</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Summary</th>
                    <th style={s.th}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...s.td, color: '#94a3b8' }}>{i + 1}</td>
                      <td style={s.td}>{f.name}</td>
                      <td style={s.td}>{STATUS[f.status]}</td>
                      <td style={{ ...s.td, maxWidth: 400, color: f.summary ? '#1a1a2e' : '#94a3b8' }}>
                        {f.summary || (f.status === 'running' ? '…' : '—')}
                      </td>
                      <td style={{ ...s.td, color: '#dc2626', fontSize: 11 }}>{f.error || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
