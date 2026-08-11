// Wird vom Aufrufer direkt mit `scope: resourceGroup(sharedAcrResourceGroupName)`
// deployed (siehe customer-cluster/main.bicep), damit die Rollenzuweisung im
// selben Scope wie die ACR selbst entsteht (siehe BCP139 in aks-cluster.bicep).
@description('Name der zentralen, geteilten Azure Container Registry.')
param acrName string

@description('Object-ID der Kubelet-Managed-Identity des Kunden-AKS-Clusters, die Images pullen darf.')
param principalId string

@description('Well-known Azure-Rollen-ID für "AcrPull" (Rollen-IDs sind global fix).')
var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
}

resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, principalId, 'AcrPull')
  scope: acr
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
