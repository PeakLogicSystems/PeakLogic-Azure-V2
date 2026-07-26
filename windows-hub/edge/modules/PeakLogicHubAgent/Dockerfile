# PeakLogic Hub agent — cross-platform Azure IoT Edge module image (amd64 + arm64).
#
# BUILD CONTEXT MUST BE windows-hub/ so both Core and Agent sources are in scope.
# Multi-arch build (see edge/README.md):
#   docker buildx build --platform linux/amd64,linux/arm64 \
#     -f edge/modules/PeakLogicHubAgent/Dockerfile \
#     -t <registry>/peaklogic-hub-agent:0.1.0 --push windows-hub
# Framework-dependent publish onto the .NET runtime base image.

# Build on the NATIVE host arch — the published output is arch-neutral IL, so we
# avoid slow qemu emulation of the SDK. $BUILDPLATFORM is set by buildx.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
# Restore first for layer caching (csprojs only). The Agent (net8.0) references
# the multi-targeted Core; a net8.0 consumer builds only Core's net8.0 target, so
# no Windows targeting pack is needed on Linux.
COPY src/PeakLogicEdge.Core/PeakLogicEdge.Core.csproj PeakLogicEdge.Core/
COPY src/PeakLogicEdge.Agent/PeakLogicEdge.Agent.csproj PeakLogicEdge.Agent/
RUN dotnet restore PeakLogicEdge.Agent/PeakLogicEdge.Agent.csproj
COPY src/PeakLogicEdge.Core/ PeakLogicEdge.Core/
COPY src/PeakLogicEdge.Agent/ PeakLogicEdge.Agent/
RUN dotnet publish PeakLogicEdge.Agent/PeakLogicEdge.Agent.csproj -c Release -o /app

# Runtime image is the TARGET arch (buildx resolves it from --platform); the
# arch-neutral publish output runs on it. Headless worker -> runtime, not aspnet.
FROM mcr.microsoft.com/dotnet/runtime:8.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
# Non-root (IoT Edge hardening). /data is the mounted volume for the durable
# SQLite queue — deployment.template.json binds a named volume here and sets
# PEAKLOGIC_CACHE_PATH, so the queue survives container restarts.
RUN useradd -ms /bin/bash moduleuser && mkdir -p /data && chown -R moduleuser /app /data
USER moduleuser
ENV PEAKLOGIC_CACHE_PATH=/data/edge-cache.db
ENTRYPOINT ["dotnet", "PeakLogicEdge.Agent.dll"]
