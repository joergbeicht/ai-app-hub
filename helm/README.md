# Helm-Charts – ai-app-hub im Kunden-Cluster

Ein Chart pro Service (`ai-app-hub-backend`, `ai-app-hub-frontend`), siehe
`deployment.mdc`, plus ein gemeinsamer Routing-Chart (`ai-app-hub-ingress`).
Wird in den per `infra/bicep/customer-cluster` erzeugten Kunden-Cluster
deployed (siehe ADR-9/ADR-10/ADR-11 in
`docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md`).

Zusätzlich `helm/cluster-issuer/`: kein App-Chart, sondern der cluster-weite
Let's-Encrypt-`ClusterIssuer` (cert-manager) – einmalig pro Cluster, nicht
pro Fachapplikation.

## Cluster-Bootstrapping (einmalig pro Kunden-Cluster, VOR dem ersten App-Deploy)

Öffentlicher Zugriff braucht einen Ingress-Controller + TLS-Automatisierung
im Cluster – beides cluster-weite Infrastruktur, kein App-spezifisches Chart
(siehe ADR-11):

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo update

# Ersetzt <dns-label> durch einen pro Kunde eindeutigen Kurznamen (z. B. den
# Kundennamen aus infra/bicep, "confessio-test") - ergibt
# https://<dns-label>.<region>.cloudapp.azure.com, kostenlos, ohne eigene Domain.
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --create-namespace --namespace ingress-nginx \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-dns-label-name"="<dns-label>" \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"="/healthz"

helm install cert-manager jetstack/cert-manager \
  --create-namespace --namespace cert-manager --set crds.enabled=true

helm install cluster-issuer ./helm/cluster-issuer \
  --set acmeEmail=platform@axora.app
```

**Wichtig:** Ohne die `azure-load-balancer-health-probe-request-path`-
Annotation markiert Azure den Ingress-Controller-Node als "unhealthy" (Azures
Standard-Health-Probe prüft `/`, nginx-ingress' Default-Backend liefert dort
`404` ohne passenden `Host`-Header) – externer Zugriff auf Port 80/443
schlägt dann mit "Timeout during connect" fehl, auch wenn NSG-Regeln und
Ingress-Ressourcen korrekt sind (siehe ADR-11).

## Voraussetzungen

- Cluster-Bootstrapping (siehe oben) einmalig durchgeführt.
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

# Routing/TLS für beide Services zusammen (siehe ADR-11) - kein image.tag,
# da dieser Chart keine eigenen Container enthält.
helm install ai-app-hub-ingress ./helm/ai-app-hub-ingress \
  -f helm/ai-app-hub-ingress/values-test.yaml \
  -n ai-app-hub
```

Für ein Update: `helm upgrade` statt `helm install`, jeweils mit neuem
`image.tag`.

**Secrets:** Werden nie in `values.yaml`/`values-<env>.yaml` eingecheckt,
sondern per `--set-string` übergeben. Für den manuellen Testdeploy kommen sie
hier aus der lokalen Shell (aus `.env`), in einer echten Pipeline aus
GitHub Encrypted Secrets (siehe `deployment.mdc`, offener Punkt in ADR-10).

## Verifizieren

Über den öffentlichen Ingress (seit ADR-11):

```bash
kubectl get pods -n ai-app-hub
kubectl get ingress,certificate -n ai-app-hub
curl https://<host>/api/health
curl https://<host>/runtime-config.json
```

Alternativ weiterhin per `kubectl port-forward` (z. B. für Debugging ohne
Umweg über den Ingress):

```bash
kubectl port-forward -n ai-app-hub svc/ai-app-hub-backend 8080:6055 &
kubectl port-forward -n ai-app-hub svc/ai-app-hub-frontend 8081:80 &
```

## Bewusst noch nicht Teil dieser Charts (siehe ADR-11, offene Punkte)

- `ingress-nginx`/`cert-manager`-Cluster-Bootstrapping ist noch nicht Teil
  der GitHub-Actions-Pipeline (aktuell manueller `helm install` einmalig
  pro Cluster, siehe oben).
- Kein `HorizontalPodAutoscaler` (noch keine Lastdaten, YAGNI).
- Eigene Kunden-Domain statt `*.cloudapp.azure.com` (aktuell kein Bedarf,
  siehe ADR-11).
