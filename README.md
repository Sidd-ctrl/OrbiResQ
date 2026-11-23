# ORBI RESQ

**Global Road Intelligence and Emergency Detection System** — a location-aware platform for discovering verified road cameras, monitoring coverage around any coordinate on Earth, and managing road-incident intelligence.

Odisha and Bhubaneswar appear only as optional demo seeds. Every search is driven by the coordinates you supply, so the platform works the same in Berlin, São Paulo, or Nairobi.

---

## What actually works

| Capability | Behaviour |
| --- | --- |
| Location detection | Browser geolocation; reverse-geocoded through OpenStreetMap Nominatim to locality / city / district / state / country. If permission is denied, a manual search and coordinate entry fallback is used. |
| Camera discovery | Pluggable provider adapters (registry, OpenStreetMap/Overpass, Caltrans, Windy webcams, directory import). Each provider reports `ok`, `not_configured`, or `error` with a reason. |
| Camera validation | Real connection test per camera (HTTP status, content type, stream probe). A camera is only `LIVE` after a successful check — never by assumption. |
| Coverage radius | 5, 10, 25, 50, 100 km, plus city/district-wide search. Distances use haversine on real coordinates. |
| Live monitoring | Leaflet + OpenStreetMap map, camera and incident markers, camera list, feed panel. HLS via hls.js, progressive video via `<video>`, JPEG snapshots, and external-page sources opened in a new tab. |
| Incidents | Full CRUD with category/severity/verification/date/place filters, pagination, and review actions (verify, false positive, resolve). AI detections are labelled separately from human-confirmed records. |
| Datasets | Create datasets, import images / videos / CSV / JSON with metadata, track size and per-item status, delete with storage cleanup. |
| System | Health per component, storage backend status, provider status, AI model registry and detector runtime, notification channels, in-app alerts and acknowledgement. |

## Honest limitations

- **Flutter was requested; this delivery is a responsive web client** (React + TypeScript, Material-inspired custom design system) because AppJet builds and hosts web applications. The backend is fully decoupled, so a Flutter client can consume the same `/api` contracts unchanged.
- **No camera is fabricated.** The registry ships with clearly marked demo records. Public provider adapters only return sources whose terms permit access; feeds that require authentication are classified `RESTRICTED` and are not bypassed.
- **Live video depends on the source.** Many public directories list pages rather than streamable URLs. Those cameras report `playback_kind: external_page` or `unavailable` with a reason, and the panel says so instead of simulating footage.
- **The CV service is an architecture, not a trained accident model.** Detectors report `ready` only when weights are installed; otherwise `unavailable` with the exact missing requirement. Ordinary object detection alone cannot reliably identify a collision — temporal tracking interfaces exist for that work, and nothing claims otherwise.
- **Emergency services are never contacted.** Notifications are in-app records only; SMS/Telegram/email/push are declared channels reported as `not_configured` until credentials exist.

## Architecture

```
client/            React + TypeScript + Vite, Leaflet, hls.js
  src/pages        Overview, Live Monitoring, Incidents, Datasets & System
  src/components   AppShell, MapView, CameraFeed, LocationPicker, StatusPill
  src/state.tsx    location + radius context, geolocation with manual fallback
server/app/        FastAPI
  routers/         location, cameras, incidents, datasets, models, notifications, system, analysis
  services/        geo, discovery (provider adapters), camera_validation, storage, incidents,
                   notifications, cv_client, seed
  models.py        SQLAlchemy models; schemas.py Pydantic contracts
cv_service/        Standalone FastAPI vision service
  detectors/       registry, base interface, model-backed and interface-only detectors
tests/             pytest suite covering the API surface and CV service honesty
scripts/start.sh   runs the CV service on 8100 and the API on $PORT
```

The API serves the built client from `client/dist`, so one process serves UI and API.

### Endpoints

```
GET  /api                                    API index
GET  /api/system/health                      component health + record counts
GET  /api/system/settings                    radius, demo, storage, provider config
GET  /api/system/storage                     storage backend status
GET  /api/location/current?latitude&longitude
GET  /api/location/search?q
GET  /api/cameras?latitude&longitude&radius_km&status&page
GET  /api/cameras/radius-options
POST /api/cameras                            register an authorized source
GET  /api/cameras/{id}
PATCH /api/cameras/{id}
POST /api/cameras/{id}/validate
GET  /api/cameras/{id}/stream
POST /api/cameras/discover
GET  /api/incidents?category&severity&verification_status&city&state&country&from_date&to_date
GET  /api/incidents/categories
GET  /api/incidents/summary
POST /api/incidents
GET  /api/incidents/{id}
PATCH /api/incidents/{id}
GET  /api/incidents/{id}/notifications
GET  /api/datasets
POST /api/datasets
POST /api/datasets/import
GET  /api/datasets/{id}
DELETE /api/datasets/{id}
GET  /api/models
GET  /api/models/runtime
GET  /api/notifications
GET  /api/notifications/channels
POST /api/notifications/test
POST /api/notifications/{id}/acknowledge
POST /api/analysis/frame                    proxy to the CV service
```

Interactive docs are at `/docs`.

## Run locally

Requires Python 3.11+ and Node 20+.

```bash
pip install -r requirements.txt
npm --prefix client install
npm --prefix client run build
npm start                     # API on :3000, CV service on :8100
```

For development with hot reload:

```bash
npm run dev:api               # uvicorn :8000
npm run dev:cv                # uvicorn :8100
npm run dev:web               # vite :5173, proxies /api to :8000
```

Tests:

```bash
python3 -m pytest tests -q
```

## Configuration and API keys

Every setting is an environment variable, loaded by `server/app/config.py`. No credential is committed to the repository and none is returned by the API.

### Where to add a key

- **Deployed on AppJet:** open **Settings → Environment variables**, add the name exactly as listed below with its value, save, then redeploy. Values are injected when the container starts, so a running app does not see a new key until it is rebuilt.
- **Running locally:** copy `.env.example` to `.env` in the repository root and fill in the values. `.env` is git-ignored; `config.py` loads it automatically.

After adding credentials, open the System page or call `GET /api/system/settings`: each camera provider and alert channel reports `configured: true` together with the `required_environment` names it still needs. Until then the adapter stays `not_configured` and alerts are written to the in-app log only.

### Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | API port |
| `CV_PORT` | `8100` | Local CV service port |
| `CV_SERVICE_URL` | `http://127.0.0.1:8100` | Where the API reaches the CV service |
| `DATABASE_URL` | `sqlite:///<repo>/data/orbi_resq.db` | SQLAlchemy URL; PostgreSQL works via `postgresql+pg8000://...` |
| `DATA_DIR` | `./data` | Local dataset, media and archive storage |
| `MEDIA_GATEWAY_URL` | – | Optional external gateway for RTSP→HLS conversion |
| `HTTP_TIMEOUT_SECONDS` | `8` | Outbound timeout for discovery and validation |
| `GEOCODE_USER_AGENT`, `GEOCODE_LANGUAGE` | app default, `en` | Nominatim identification and result language |
| `DEFAULT_RADIUS_KM`, `MAX_RADIUS_KM` | `25`, `100` | Coverage radius bounds |
| `MAX_DISCOVERY_RESULTS` | `250` | Cap per discovery run |
| `ENABLE_OSM_DISCOVERY`, `OSM_OVERPASS_URL` | `true`, Overpass | OpenStreetMap surveillance provider |
| `ENABLE_CALTRANS_DISCOVERY`, `CALTRANS_DISTRICT` | `true`, `03` | Caltrans CCTV provider |
| `WINDY_API_KEY` | – | Windy Webcams API v3 key; the provider stays `not_configured` without it |
| `CAMERA_DIRECTORY_URL` | – | URL of an operator-supplied JSON camera directory |
| `STORAGE_BACKEND` | `local` | `local` or `s3` |
| `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | – | S3-compatible storage used when `STORAGE_BACKEND=s3` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | – | Telegram alert delivery |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ALERT_SMS_TO` | – | Twilio SMS delivery |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `ALERT_EMAIL_TO` | –, `587` | SMTP email delivery |
| `PUSH_PROVIDER_KEY` | – | Reserved for push delivery; the channel reports as unconfigured |
| `SEED_DEMO_DATA` | `true` | Insert clearly marked demo cameras, incidents, models and dataset |
| `MAX_UPLOAD_MB` | `50` | Dataset upload limit |

Keyless sources — OpenStreetMap Overpass, Caltrans CCTV, USGS earthquakes and Open-Meteo rainfall — work without credentials, which is why the map is populated out of the box.

## Roadmap

1. **Phase 2** — real-time YOLO inference, multi-camera workers, tracking, trajectory analysis, collision candidates.
2. **Phase 3** — flood, waterlogging, pothole, fire and smoke recognition.
3. **Phase 4** — predictive road-safety analytics, behaviour analysis, geospatial clustering, authorized emergency notifications.
4. **Phase 5** — global source expansion, city-level risk analytics, municipal integrations.

Each phase extends the detector registry and provider adapters without frontend changes.
