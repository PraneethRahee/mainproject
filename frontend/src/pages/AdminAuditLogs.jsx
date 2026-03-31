import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/session.js'
import { Card } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'

function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString()
}

function AdminAuditLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [resultFilter, setResultFilter] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError('')

        const params = new URLSearchParams()
        params.set('limit', String(pageSize))
        params.set('skip', String(page * pageSize))

        const res = await apiRequest(`/admin/audit-logs?${params.toString()}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return

        if (!res.ok) {
          setLogs([])
          setTotal(0)
          setError(data.error || 'Failed to load audit logs')
          return
        }

        const items = Array.isArray(data.logs) ? data.logs : []
        setLogs(items)
        setTotal(typeof data.total === 'number' ? data.total : items.length)
      } catch {
        if (!cancelled) {
          setLogs([])
          setTotal(0)
          setError('Failed to load audit logs')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [page, pageSize])

  const filteredLogs = logs.filter((log) => {
    if (actionFilter && !String(log.action || '').toLowerCase().includes(actionFilter.toLowerCase())) {
      return false
    }
    if (resultFilter && String(log.result || '').toLowerCase() !== resultFilter.toLowerCase()) {
      return false
    }
    return true
  })

  const totalPages = Math.max(Math.ceil(total / pageSize), 1)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', padding: 'var(--space-6) 0' }}>
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--text-3xl)', marginBottom: 'var(--space-2)' }}>Audit Logs</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          Review security-sensitive actions across auth, chat, files, and admin operations.
        </p>
      </header>

      <Card elevated style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', alignItems: 'flex-end' }}>
          <Input
            label="Action"
            type="text"
            placeholder="Filter by action (e.g. auth.login)"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setPage(0)
            }}
          />
          <div className="ui-input-container">
            <label className="ui-input-label">Result</label>
            <select
              className="ui-input"
              value={resultFilter}
              onChange={(e) => {
                setResultFilter(e.target.value)
                setPage(0)
              }}
            >
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
          </div>
        </div>
      </Card>

      <Card elevated style={{ padding: 0, overflow: 'hidden' }}>
        {loading && (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <p>Loading audit logs…</p>
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-error)' }}>
            <p>{error}</p>
          </div>
        )}
        {!loading && !error && filteredLogs.length === 0 && (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <p>No audit events found for this filter.</p>
          </div>
        )}
        {!loading && !error && filteredLogs.length > 0 && (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Result</th>
                  <th>IP / Device</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log._id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.actor || 'system'}</td>
                    <td>{log.action}</td>
                    <td>
                      {log.targetType}
                      {log.targetId ? ` · ${log.targetId}` : ''}
                    </td>
                    <td style={{ color: log.result === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>{log.result}</td>
                    <td>
                      <div style={{ fontSize: 'var(--text-xs)', opacity: 0.9 }}>{log.ip || 'unknown'}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{log.userAgent || ''}</div>
                    </td>
                    <td>
                      <pre className="audit-details">
                        {log.metadata ? JSON.stringify(log.metadata, null, 2) : '{}'}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-6)' }}>
        <Button
          variant="secondary"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(p - 1, 0))}
        >
          Previous
        </Button>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          Page {page + 1} of {totalPages}
        </span>
        <Button
          variant="secondary"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export default AdminAuditLogs
