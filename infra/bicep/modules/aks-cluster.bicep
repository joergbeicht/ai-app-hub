@description('Azure-Region des Clusters.')
param location string

@description('Name des AKS-Clusters, z. B. aks-confessio-test.')
param clusterName string

@description('Anzahl der Nodes im System-Node-Pool.')
param nodeCount int = 2

@description('VM-Größe der Nodes. Vorsicht: manche VM-Familien haben auf frischen Subscriptions eine Quota von 0, siehe "az vm list-usage --location <region>".')
param nodeVmSize string = 'Standard_D2s_v3'

@description('Kubernetes-Version des Clusters. Siehe "az aks get-versions --location <region>" für aktuell unterstützte Versionen.')
param kubernetesVersion string = '1.36.2'

resource aks 'Microsoft.ContainerService/managedClusters@2024-05-01' = {
  name: clusterName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: clusterName
    kubernetesVersion: kubernetesVersion
    agentPoolProfiles: [
      {
        name: 'system'
        count: nodeCount
        vmSize: nodeVmSize
        mode: 'System'
        osType: 'Linux'
        type: 'VirtualMachineScaleSets'
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
    }
    // OIDC Issuer + Workload Identity: Grundlage für GitHub-Actions-Deploy ohne
    // langlebiges Service-Principal-Secret (siehe deployment.mdc).
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }
  }
}

// Die AcrPull-Rollenzuweisung auf die geteilte ACR liegt bewusst NICHT hier,
// sondern in `modules/acr-pull-role-assignment.bicep`: Ein Bicep-Modul kann
// Ressourcen nur im Scope seines eigenen Deployments anlegen (BCP139), die
// ACR liegt aber in einer anderen Resource Group als dieser Cluster. Der
// Aufrufer (`customer-cluster/main.bicep`, Subscription-Scope) deployt dieses
// Modul zusätzlich direkt in die ACR-Resource-Group.

output clusterName string = aks.name
output oidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL
output kubeletIdentityObjectId string = aks.properties.identityProfile.kubeletidentity.objectId
