import { useIntel } from '../intel'
import { LAYERS, LAYER_GROUPS } from '../lib/layers'
import { usePlatform } from '../state'

interface Props {
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function LayerPanel({ collapsed, onToggleCollapse }: Props) {
  const {
    layerState,
    toggleLayer,
    setGroupEnabled,
    resetLayers,
    counts,
    discovering,
    discoveryMessage,
    discoveryReports,
    discover,
    environmentSources,
    environmentError,
  } = useIntel()
  const { radiusKm, setRadiusKm, radiusOptions, coords } = usePlatform()

  if (collapsed) {
    return (
      <aside className="floating-panel layer-panel collapsed">
        <button type="button" className="rail-btn" onClick={onToggleCollapse} aria-label="Open layer control">
          <span className="rail-label mono">LAYERS</span>
          <span className="rail-glyph" aria-hidden="true">
            ≡
          </span>
        </button>
      </aside>
    )
  }

  return (
    <aside className="floating-panel layer-panel" aria-label="Layer control">
      <div className="panel-head">
        <div>
          <h2>Layer control</h2>
          <p className="panel-sub mono">India operational frame</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onToggleCollapse} aria-label="Collapse layer control">
          ⟨
        </button>
      </div>

      <div className="panel-scroll">
        <section className="discovery-block">
          <div className="field-row">
            <label className="mono field-label" htmlFor="radius-select">
              SEARCH RADIUS
            </label>
            <select
              id="radius-select"
              value={radiusKm}
              onChange={(event) => setRadiusKm(Number(event.target.value))}
            >
              {radiusOptions.map((option) => (
                <option key={option} value={option}>
                  {option} km
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn primary block"
            onClick={() => void discover()}
            disabled={discovering || !coords}
          >
            {discovering ? 'Testing sources…' : 'Run camera discovery'}
          </button>
          {!coords ? <p className="hint">Set your location to run discovery.</p> : null}
          {discoveryMessage ? <p className="hint discovery-message">{discoveryMessage}</p> : null}
          {discoveryReports.length ? (
            <ul className="provider-report">
              {discoveryReports.map((report) => (
                <li key={report.id}>
                  <span className={`report-dot ${report.status}`} aria-hidden="true" />
                  <span className="report-label">{report.label}</span>
                  <span className="mono report-count">{report.discovered}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {LAYER_GROUPS.map((group) => {
          const groupLayers = LAYERS.filter((layer) => layer.group === group.id)
          const available = groupLayers.filter((layer) => !layer.unavailable)
          const enabled = available.filter((layer) => layerState[layer.id]).length
          return (
            <section key={group.id} className="layer-group">
              <div className="group-head">
                <div>
                  <h3>{group.label}</h3>
                  <p className="group-note">{group.note}</p>
                </div>
                <span className="mono group-count">
                  {enabled}/{available.length}
                </span>
              </div>
              <div className="group-actions">
                <button type="button" className="mini-btn" onClick={() => setGroupEnabled(group.id, true)}>
                  All
                </button>
                <button type="button" className="mini-btn" onClick={() => setGroupEnabled(group.id, false)}>
                  None
                </button>
              </div>
              <ul className="layer-list">
                {groupLayers.map((layer) => {
                  const on = Boolean(layerState[layer.id]) && !layer.unavailable
                  return (
                    <li key={layer.id} className={layer.unavailable ? 'unavailable' : ''}>
                      <div className="layer-copy">
                        <span className="layer-name">{layer.label}</span>
                        <span className="layer-note">{layer.detail}</span>
                        <span className="layer-source mono">
                          {layer.source}
                          {layer.unavailable ? '' : ` · ${counts[layer.id] ?? 0}`}
                        </span>
                        {layer.unavailable ? <span className="layer-unavailable">{layer.unavailable}</span> : null}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`Toggle ${layer.label}`}
                        className={`switch${on ? ' on' : ''}`}
                        onClick={() => toggleLayer(layer.id)}
                        disabled={Boolean(layer.unavailable)}
                      >
                        <span />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        <section className="layer-group sources">
          <div className="group-head">
            <div>
              <h3>Provider status</h3>
              <p className="group-note">External observation sources</p>
            </div>
          </div>
          {environmentError ? <p className="hint">Environment sources unavailable: {environmentError}</p> : null}
          <ul className="source-list">
            {environmentSources.map((source) => (
              <li key={source.id}>
                <div>
                  <span className="layer-name">{source.label}</span>
                  <span className="layer-detail">{source.attribution}</span>
                </div>
                <span className={`source-state ${source.status}`}>{source.status === 'live' ? 'LIVE' : 'UNAVAILABLE'}</span>
              </li>
            ))}
            {environmentSources.length === 0 && !environmentError ? (
              <li className="hint">No external source configured.</li>
            ) : null}
          </ul>
        </section>

        <button type="button" className="mini-btn reset" onClick={resetLayers}>
          Reset layers to default
        </button>
      </div>
    </aside>
  )
}
