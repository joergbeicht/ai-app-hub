@description('Azure-Region der zentralen Container Registry.')
param location string

@description('Name der Azure Container Registry (global eindeutig, nur Kleinbuchstaben/Zahlen).')
param acrName string

@description('SKU der ACR. Standard reicht für den aktuellen Bedarf (Premium erst bei Geo-Replikation/Private Endpoints nötig).')
@allowed(['Basic', 'Standard', 'Premium'])
param skuName string = 'Standard'

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: skuName
  }
  properties: {
    adminUserEnabled: false
  }
}

output loginServer string = acr.properties.loginServer
output resourceId string = acr.id
output name string = acr.name
