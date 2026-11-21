import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import StatusPill, { DemoPill } from '../components/StatusPill'
import type { Incident, IncidentSummary } from '../types'

const SEVERITIES = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const VERIFICATION = ['', 'ai_detected', 'verified', 'false_positive', 'resolved']
const PAGE_SIZE = 20

export default function IncidentsPage() {
  const [categories, setCategories] = useState<string[]>([])
  const [summary, setSummary] = useState<IncidentSummary | null>(null)
  const [items, setItems] = useState<Incident[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [filters, setFilters] = useState({
    category: '',
    severity: '',
    verification_status: '',
    city: '',
    district: '',
    state: '',
    country: '',
    date_from: '',
    date_to: '',
  })

  useEffect(() => {
    api
      .incidentCategories()
      .then((result) => setCategories(result.categories))
      .catch(() => setCategories([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pageResult, summaryResult] = await Promise.all([
        api.incidents({
          page,
          page_size: PAGE_SIZE,
          category: filters.category || undefined,
          severity: filters.severity || undefined,
          verification_status: filters.verification_status || undefined,
          city: filters.city.trim() || undefined,
          district: filters.district.trim() || undefined,
          state: filters.state.trim() || undefined,
          country: filters.country.trim() || undefined,
          date_from: filters.date_from ? new Date(filters.date_from).toISOString() : undefined,
          date_to: filters.date_to ? new Date(filters.date_to).toISOString() : undefined,
        }),
        api.incidentSummary(),
      ])
      setItems(pageResult.items)
      setTotal(pageResult.total)
      setSummary(summaryResult)
      setSelectedId((current) => {
        if (current && pageResult.items.some((item) => item.id === current)) return current
        return pageResult.items[0]?.id ?? null
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    void load()
  }, [load])

  const selected = items.find((item) => item.id === selectedId) ?? null

  const updateStatus = async (id: string, verification_status: string) => {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateIncident(id, { verification_status })
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      const summaryResult = await api.incidentSummary()
      setSummary(summaryResult)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value.trim() !== '').length,
    [filters],
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Incident intelligence</h1>
          <p>
            Verified and AI-detected road incidents. AI detections are never presented as confirmed events until an
            operator reviews them.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? <span className="spinner" /> : null}
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="notice error" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="grid stats" style={{ marginBottom: 14 }}>
        <div className="stat">
          <span className="stat-label">Total records</span>
          <span className="stat-value">{summary?.total ?? 0}</span>
          <span className="stat-foot">Across all regions</span>
        </div>
        <div className="stat">
          <span className="stat-label">Last 24 hours</span>
          <span className="stat-value">{summary?.last_24h ?? 0}</span>
          <span className="stat-foot">Newly recorded incidents</span>
        </div>
        <div className="stat">
          <span className="stat-label">Awaiting review</span>
          <span className="stat-value">{summary?.by_verification?.ai_detected ?? 0}</span>
          <span className="stat-foot">AI detections without human confirmation</span>
        </div>
        <div className="stat">
          <span className="stat-label">Critical open</span>
          <span className="stat-value">{summary?.critical_open ?? 0}</span>
          <span className="stat-foot">Not resolved</span>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <h2>Filters</h2>
          <span className="hint">{activeFilterCount} active</span>
        </div>
        <div className="panel-body">
          <div className="field-row">
            <label className="field">
              <span>Category</span>
              <select
                value={filters.category}
                onChange={(event) => {
                  setPage(1)
                  setFilters((current) => ({ ...current, category: event.target.value }))
                }}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Severity</span>
              <select
                value={filters.severity}
                onChange={(event) => {
                  setPage(1)
                  setFilters((current) => ({ ...current, severity: event.target.value }))
                }}
              >
                {SEVERITIES.map((severity) => (
                  <option key={severity || 'all'} value={severity}>
                    {severity || 'All severities'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Verification</span>
              <select
                value={filters.verification_status}
                onChange={(event) => {
                  setPage(1)
                  setFilters((current) => ({ ...current, verification_status: event.target.value }))
                }}
              >
                {VERIFICATION.map((status) => (
                  <option key={status || 'all'} value={status}>
                    {status ? status.replace(/_/g, ' ') : 'All statuses'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>City</span>
              <input
                type="text"
                value={filters.city}
                placeholder="Any city"
                onChange={(event) => {
                  setPage(1)
                  setFilters((current) => ({ ...current, city: event.target.value }))
                }}
              />
            </label>
            <label className="field">
              <span>District</span>
              <input
                type="text"
                value={filters.district}
                placeholder="Any district"
                onChange={(event) => {
                  setPage(1)
                  setFilters((current) => ({ ...current, district: event.target.value }))
                }}
              />
            </label>
            <label className="field">
              <span>State</span>
              <input
                type="text"
                value={filters.state}
                placeholder="Any state"
                onChange={(event) => {
                  setPage(1)
                  setFilters((current) => ({ ...current, state: event.target.value }))
                }}
              />
            </label>
            <label className="field">
              <span>Country</span>
              <input
                type="text"
                value={filters.country}
                placeholder="Any country"
                onChange={(event) => {
                  setPage(1)
                  setFilters((current) => ({ ...current, country: event.target.value }))
                }}
              />
            </label>
            <label className="field">
              <span>From</span>
              <input
                type="datetime-local"
                value={filters.date_from}
                onChange={(event) => {
                  setPage(1)
                  setFilters((current) => ({ ...current, date_from: event.target.value }))
                }}
              />
            </label>
            <label className="field">
              <span>To</span>
              <input
                type="datetime-local"
                value={filters.date_to}
                onChange={(event) => {
                  setPage(1)
                  setFilters((current) => ({ ...current, date_to: event.target.value }))
                }}
              />
            </label>
          </div>
          {activeFilterCount ? (
            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setPage(1)
                  setFilters({
                    category: '',
                    severity: '',
                    verification_status: '',
                    city: '',
                    district: '',
                    state: '',
                    country: '',
                    date_from: '',
                    date_to: '',
                  })
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid two">
        <div className="panel">
          <div className="panel-head">
            <h2>Incidents</h2>
            <span className="hint">
              {total} record{total === 1 ? '' : 's'} · page {page} of {pages}
            </span>
          </div>
          {loading ? (
            <div className="panel-body">
              <div className="skeleton" style={{ width: '80%', marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '60%' }} />
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No incidents match these filters</div>
              <p>Adjust the filters or clear them to see the full record set.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Detected</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Confidence</th>
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((incident) => (
                    <tr
                      key={incident.id}
                      className={`clickable${incident.id === selectedId ? ' selected' : ''}`}
                      onClick={() => setSelectedId(incident.id)}
                    >
                      <td className="mono">{new Date(incident.detected_at).toLocaleString()}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{incident.category.replace(/_/g, ' ')}</div>
                        <div className="muted small">
                          {incident.source} <DemoPill show={incident.is_demo} />
                        </div>
                      </td>
                      <td>
                        <StatusPill value={incident.severity} />
                      </td>
                      <td className="mono">
                        {incident.confidence != null ? `${Math.round(incident.confidence * 100)}%` : '—'}
                      </td>
                      <td className="small">
                        {[incident.city, incident.state, incident.country].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td>
                        <StatusPill value={incident.verification_status.toUpperCase()} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="panel-body" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="row between">
              <span className="muted small">
                Showing {items.length} of {total}
              </span>
              <div className="row">
                <button type="button" className="btn small" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>
                  Previous
                </button>
                <button type="button" className="btn small" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages || loading}>
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Incident record</h2>
            {selected ? <StatusPill value={selected.verification_status.toUpperCase()} /> : null}
          </div>
          <div className="panel-body">
            {!selected ? (
              <div className="empty-state">
                <div className="empty-title">No incident selected</div>
                <p>Select a row to review evidence and verification status.</p>
              </div>
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                {selected.evidence_image_url ? (
                  <div className="feed-frame" style={{ aspectRatio: '16 / 9' }}>
                    <img src={selected.evidence_image_url} alt={`Evidence for ${selected.category}`} />
                  </div>
                ) : (
                  <div className="notice">No evidence image is attached to this record.</div>
                )}

                <div className="row">
                  <StatusPill value={selected.severity} />
                  <StatusPill value={selected.verification_status.toUpperCase()} />
                  <DemoPill show={selected.is_demo} />
                </div>

                <dl className="kv">
                  <dt>Category</dt>
                  <dd style={{ textTransform: 'capitalize' }}>{selected.category.replace(/_/g, ' ')}</dd>
                  <dt>Detected</dt>
                  <dd>{new Date(selected.detected_at).toLocaleString()}</dd>
                  <dt>Confidence</dt>
                  <dd>{selected.confidence != null ? `${Math.round(selected.confidence * 100)}%` : 'Not scored'}</dd>
                  <dt>Source</dt>
                  <dd>{selected.source}</dd>
                  <dt>Camera</dt>
                  <dd>{selected.camera_name ?? 'No camera associated'}</dd>
                  <dt>Location</dt>
                  <dd>
                    {[selected.city, selected.district, selected.state, selected.country].filter(Boolean).join(', ') || '—'}
                  </dd>
                  <dt>Coordinates</dt>
                  <dd className="mono">
                    {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                  </dd>
                  <dt>Video reference</dt>
                  <dd className="mono" style={{ wordBreak: 'break-all' }}>{selected.video_reference ?? '—'}</dd>
                  <dt>Description</dt>
                  <dd>{selected.description ?? '—'}</dd>
                </dl>

                <div className="row">
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => void updateStatus(selected.id, 'verified')}
                    disabled={saving || selected.verification_status === 'verified'}
                  >
                    Mark verified
                  </button>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => void updateStatus(selected.id, 'false_positive')}
                    disabled={saving || selected.verification_status === 'false_positive'}
                  >
                    False positive
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => void updateStatus(selected.id, 'resolved')}
                    disabled={saving || selected.verification_status === 'resolved'}
                  >
                    Mark resolved
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
