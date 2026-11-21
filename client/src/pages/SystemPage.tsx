import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import StatusPill from '../components/StatusPill'
import type { ChannelStatus, HealthResponse, NotificationRecord, SystemSettings } from '../types'

interface StorageInfo {
  backend: string
  available: boolean
  detail: string
  path: string | null
  public_url: boolean
}

export default function SystemPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [channels, setChannels] = useState<ChannelStatus[]>([])
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [healthResult, settingsResult, storageResult, channelResult, notificationResult] = await Promise.all([
        api.health(),
        api.settings(),
        api.storage(),
        api.channels(),
        api.notifications({ page_size: 25 }),
      ])
      setHealth(healthResult)
      setSettings(settingsResult)
      setStorage(storageResult)
      setChannels(channelResult)
      setNotifications(notificationResult.items)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const acknowledge = async (id: string) => {
    setBusy(id)
    try {
      const updated = await api.acknowledge(id)
      setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const sendTestAlert = async () => {
    setBusy('test')
    setMessage(null)
    try {
      const created = await api.testAlert()
      setNotifications((current) => [created, ...current])
      setMessage('Test alert recorded and clearly labelled as a test event.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const uptime = health ? Math.round(health.uptime_seconds / 60) : 0

  return (
    <>
      <div className="page-head">
        <div>
          <h1>System</h1>
          <p>Backend health, notification channels, storage configuration and platform settings.</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? <span className="spinner" /> : null}
            Refresh
          </button>
          <button type="button" className="btn" onClick={() => void sendTestAlert()} disabled={busy === 'test'}>
            Send test alert
          </button>
        </div>
      </div>

      {error ? <div className="notice error" style={{ marginBottom: 12 }}>{error}</div> : null}
      {message ? <div className="notice ok" style={{ marginBottom: 12 }}>{message}</div> : null}

      <div className="grid stats" style={{ marginBottom: 14 }}>
        <div className="stat">
          <span className="stat-label">Platform status</span>
          <span className="stat-value" style={{ textTransform: 'capitalize' }}>
            {health?.status ?? '—'}
          </span>
          <span className="stat-foot">{health ? `${health.app} v${health.version}` : 'Loading'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Uptime</span>
          <span className="stat-value">{health ? `${uptime}m` : '—'}</span>
          <span className="stat-foot">Since last process start</span>
        </div>
        <div className="stat">
          <span className="stat-label">Database</span>
          <span className="stat-value" style={{ fontSize: 18, textTransform: 'capitalize' }}>
            {health?.database_backend ?? '—'}
          </span>
          <span className="stat-foot">{health?.counts?.cameras ?? 0} cameras · {health?.counts?.incidents ?? 0} incidents</span>
        </div>
        <div className="stat">
          <span className="stat-label">Storage backend</span>
          <span className="stat-value" style={{ fontSize: 18, textTransform: 'capitalize' }}>
            {storage?.backend ?? '—'}
          </span>
          <span className="stat-foot">{storage?.available ? 'Writable' : 'Not available'}</span>
        </div>
      </div>

      <div className="grid split" style={{ marginBottom: 14 }}>
        <div className="panel">
          <div className="panel-head">
            <h2>Backend components</h2>
            <span className="hint">{health?.environment ?? 'environment unknown'}</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {(health?.components ?? []).map((component) => (
                  <tr key={component.name}>
                    <td>{component.name}</td>
                    <td>
                      <StatusPill
                        value={component.status === 'ok' ? 'OK' : component.status === 'not_configured' ? 'NOT_CONFIGURED' : component.status.toUpperCase()}
                      />
                    </td>
                    <td className="muted small">{component.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Storage configuration</h2>
            <StatusPill value={storage?.available ? 'OK' : 'DOWN'} />
          </div>
          <div className="panel-body">
            <dl className="kv">
              <dt>Backend</dt>
              <dd>{storage?.backend ?? '—'}</dd>
              <dt>Status</dt>
              <dd>{storage?.detail ?? '—'}</dd>
              <dt>Path</dt>
              <dd className="mono" style={{ wordBreak: 'break-all' }}>{storage?.path ?? '—'}</dd>
              <dt>Public URLs</dt>
              <dd>{storage?.public_url ? 'Dataset evidence served through the API' : 'Local paths only'}</dd>
            </dl>
            <div className="notice" style={{ marginTop: 12 }}>
              Object storage is configured through environment variables only. No credentials are stored in the
              database or returned by the API.
            </div>
          </div>
        </div>
      </div>

      <div className="grid split" style={{ marginBottom: 14 }}>
        <div className="panel">
          <div className="panel-head">
            <h2>Notification channels</h2>
            <span className="hint">Emergency services stay disabled</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Required environment</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.channel}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{channel.label}</div>
                      <div className="muted small">{channel.detail}</div>
                    </td>
                    <td>
                      <StatusPill value={channel.configured ? 'OK' : 'NOT_CONFIGURED'} />
                    </td>
                    <td className="mono small">
                      {channel.required_environment.length ? channel.required_environment.join(', ') : 'None'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Platform settings</h2>
            <span className="hint">Read from server configuration</span>
          </div>
          <div className="panel-body">
            <dl className="kv">
              <dt>Search radii</dt>
              <dd>{(settings?.search_radius_options_km ?? []).map((option) => `${option} km`).join(' · ') || '—'}</dd>
              <dt>Default radius</dt>
              <dd>{settings ? `${settings.default_radius_km} km` : '—'}</dd>
              <dt>Maximum radius</dt>
              <dd>{settings ? `${settings.max_radius_km} km` : '—'}</dd>
              <dt>Demo data</dt>
              <dd>{settings?.demo_data_enabled ? 'Enabled and clearly marked' : 'Disabled'}</dd>
              <dt>Emergency dispatch</dt>
              <dd>{settings?.emergency_services_enabled ? 'Enabled' : 'Disabled by design in this version'}</dd>
            </dl>
            <div className="stack" style={{ marginTop: 14 }}>
              {(settings?.providers ?? []).map((provider) => (
                <div key={provider.id} className="row between" style={{ gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{provider.label}</div>
                    <div className="muted small">{provider.description}</div>
                  </div>
                  <StatusPill value={provider.configured ? 'OK' : 'NOT_CONFIGURED'} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Notification history</h2>
          <span className="hint">{notifications.length} recent records</span>
        </div>
        {notifications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No notifications yet</div>
            <p>Alerts are generated from incident records only. Use the test action to verify the pipeline.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Title</th>
                  <th>Channel</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((record) => (
                  <tr key={record.id}>
                    <td className="mono">{new Date(record.created_at).toLocaleString()}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{record.title}</div>
                      <div className="muted small">{record.body}</div>
                    </td>
                    <td>{record.channel}</td>
                    <td>
                      <StatusPill value={record.severity} />
                    </td>
                    <td>
                      <StatusPill value={record.acknowledged_at ? 'RESOLVED' : 'UNACKNOWLEDGED'} />
                    </td>
                    <td>
                      {record.acknowledged_at ? (
                        <span className="muted small">Acknowledged</span>
                      ) : (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => void acknowledge(record.id)}
                          disabled={busy === record.id}
                        >
                          {busy === record.id ? <span className="spinner" /> : null}
                          Acknowledge
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
