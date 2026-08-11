// Einmaliges Setup der geteilten Axora-Plattform-Infrastruktur (ADR-9):
// aktuell nur die zentrale Container Registry, die von allen Kunden-Clustern
// (Fall 1 und Fall 2) gemeinsam genutzt wird.
targetScope = 'subscription'

@description('Azure-Region für die Plattform-Ressourcen.')
param location string = 'westeurope'

@description('Name der Resource Group für geteilte Plattform-Ressourcen.')
param resourceGroupName string = 'rg-axora-platform'

@description('Name der zentralen Container Registry (global eindeutig).')
param acrName string = 'acraxoraplatform'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

module acr '../modules/container-registry.bicep' = {
  name: 'acr-deployment'
  scope: rg
  params: {
    location: location
    acrName: acrName
  }
}

output resourceGroupName string = rg.name
output acrName string = acr.outputs.name
output acrLoginServer string = acr.outputs.loginServer
