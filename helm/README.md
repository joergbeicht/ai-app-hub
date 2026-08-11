# Helm-Charts – ai-app-hub im Kunden-Cluster

Ein Chart pro Service (`ai-app-hub-backend`, `ai-app-hub-frontend`), siehe
`deployment.mdc`. Wird in den per `infra/bicep/customer-cluster` erzeugten
Kunden-Cluster deployed (siehe ADR-9/ADR-10 in
`docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md`).

## Voraussetzungen

- Images liegen bereits in der zentralen ACR (siehe unten, "Image bauen").
- `az aks get-credentials --resource-group rg-<kunde>-<env> --name aks-<kunde>-<env>`
- Ziel-Namespace existiert (`kubectl create namespace ai-app-hub`, einmalig
  pro Cluster).

## Image bauen und in die zentrale ACR pushen

Remote-Build direkt in der ACR (kein lokaler Docker-Daemon nötig):

```bash
GIT_SHA=$(git rev-parse --short HEAD)

az acr build --registry acraxoraplatform \
  --image ai-app-hub-backend:$GIT_SHA \
  --file backend/Dockerfile backend

az acr build --registry acraxoraplatform \
  --image ai-app-hub-frontend:$GIT_SHA \
  --file frontend/Dockerfile --build-arg APP_VERSION=$(git describe --tags) \
  frontend
```

**Wichtig:** Immer einen neuen, eindeutigen Tag verwenden (Git-SHA, siehe
`deployment.mdc`). Denselben Tag wiederzuverwenden (z. B. `v1.0.1`)
funktioniert zwar beim ersten Deploy, aber AKS-Nodes cachen das Image lokal
(`imagePullPolicy: IfNotPresent`) – ein zweiter Push auf denselben Tag wird
dann **nicht** automatisch neu gezogen, ein `kubectl rollout restart` startet
scheinbar neu, läuft aber mit dem alten, gecachten Inhalt weiter.

## Deployen

```bash
helm install ai-app-hub-backend ./helm/ai-app-hub-backend \
  -f helm/ai-app-hub-backend/values-test.yaml \
  --set image.tag=$GIT_SHA \
  --set-string secrets.azureTenantId=<tenant-id> \
  --set-string secrets.azureClientId=<client-id> \
  --set-string secrets.azureClientSecret=<client-secret> \
  -n ai-app-hub

helm install ai-app-hub-frontend ./helm/ai-app-hub-frontend \
  -f helm/ai-app-hub-frontend/values-test.yaml \
  --set image.tag=$GIT_SHA \
  -n ai-app-hub
```

Für ein Update: `helm upgrade` statt `helm install`, jeweils mit neuem
`image.tag`.

**Secrets:** Werden nie in `values.yaml`/`values-<env>.yaml` eingecheckt,
sondern per `--set-string` übergeben. Für den manuellen Testdeploy kommen sie
hier aus der lokalen Shell (aus `.env`), in einer echten Pipeline aus
GitHub Encrypted Secrets (siehe `deployment.mdc`, offener Punkt in ADR-10).

## Verifizieren (solange es noch keinen öffentlichen Ingress gibt)

```bash
kubectl get pods -n ai-app-hub
kubectl port-forward -n ai-app-hub svc/ai-app-hub-backend 8080:6055 &
kubectl port-forward -n ai-app-hub svc/ai-app-hub-frontend 8081:80 &
curl http://localhost:8080/health
curl http://localhost:8081/runtime-config.json
```

## Bewusst noch nicht Teil dieser Charts (siehe ADR-10, offene Punkte)

- Kein Ingress-Controller/TLS/DNS – Zugriff aktuell nur per
  `kubectl port-forward`, kein echter öffentlicher HTTPS-Endpunkt.
- Keine GitHub-Actions-Pipeline, die diese Befehle automatisiert ausführt.
- Kein `HorizontalPodAutoscaler` (noch keine Lastdaten, YAGNI).
