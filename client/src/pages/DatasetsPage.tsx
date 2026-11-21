import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import StatusPill from '../components/StatusPill'
import type { Camera, Dataset, DetectorRuntime, ModelRecord } from '../types'

type Tab = 'datasets' | 'cameras' | 'models' | 'storage'

interface StorageInfo {
  backend: string
  available: boolean
  detail: string
  path: string | null
  public_url: boolean
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'datasets', label: 'Datasets' },
  { id: 'cameras', label: 'Camera sources' },
  { id: 'models', label: 'AI models' },
  { id: 'storage', label: 'Storage' },
]

const DATASET_CATEGORIES = ['road_hazard', 'accident', 'traffic', 'environmental', 'infrastructure', 'other']
const SOURCE_TYPES = ['hls', 'http_video', 'rtsp', 'jpeg_snapshot', 'web_page']
const ACCESS_CLASSES = ['public', 'authorized', 'unverified', 'restricted']

function formatBytes(value: number) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export default function DatasetsPage() {
  const [tab, setTab] = useState<Tab>('datasets')
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)
  const [cameras, setCameras] = useState<Camera[]>([])
  const [models, setModels] = useState<ModelRecord[]>([])
  const [detectors, setDetectors] = useState<DetectorRuntime[]>([])
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [datasetForm, setDatasetForm] = useState({ name: '', category: 'road_hazard', description: '' })
  const [importForm, setImportForm] = useState({ dataset_id: '', dataset_name: '', category: 'road_hazard', metadata: '' })
  const [importFiles, setImportFiles] = useState<File[]>([])
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [cameraForm, setCameraForm] = useState({
    name: '',
    provider: 'registry',
    city: '',
    district: '',
    state: '',
    country: '',
    latitude: '',
    longitude: '',
    source_type: 'hls',
    access_classification: 'authorized',
    stream_url: '',
    snapshot_url: '',
    attribution: '',
    usage_restrictions: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [datasetResult, cameraResult, modelResult, runtimeResult, storageResult] = await Promise.all([
        api.datasets(),
        api.cameras({ page_size: 100 }),
        api.models(),
        api.runtimeModels(),
        api.storage(),
      ])
      setDatasets(datasetResult)
      setCameras(cameraResult.items)
      setModels(modelResult)
      setDetectors(runtimeResult.detectors)
      setStorage(storageResult)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refreshSelected = async (datasetId: string) => {
    const all = await api.datasets()
    setDatasets(all)
    setSelectedDataset(all.find((item) => item.id === datasetId) ?? null)
  }

  const createDataset = async () => {
    setBusy('create')
    setError(null)
    setMessage(null)
    try {
      const description = datasetForm.description.trim()
      const created = await api.createDataset({
        name: datasetForm.name.trim(),
        category: datasetForm.category,
        ...(description ? { description } : {}),
      })
      setDatasetForm({ name: '', category: 'road_hazard', description: '' })
      setMessage(`Dataset "${created.name}" created.`)
      await refreshSelected(created.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const importFilesNow = async () => {
    if (importFiles.length === 0) {
      setError('Select at least one image, video, CSV or JSON file to import.')
      return
    }
    setBusy('import')
    setError(null)
    setMessage(null)
    try {
      const form = new FormData()
      if (importForm.dataset_id) {
        form.append('dataset_id', importForm.dataset_id)
      } else if (importForm.dataset_name.trim()) {
        form.append('dataset_name', importForm.dataset_name.trim())
      }
      form.append('category', importForm.category)
      if (importForm.metadata.trim()) form.append('metadata', importForm.metadata.trim())
      for (const file of importFiles) form.append('files', file)
      const result = await api.importFiles(form)
      setImportFiles([])
      if (fileInput.current) fileInput.current.value = ''
      setMessage(`Imported files into "${result.name}".`)
      await refreshSelected(result.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const removeDataset = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      await api.deleteDataset(id)
      setSelectedDataset(null)
      setDatasets(await api.datasets())
      setMessage('Dataset deleted.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const validateCamera = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      const updated = await api.validateCamera(id)
      setCameras((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setMessage(`Validation complete: ${updated.name} is ${updated.status}.`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const registerCamera = async () => {
    setBusy('camera')
    setError(null)
    setMessage(null)
    try {
      const created = await api.registerCamera({
        name: cameraForm.name.trim(),
        provider: cameraForm.provider.trim() || 'registry',
        city: cameraForm.city.trim() || null,
        district: cameraForm.district.trim() || null,
        state: cameraForm.state.trim() || null,
        country: cameraForm.country.trim() || null,
        latitude: Number(cameraForm.latitude),
        longitude: Number(cameraForm.longitude),
        source_type: cameraForm.source_type,
        access_classification: cameraForm.access_classification,
        stream_url: cameraForm.stream_url.trim() || null,
        snapshot_url: cameraForm.snapshot_url.trim() || null,
        attribution: cameraForm.attribution.trim() || null,
        usage_restrictions: cameraForm.usage_restrictions.trim() || null,
      })
      setCameras((current) => [created, ...current])
      setCameraForm((current) => ({
        ...current,
        name: '',
        latitude: '',
        longitude: '',
        stream_url: '',
        snapshot_url: '',
        attribution: '',
        usage_restrictions: '',
      }))
      setMessage(`Camera "${created.name}" registered with status ${created.status}.`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Datasets &amp; system management</h1>
          <p>Manage datasets, camera sources, AI model registration and storage backends independently of the app.</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? <span className="spinner" /> : null}
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="notice error" style={{ marginBottom: 12 }}>{error}</div> : null}
      {message ? <div className="notice ok" style={{ marginBottom: 12 }}>{message}</div> : null}

      <div className="tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`tab${tab === entry.id ? ' active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'datasets' ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="grid split">
            <div className="panel">
              <div className="panel-head">
                <h2>Create dataset</h2>
              </div>
              <div className="panel-body">
                <div className="field-row">
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={datasetForm.name}
                      placeholder="Highway hazard frames"
                      onChange={(event) => setDatasetForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Category</span>
                    <select
                      value={datasetForm.category}
                      onChange={(event) => setDatasetForm((current) => ({ ...current, category: event.target.value }))}
                    >
                      {DATASET_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>Description</span>
                  <input
                    type="text"
                    value={datasetForm.description}
                    placeholder="Optional description"
                    onChange={(event) => setDatasetForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>
                <button
                  type="button"
                  className="btn primary"
                  style={{ marginTop: 12 }}
                  onClick={() => void createDataset()}
                  disabled={busy === 'create' || datasetForm.name.trim().length < 2}
                >
                  {busy === 'create' ? <span className="spinner" /> : null}
                  Create dataset
                </button>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Import files</h2>
                <span className="hint">Images, video, CSV, JSON</span>
              </div>
              <div className="panel-body">
                <div className="field-row">
                  <label className="field">
                    <span>Target dataset</span>
                    <select
                      value={importForm.dataset_id}
                      onChange={(event) => setImportForm((current) => ({ ...current, dataset_id: event.target.value }))}
                    >
                      <option value="">Create new dataset</option>
                      {datasets.map((dataset) => (
                        <option key={dataset.id} value={dataset.id}>
                          {dataset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>New dataset name</span>
                    <input
                      type="text"
                      value={importForm.dataset_name}
                      placeholder="Only when creating"
                      onChange={(event) => setImportForm((current) => ({ ...current, dataset_name: event.target.value }))}
                      disabled={Boolean(importForm.dataset_id)}
                    />
                  </label>
                  <label className="field">
                    <span>Category</span>
                    <select
                      value={importForm.category}
                      onChange={(event) => setImportForm((current) => ({ ...current, category: event.target.value }))}
                      disabled={Boolean(importForm.dataset_id)}
                    >
                      {DATASET_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>Files</span>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.mkv,.csv,.json"
                    onChange={(event) => setImportFiles(Array.from(event.target.files ?? []))}
                  />
                </label>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>Metadata JSON (optional)</span>
                  <input
                    type="text"
                    value={importForm.metadata}
                    placeholder='{"capture":"camera-7"}'
                    onChange={(event) => setImportForm((current) => ({ ...current, metadata: event.target.value }))}
                  />
                </label>
                {importFiles.length ? (
                  <div className="muted small" style={{ marginTop: 8 }}>
                    {importFiles.length} file(s) selected · {formatBytes(importFiles.reduce((sum, file) => sum + file.size, 0))}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn primary"
                  style={{ marginTop: 12 }}
                  onClick={() => void importFilesNow()}
                  disabled={busy === 'import'}
                >
                  {busy === 'import' ? <span className="spinner" /> : null}
                  Import
                </button>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Datasets</h2>
              <span className="hint">{datasets.length} registered</span>
            </div>
            {datasets.length === 0 ? (
              <div className="empty-state">
                <div className="empty-title">No datasets yet</div>
                <p>Create a dataset or import files to begin building a local training corpus.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Backend</th>
                      <th>Files</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datasets.map((dataset) => (
                      <tr
                        key={dataset.id}
                        className={`clickable${selectedDataset?.id === dataset.id ? ' selected' : ''}`}
                        onClick={() => setSelectedDataset(dataset)}
                      >
                        <td style={{ fontWeight: 600 }}>{dataset.name}</td>
                        <td style={{ textTransform: 'capitalize' }}>{dataset.category.replace(/_/g, ' ')}</td>
                        <td>{dataset.storage_backend}</td>
                        <td className="mono">{dataset.file_count ?? 0}</td>
                        <td className="mono">{formatBytes(dataset.size_bytes ?? 0)}</td>
                        <td>
                          <StatusPill value={(dataset.processing_status || 'ready').toUpperCase()} />
                        </td>
                        <td className="mono">{new Date(dataset.created_at).toLocaleDateString()}</td>
                        <td>
                          <button
                            type="button"
                            className="btn small danger"
                            onClick={(event) => {
                              event.stopPropagation()
                              void removeDataset(dataset.id)
                            }}
                            disabled={busy === dataset.id}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedDataset ? (
            <div className="panel">
              <div className="panel-head">
                <h2>{selectedDataset.name}</h2>
                <span className="hint">{selectedDataset.items?.length ?? 0} items</span>
              </div>
              {(selectedDataset.items ?? []).length === 0 ? (
                <div className="empty-state">
                  <div className="empty-title">This dataset is empty</div>
                  <p>Import images, video or annotations to populate it.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Status</th>
                        <th>Imported</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedDataset.items ?? []).map((item) => (
                        <tr key={item.id}>
                          <td className="mono" style={{ wordBreak: 'break-all' }}>{item.filename}</td>
                          <td>{item.media_type}</td>
                          <td className="mono">{formatBytes(item.size_bytes)}</td>
                          <td>
                            <StatusPill value={(item.status || 'ready').toUpperCase()} />
                          </td>
                          <td className="mono">{new Date(item.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'cameras' ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>Register camera source</h2>
              <span className="hint">Only public or explicitly authorized sources</span>
            </div>
            <div className="panel-body">
              <div className="field-row">
                <label className="field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={cameraForm.name}
                    onChange={(event) => setCameraForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Junction camera 12"
                  />
                </label>
                <label className="field">
                  <span>Provider</span>
                  <input
                    type="text"
                    value={cameraForm.provider}
                    onChange={(event) => setCameraForm((current) => ({ ...current, provider: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Source type</span>
                  <select
                    value={cameraForm.source_type}
                    onChange={(event) => setCameraForm((current) => ({ ...current, source_type: event.target.value }))}
                  >
                    {SOURCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Access</span>
                  <select
                    value={cameraForm.access_classification}
                    onChange={(event) =>
                      setCameraForm((current) => ({ ...current, access_classification: event.target.value }))
                    }
                  >
                    {ACCESS_CLASSES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="field-row" style={{ marginTop: 10 }}>
                <label className="field">
                  <span>Latitude</span>
                  <input
                    type="text"
                    value={cameraForm.latitude}
                    onChange={(event) => setCameraForm((current) => ({ ...current, latitude: event.target.value }))}
                    placeholder="20.2961"
                  />
                </label>
                <label className="field">
                  <span>Longitude</span>
                  <input
                    type="text"
                    value={cameraForm.longitude}
                    onChange={(event) => setCameraForm((current) => ({ ...current, longitude: event.target.value }))}
                    placeholder="85.8245"
                  />
                </label>
                <label className="field">
                  <span>City</span>
                  <input
                    type="text"
                    value={cameraForm.city}
                    onChange={(event) => setCameraForm((current) => ({ ...current, city: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>State</span>
                  <input
                    type="text"
                    value={cameraForm.state}
                    onChange={(event) => setCameraForm((current) => ({ ...current, state: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Country</span>
                  <input
                    type="text"
                    value={cameraForm.country}
                    onChange={(event) => setCameraForm((current) => ({ ...current, country: event.target.value }))}
                  />
                </label>
              </div>
              <div className="field-row" style={{ marginTop: 10 }}>
                <label className="field">
                  <span>Stream URL</span>
                  <input
                    type="text"
                    value={cameraForm.stream_url}
                    onChange={(event) => setCameraForm((current) => ({ ...current, stream_url: event.target.value }))}
                    placeholder="https://example.org/stream.m3u8"
                  />
                </label>
                <label className="field">
                  <span>Snapshot URL</span>
                  <input
                    type="text"
                    value={cameraForm.snapshot_url}
                    onChange={(event) => setCameraForm((current) => ({ ...current, snapshot_url: event.target.value }))}
                  />
                </label>
              </div>
              <div className="field-row" style={{ marginTop: 10 }}>
                <label className="field">
                  <span>Attribution</span>
                  <input
                    type="text"
                    value={cameraForm.attribution}
                    onChange={(event) => setCameraForm((current) => ({ ...current, attribution: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Usage restrictions</span>
                  <input
                    type="text"
                    value={cameraForm.usage_restrictions}
                    onChange={(event) =>
                      setCameraForm((current) => ({ ...current, usage_restrictions: event.target.value }))
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: 12 }}
                onClick={() => void registerCamera()}
                disabled={
                  busy === 'camera' ||
                  cameraForm.name.trim().length < 2 ||
                  cameraForm.latitude === '' ||
                  cameraForm.longitude === ''
                }
              >
                {busy === 'camera' ? <span className="spinner" /> : null}
                Register camera
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Registered sources</h2>
              <span className="hint">{cameras.length} records</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Provider</th>
                    <th>Location</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Last checked</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cameras.map((camera) => (
                    <tr key={camera.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{camera.name}</div>
                        <div className="muted small">{camera.access_classification}</div>
                      </td>
                      <td>{camera.provider}</td>
                      <td className="small">
                        {[camera.city, camera.country].filter(Boolean).join(', ') || '—'}
                        <div className="muted mono small">
                          {camera.latitude.toFixed(4)}, {camera.longitude.toFixed(4)}
                        </div>
                      </td>
                      <td>{camera.source_type.replace(/_/g, ' ')}</td>
                      <td>
                        <StatusPill value={camera.status} />
                      </td>
                      <td className="mono small">
                        {camera.last_validated_at ? new Date(camera.last_validated_at).toLocaleString() : 'Never'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => void validateCamera(camera.id)}
                          disabled={busy === camera.id}
                        >
                          {busy === camera.id ? <span className="spinner" /> : null}
                          Validate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'models' ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>Computer vision runtime</h2>
              <span className="hint">Detector availability is reported, never assumed</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Detector</th>
                    <th>Task</th>
                    <th>State</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {detectors.map((detector) => (
                    <tr key={detector.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{detector.label}</div>
                        <div className="muted small mono">{detector.id}</div>
                      </td>
                      <td>{detector.task}</td>
                      <td>
                        <StatusPill value={detector.state.toUpperCase()} />
                      </td>
                      <td className="muted small">{detector.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Model registry</h2>
              <span className="hint">{models.length} entries</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Task</th>
                    <th>Framework</th>
                    <th>Version</th>
                    <th>Enabled</th>
                    <th>Weights</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.id}>
                      <td style={{ fontWeight: 600 }}>{model.name}</td>
                      <td>{model.task.replace(/_/g, ' ')}</td>
                      <td>{model.framework}</td>
                      <td className="mono">{model.version}</td>
                      <td>
                        <StatusPill value={model.enabled ? 'OK' : 'NOT_CONFIGURED'} />
                      </td>
                      <td className="mono small" style={{ wordBreak: 'break-all' }}>
                        {model.weights_path ?? 'Not set'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'storage' ? (
        <div className="grid split">
          <div className="panel">
            <div className="panel-head">
              <h2>Active backend</h2>
              <StatusPill value={storage?.available ? 'OK' : 'DOWN'} />
            </div>
            <div className="panel-body">
              <dl className="kv">
                <dt>Backend</dt>
                <dd style={{ textTransform: 'capitalize' }}>{storage?.backend ?? '—'}</dd>
                <dt>Detail</dt>
                <dd>{storage?.detail ?? '—'}</dd>
                <dt>Root path</dt>
                <dd className="mono" style={{ wordBreak: 'break-all' }}>{storage?.path ?? '—'}</dd>
                <dt>Evidence delivery</dt>
                <dd>{storage?.public_url ? 'Served through the API' : 'Local file paths'}</dd>
              </dl>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <h2>Configuration</h2>
            </div>
            <div className="panel-body stack">
              <p className="muted small">
                Storage is configured through environment variables. Credentials are never written to the database and
                are never returned by the API.
              </p>
              <dl className="kv">
                <dt>Local</dt>
                <dd className="mono">ORBI_STORAGE_BACKEND=local</dd>
                <dt>Object storage</dt>
                <dd className="mono">ORBI_STORAGE_BACKEND=s3</dd>
                <dt>Endpoint</dt>
                <dd className="mono">ORBI_S3_ENDPOINT</dd>
                <dt>Bucket</dt>
                <dd className="mono">ORBI_S3_BUCKET</dd>
                <dt>Access key</dt>
                <dd className="mono">ORBI_S3_ACCESS_KEY</dd>
                <dt>Secret key</dt>
                <dd className="mono">ORBI_S3_SECRET_KEY</dd>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
