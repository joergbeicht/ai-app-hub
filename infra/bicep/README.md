# Infrastructure as Code (Bicep) – ein AKS-Cluster pro Kunde

Setzt ADR-9 (`docs/ARCHITEKTUR-ENTSCHEIDUNGEN.md`) technisch um: **kein**
mandantenfähiger Cluster, sondern eine wiederverwendbare Vorlage, die pro
Kunde 1x ("Fall 1", nur `prod`) oder 2x ("Fall 2", `test` und `prod`)
aufgerufen wird.

## Struktur

```
infra/bicep/
├── platform/main.bicep              # einmalig: geteilte Plattform-Infra (aktuell: zentrale ACR)
├── customer-cluster/main.bicep      # n-mal: ein AKS-Cluster für einen Kunden + eine Umgebung
└── modules/
    ├── container-registry.bicep     # Azure Container Registry
    ├── aks-cluster.bicep            # AKS-Cluster (System-Node-Pool, OIDC-Issuer, Workload Identity)
    └── acr-pull-role-assignment.bicep  # AcrPull-Rolle des Kunden-Clusters auf der geteilten ACR
```

Warum eine zentrale ACR statt einer ACR pro Kunde: Docker-Images sind kein
Kundendatum (im Gegensatz zu den strikt getrennten Datenbanken pro Kunde,
siehe `platform-architecture.mdc`), CI baut sie einmal und alle
Kunden-Cluster ziehen dasselbe Image – siehe ADR-9.

## Voraussetzungen

- Azure CLI (`az`) lokal installiert, `az bicep install` einmalig ausführen.
- `az login` mit einem Account, der auf der Ziel-Subscription mindestens
  `Contributor` + `User Access Administrator` (für die Rollenzuweisung) hat.
- Bereits vorhandene Azure-Subscription (siehe ADR-9).

## 1. Einmaliges Plattform-Setup (zentrale ACR)

```bash
az account set --subscription "<SUBSCRIPTION_ID>"

az deployment sub create \
  --location westeurope \
  --template-file infra/bicep/platform/main.bicep \
  --parameters acrName=acraxoraplatform
```

Nur **einmal** für die gesamte Axora-Plattform ausführen, nicht pro Kunde.

## 2. Ein Kunden-Cluster deployen

Fall 1 (nur `prod`):

```bash
az deployment sub create \
  --location westeurope \
  --template-file infra/bicep/customer-cluster/main.bicep \
  --parameters customerName=<kunde> environment=prod
```

Fall 2 (`test`, später `prod`):

```bash
az deployment sub create \
  --location westeurope \
  --template-file infra/bicep/customer-cluster/main.bicep \
  --parameters customerName=confessio environment=test

az deployment sub create \
  --location westeurope \
  --template-file infra/bicep/customer-cluster/main.bicep \
  --parameters customerName=confessio environment=prod
```

Ergebnis pro Aufruf: Resource Group `rg-<kunde>-<env>` mit AKS-Cluster
`aks-<kunde>-<env>`, dessen Kubelet-Identity automatisch `AcrPull` auf der
zentralen ACR bekommt.

**Vor dem Deploy prüfen (insb. bei neuen/frischen Subscriptions):**

```bash
# Unterstützte Kubernetes-Versionen in der Zielregion
az aks get-versions --location westeurope -o table

# vCPU-Quota der Ziel-VM-Familie (Default: Standard_D2s_v3 / "Dsv3 Family")
az vm list-usage --location westeurope -o table | grep -i dsv3
```

Reicht die Quota nicht oder ist die Default-Kubernetes-Version nicht mehr
supported, `nodeVmSize`/`kubernetesVersion` beim Aufruf überschreiben
(`--parameters nodeVmSize=... kubernetesVersion=...`) statt den Deploy
einfach scheitern zu lassen.

## Bewusst noch nicht Teil dieser Vorlage (siehe ADR-9, offene Punkte)

- Kein automatischer 1-Klick-Trigger (Kauf → Deployment) – aktuell manueller
  `az deployment sub create`-Aufruf.
- Keine GitHub-Actions-Pipeline mit OIDC/Workload Identity Federation für
  diesen Bicep-Deploy selbst (nur der Cluster wird bereits mit
  `oidcIssuerProfile`/`workloadIdentity` vorbereitet, damit spätere
  App-Deployments per Workload Identity laufen können).
- Kein Test→Prod-Transport-Mechanismus (nur die zwei separaten
  Cluster-Deployments).
- Keine Helm-Charts/App-Deployment – diese Vorlage erzeugt nur die
  Cluster-Infrastruktur, nicht die App selbst.
