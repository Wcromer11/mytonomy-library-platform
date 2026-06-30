import { useState, useCallback } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ── helpers ──────────────────────────────────────────────────────────────────

function normalize(str = '') {
  return str
    .toLowerCase()
    .replace(/^healthnuts:\s*/i, '')
    .replace(/^mytonomy:\s*/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

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

function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        const fields = data.length > 0 ? Object.keys(data[0]) : []
        resolve({ data, meta: { fields } })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
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

// Anthropic API call – temperature 0
async function semanticMatch(apiKey, titleA, candidatesB) {
  const candidateList = candidatesB.map((c, i) => `${i + 1}. ${c}`).join('\n')
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `You are a clinical content librarian. Determine which of the candidate titles (if any) covers the same clinical topic as the source title.

Source title: "${titleA}"

Candidates:
${candidateList}

Respond with JSON only:
{"match_index": <1-based index or null>, "confidence": <"high"|"medium"|"low">, "match_type": <"semantic"|"partial"|"none">}`,
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

  if (!res.ok) throw new Error(`Anthropic API error ${res.status}`)
  const data = await res.json()
  try {
    return JSON.parse(data.content[0].text)
  } catch {
    return { match_index: null, match_type: 'none', confidence: 'low' }
  }
}

// ── styles ───────────────────────────────────────────────────────────────────

const s = {
  card: {
    background: '#fff',
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    padding: 24,
    marginBottom: 20,
  },
  h2: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1a1a2e' },
  row: { display: 'flex', gap: 20, marginBottom: 16 },
  col: { flex: 1 },
  label: { fontSize: 13, color: '#64748b', marginBottom: 6, display: 'block' },
  uploadBox: {
    border: '2px dashed #cbd5e1',
    borderRadius: 8,
    padding: '20px 16px',
    textAlign: 'center',
    cursor: 'pointer',
    background: '#f8fafc',
    fontSize: 13,
    color: '#94a3b8',
    transition: 'border-color 0.15s',
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: 13,
    marginTop: 8,
    background: '#fff',
  },
  btn: (color = '#2563eb') => ({
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  }),
  statRow: { display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  stat: (color) => ({
    background: color,
    borderRadius: 8,
    padding: '12px 20px',
    flex: 1,
    minWidth: 120,
    textAlign: 'center',
  }),
  statNum: { fontSize: 24, fontWeight: 700 },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 2 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { background: '#f1f5f9', textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e2e8f0', fontWeight: 600, fontSize: 12, color: '#475569' },
  td: { padding: '9px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  badge: (type) => {
    const map = {
      'Exact Match': { bg: '#dcfce7', color: '#15803d' },
      'Semantic Match': { bg: '#dbeafe', color: '#1d4ed8' },
      'Partial Match': { bg: '#fef9c3', color: '#854d0e' },
      'Unique to A': { bg: '#fee2e2', color: '#b91c1c' },
      'Unique to B': { bg: '#f3e8ff', color: '#7e22ce' },
    }
    const style = map[type] || { bg: '#f1f5f9', color: '#475569' }
    return {
      display: 'inline-block',
      padding: '2px 9px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: style.bg,
      color: style.color,
    }
  },
  progress: {
    width: '100%',
    height: 8,
    background: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressBar: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: '#2563eb',
    borderRadius: 4,
    transition: 'width 0.3s',
  }),
}

// ── component ─────────────────────────────────────────────────────────────────

export default function CrosswalkTab({ apiKey }) {
  const [libA, setLibA] = useState(null)
  const [libB, setLibB] = useState(null)
  const [colA, setColA] = useState('')
  const [colB, setColB] = useState('')
  const [filterColA, setFilterColA] = useState('')
  const [filterValA, setFilterValA] = useState('')
  const [filterColB, setFilterColB] = useState('')
  const [filterValB, setFilterValB] = useState('')
  const [results, setResults] = useState(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, msg: '' })
  const [filterType, setFilterType] = useState('All')
  const [error, setError] = useState('')

  const loadFile = async (file, setter, setCol) => {
    const isXlsx = file.name.match(/\.xlsx?$/i)
    const parsed = isXlsx ? await parseXLSX(file) : await parseCSV(file)
    setter({ name: file.name, data: parsed.data, headers: parsed.meta.fields })
    const fields = parsed.meta.fields
    const titleCol = fields.find(h => /title/i.test(h)) || fields.find(h => /name/i.test(h))
    if (titleCol && setCol) setCol(titleCol)
  }

  const getFilteredRows = (lib, col, filterCol, filterVal) => {
    let rows = lib.data
    if (filterCol && filterVal) {
      rows = rows.filter(r => (r[filterCol] || '').toLowerCase().includes(filterVal.toLowerCase()))
    }
    return rows.map(r => r[col]).filter(Boolean)
  }

  const runCrosswalk = async () => {
    setError('')
    if (!libA || !libB || !colA || !colB) {
      setError('Upload both files and select title columns first.')
      return
    }

    setRunning(true)
    setResults(null)

    const titlesA = getFilteredRows(libA, colA, filterColA, filterValA)
    const titlesB = getFilteredRows(libB, colB, filterColB, filterValB)
    const normB = titlesB.map(t => normalize(t))

    const output = []
    const matchedBIdx = new Set()

    // Phase 1: exact matching
    setProgress({ done: 0, total: titlesA.length, msg: 'Running exact matching…' })

    const unmatched = []
    for (let i = 0; i < titlesA.length; i++) {
      const normA = normalize(titlesA[i])
      const exactIdx = normB.findIndex((nb, bi) => nb === normA && !matchedBIdx.has(bi))
      if (exactIdx !== -1) {
        matchedBIdx.add(exactIdx)
        output.push({ title_A: titlesA[i], title_B: titlesB[exactIdx], classification: 'Exact Match', confidence: 'high' })
      } else {
        unmatched.push({ i, titleA: titlesA[i], normA })
      }
      setProgress({ done: i + 1, total: titlesA.length, msg: 'Running exact matching…' })
    }

    // Phase 2: semantic matching (only if API key provided)
    if (apiKey && unmatched.length > 0) {
      setProgress({ done: 0, total: unmatched.length, msg: 'Running semantic matching…' })
      const remainingB = titlesB.filter((_, bi) => !matchedBIdx.has(bi))
      const remainingBIdx = titlesB.map((_, bi) => bi).filter(bi => !matchedBIdx.has(bi))

      for (let u = 0; u < unmatched.length; u++) {
        const { titleA } = unmatched[u]
        try {
          // Compare against up to 20 unmatched B candidates
          const candidates = remainingB.slice(0, 20)
          const result = await semanticMatch(apiKey, titleA, candidates)
          if (result.match_index !== null && result.match_type !== 'none') {
            const bLocal = result.match_index - 1
            const bGlobal = remainingBIdx[bLocal]
            if (bGlobal !== undefined && !matchedBIdx.has(bGlobal)) {
              matchedBIdx.add(bGlobal)
              const type = result.confidence === 'low' || result.match_type === 'partial'
                ? 'Partial Match'
                : 'Semantic Match'
              output.push({ title_A: titleA, title_B: titlesB[bGlobal], classification: type, confidence: result.confidence })
            } else {
              output.push({ title_A: titleA, title_B: '', classification: 'Unique to A', confidence: '' })
            }
          } else {
            output.push({ title_A: titleA, title_B: '', classification: 'Unique to A', confidence: '' })
          }
        } catch {
          output.push({ title_A: titleA, title_B: '', classification: 'Unique to A', confidence: '' })
        }
        setProgress({ done: u + 1, total: unmatched.length, msg: 'Running semantic matching…' })
      }
    } else {
      unmatched.forEach(({ titleA }) => {
        output.push({ title_A: titleA, title_B: '', classification: 'Unique to A', confidence: '' })
      })
    }

    // Unique to B
    titlesB.forEach((t, bi) => {
      if (!matchedBIdx.has(bi)) {
        output.push({ title_A: '', title_B: t, classification: 'Unique to B', confidence: '' })
      }
    })

    setResults(output)
    setRunning(false)
  }

  const counts = results ? {
    total: results.length,
    exact: results.filter(r => r.classification === 'Exact Match').length,
    semantic: results.filter(r => r.classification === 'Semantic Match').length,
    partial: results.filter(r => r.classification === 'Partial Match').length,
    uniqueA: results.filter(r => r.classification === 'Unique to A').length,
    uniqueB: results.filter(r => r.classification === 'Unique to B').length,
  } : null

  const filtered = results?.filter(r => filterType === 'All' || r.classification === filterType)

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div>
      <div style={s.card}>
        <div style={s.h2}>Content Crosswalk</div>
        <div style={s.row}>
          {/* Library A */}
          <div style={s.col}>
            <label style={s.label}>Library A (e.g., Health Nuts)</label>
            <label style={{ ...s.uploadBox, borderColor: libA ? '#22c55e' : '#cbd5e1' }}>
              <input type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={e => e.target.files[0] && loadFile(e.target.files[0], setLibA, setColA)} />
              {libA ? `✓ ${libA.name} (${libA.data.length} rows)` : 'Click to upload CSV / XLSX'}
            </label>
            {libA && (
              <>
                <select style={s.select} value={colA} onChange={e => setColA(e.target.value)}>
                  <option value="">— Select title column —</option>
                  {libA.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <select style={{ ...s.select, marginTop: 0, flex: 1 }} value={filterColA} onChange={e => setFilterColA(e.target.value)}>
                    <option value="">Filter by column (optional)</option>
                    {libA.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {filterColA && (
                    <input style={{ ...s.select, marginTop: 0, flex: 1 }} placeholder="Value" value={filterValA} onChange={e => setFilterValA(e.target.value)} />
                  )}
                </div>
              </>
            )}
          </div>

          {/* Library B */}
          <div style={s.col}>
            <label style={s.label}>Library B (e.g., Mytonomy)</label>
            <label style={{ ...s.uploadBox, borderColor: libB ? '#22c55e' : '#cbd5e1' }}>
              <input type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={e => e.target.files[0] && loadFile(e.target.files[0], setLibB, setColB)} />
              {libB ? `✓ ${libB.name} (${libB.data.length} rows)` : 'Click to upload CSV / XLSX'}
            </label>
            {libB && (
              <>
                <select style={s.select} value={colB} onChange={e => setColB(e.target.value)}>
                  <option value="">— Select title column —</option>
                  {libB.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <select style={{ ...s.select, marginTop: 0, flex: 1 }} value={filterColB} onChange={e => setFilterColB(e.target.value)}>
                    <option value="">Filter by column (optional)</option>
                    {libB.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {filterColB && (
                    <input style={{ ...s.select, marginTop: 0, flex: 1 }} placeholder="Value" value={filterValB} onChange={e => setFilterValB(e.target.value)} />
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {error && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button style={s.btn()} onClick={runCrosswalk} disabled={running}>
            {running ? 'Running…' : 'Run Crosswalk'}
          </button>
          {!apiKey && (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>No API key → exact match only</span>
          )}
        </div>

        {running && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>{progress.msg} ({progress.done}/{progress.total})</div>
            <div style={s.progress}><div style={s.progressBar(pct)} /></div>
          </div>
        )}
      </div>

      {counts && (
        <div style={s.card}>
          <div style={s.h2}>Results</div>
          <div style={s.statRow}>
            {[
              ['All', counts.total, '#f8fafc'],
              ['Exact Match', counts.exact, '#f0fdf4'],
              ['Semantic Match', counts.semantic, '#eff6ff'],
              ['Partial Match', counts.partial, '#fefce8'],
              ['Unique to A', counts.uniqueA, '#fef2f2'],
              ['Unique to B', counts.uniqueB, '#faf5ff'],
            ].map(([label, val, bg]) => (
              <button key={label} onClick={() => setFilterType(label)}
                style={{ ...s.stat(bg), border: filterType === label ? '2px solid #2563eb' : '2px solid transparent', cursor: 'pointer' }}>
                <div style={s.statNum}>{val}</div>
                <div style={s.statLabel}>{label}</div>
              </button>
            ))}
          </div>

          {counts.total > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#475569' }}>
                Coverage: <strong>{Math.round(((counts.exact + counts.semantic) / (counts.total - counts.uniqueB)) * 100)}%</strong> of Library A matched
              </span>
              <button style={{ ...s.btn('#059669'), marginLeft: 16, padding: '6px 16px', fontSize: 13 }}
                onClick={() => downloadCSV(results, 'crosswalk_results.csv')}>
                Export CSV
              </button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Library A Title</th>
                  <th style={s.th}>Library B Match</th>
                  <th style={s.th}>Classification</th>
                  <th style={s.th}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={s.td}>{row.title_A || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                    <td style={s.td}>{row.title_B || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                    <td style={s.td}><span style={s.badge(row.classification)}>{row.classification}</span></td>
                    <td style={s.td}><span style={{ fontSize: 12, color: '#64748b' }}>{row.confidence || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
