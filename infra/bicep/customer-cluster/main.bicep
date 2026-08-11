// Wiederverwendbare Vorlage "ein AKS-Cluster pro Kunde" (ADR-9).
// Wird pro Kunde 1x aufgerufen (Fall 1: nur "prod") oder 2x (Fall 2: "test"
// und "prod"), jeweils mit demselben Template, nur anderen Parametern.
targetScope = 'subscription'

@description('Kurzer, eindeutiger Kundenname in Kleinbuchstaben, z. B. confessio, gerima.')
@minLength(3)
@maxLength(20)
param customerName string

@description('Umgebung dieses Clusters. Fall 1 nutzt nur "prod", Fall 2 "test" und "prod".')
@allowed(['test', 'prod'])
param environment string

@description('Azure-Region des Kunden-Clusters.')
param location string = 'westeurope'

@description('Anzahl der Nodes im System-Node-Pool.')
param nodeCount int = 2

@description('VM-Größe der Nodes. Vorsicht: manche VM-Familien haben auf frischen Subscriptions eine Quota von 0, siehe "az vm list-usage --location <region>".')
param nodeVmSize string = 'Standard_D2s_v3'

@description('Kubernetes-Version des Clusters. Siehe "az aks get-versions --location <region>" für aktuell unterstützte Versionen.')
param kubernetesVersion string = '1.36.2'

@description('Name der zentralen, geteilten ACR (siehe infra/bicep/platform, einmalig deployed).')
param sharedAcrName string = 'acraxoraplatform'

@description('Name der Resource Group der geteilten ACR.')
param sharedAcrResourceGroupName string = 'rg-axora-platform'

var resourceGroupName = 'rg-${customerName}-${environment}'
var clusterName = 'aks-${customerName}-${environment}'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

module cluster '../modules/aks-cluster.bicep' = {
  name: 'aks-deployment'
  scope: rg
  params: {
    location: location
    clusterName: clusterName
    nodeCount: nodeCount
    nodeVmSize: nodeVmSize
    kubernetesVersion: kubernetesVersion
  }
}

// Eigenes Modul, direkt in der ACR-Resource-Group deployed (nur an dieser
// Stelle als Subscription-Deployment möglich, siehe acr-pull-role-assignment.bicep).
module acrPullRoleAssignment '../modules/acr-pull-role-assignment.bicep' = {
  name: 'acr-pull-role-assignment'
  scope: resourceGroup(sharedAcrResourceGroupName)
  params: {
    acrName: sharedAcrName
    principalId: cluster.outputs.kubeletIdentityObjectId
  }
}

output resourceGroupName string = rg.name
output clusterName string = cluster.outputs.clusterName
output oidcIssuerUrl string = cluster.outputs.oidcIssuerUrl
