# PeakLogic Hub — Azure IoT Edge module packaging

Packages the cross-platform headless agent (`PeakLogicEdge.Agent`) as an **Azure
IoT Edge module**, the Linux hub's deployment target (`docs/architecture/
dual-platform-hub-design.md` §6). One containerized module runs the same agent
(acquire → normalize → durable queue → store-and-forward) that runs as a Windows
Service on a Windows 11 hub.

## Status (2026-07-25) — scaffold, honest

This is **structurally-complete scaffolding, not yet built or deployed.** The
Dockerfile, `module.json`, and `deployment.template.json` follow the standard
IoT Edge conventions and their JSON is validated, but **none of it has been
built into a container image or deployed to a real IoT Hub** — there is no
Docker build, no container registry, and no Azure subscription/IoT Hub in this
environment (infra item 1). Same "sound, unvalidated-against-a-real-instance"
caveat this project applies to the Bicep and the rest of the Azure track.

## Layout

```
edge/
├── deployment.template.json        # IoT Edge manifest: edgeAgent, edgeHub, + the module
├── .env.example                    # registry creds template (copy to .env — gitignored)
└── modules/PeakLogicHubAgent/
    ├── module.json                 # image repo/tag + platforms -> Dockerfile
    └── Dockerfile                  # multi-arch (amd64 + arm64) build of PeakLogicEdge.Agent
```

## How it ties to the earlier designs

- **Identity (Q6 / `hub-enrollment-and-identity-design.md`):** the module's device
  identity is provisioned via **DPS**, managed by the IoT Edge runtime — the app
  carries no identity secret. That's why there's no Linux `ISecretStore` here.
- **Heartbeat / config (D2 = twin-native):** IoT Edge gives the module a **twin**
  natively — reported properties = heartbeat, desired properties = PeakAssist/rule
  targets. The built `PeakAssistSync` engine and `EdgeAlarmEvaluator` consume
  exactly this.
- **Telemetry (§5/Q1 = IoT Hub MQTT):** the `$edgeHub` route sends the module's
  output **upstream to IoT Hub**; `storeAndForwardConfiguration` is IoT Edge's own
  offline buffering, complementing the agent's SQLite queue.
- **Durability:** the SQLite queue must NOT live on the ephemeral container FS. The
  manifest binds a named volume (`peaklogic-hub-data`) at `/data` and sets
  `PEAKLOGIC_CACHE_PATH=/data/edge-cache.db`, which `HubAgentService` honors — so
  the queue survives container restarts.

## Prerequisites (for a real build/deploy)

- A Linux device running the **Azure IoT Edge runtime** (`aziot-edge`), DPS-
  provisioned.
- A container registry (e.g. Azure Container Registry) — put its creds in `.env`.
- `docker` with `buildx` (multi-arch), and either the `iotedgedev` CLI or the
  `azure-iot` Azure CLI extension.

## Build (multi-arch) & push

The Docker **build context is `windows-hub/`** (so both `Core` and `Agent`
sources are in scope), not the `edge/` folder:

```bash
# from the repo root
docker buildx build --platform linux/amd64,linux/arm64 \
  -f windows-hub/edge/modules/PeakLogicHubAgent/Dockerfile \
  -t <registry>/peaklogic-hub-agent:0.1.0 --push windows-hub
```

(or `iotedgedev build`, which reads `module.json` — its `contextPath` already
points at `windows-hub/`.)

## Deploy to a device

```bash
# resolve template tokens (${MODULES.*}, ${CONTAINER_REGISTRY_*}) into a manifest
iotedgedev genconfig -f edge/deployment.template.json
# then set modules on the target device
az iot edge set-modules --hub-name <iot-hub> --device-id <hub-device> \
  --content config/deployment.amd64.json
```

## Not built here / follow-ups

- Actually building the image + pushing to a registry + deploying to a device —
  needs Docker + registry + IoT Hub (infra item 1).
- Real device sources: the module currently runs `SimulatedIngestionSource` (no
  hardware); swap for Modbus/OPC-UA sources from `EdgeConfig`.
- The heartbeat/PeakAssist twin binding on the IoT Edge side (runtime §7.2/§7.3,
  D2) — the engines are built; the twin wiring is infra-gated.
