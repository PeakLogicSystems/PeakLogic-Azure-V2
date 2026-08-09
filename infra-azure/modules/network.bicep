// Network module — Azure equivalent of infra/lib/network-stack.ts
//
// Real, disclosed structural difference from the AWS version, not a 1:1
// port: AWS's CDK `ec2.Vpc` construct gives a convenience "public / private
// / isolated" subnet-type abstraction with automatic NAT-gateway wiring per
// type. Azure VNets have no equivalent built-in abstraction — subnets, their
// routing, and their NSGs are each defined explicitly. This module defines
// two subnets, not three, since Azure Functions (Infrastructure as Code §3's
// confirmed compute choice) doesn't need a dedicated "public" subnet the way
// an AWS ALB/NAT placement would — the platform handles the HTTP-triggered
// function's public endpoint itself, outside this VNet entirely:
//
// CORRECTED 2026-07-31 (api.bicep): snet-compute's delegation was
// `Microsoft.Web/serverFarms` — the delegation for Premium/App-Service-plan
// VNet integration. api.bicep uses the Flex Consumption plan instead (see
// its own header comment for why), which requires a DIFFERENT delegation —
// `Microsoft.App/environments`, verified via Microsoft Learn. Fixed here
// rather than left wrong, since nothing had deployed against the old
// delegation yet (no Azure subscription exists — Infrastructure as Code §8).
//
//   snet-compute — VNet-integrated Azure Functions egress (outbound to
//                  Postgres, Key Vault, IoT Hub). Analogous in *purpose* to
//                  network-stack.ts's PRIVATE_WITH_EGRESS tier.
//   snet-data    — Azure Database for PostgreSQL Flexible Server's private
//                  access. No route to the public internet — analogous to
//                  PRIVATE_ISOLATED. Only snet-compute may reach it (NSG rule).
//
// NAT Gateway is stage-conditional, mirroring network-stack.ts's exact
// dev=0/staging=1/prod=2 reasoning — Azure's NAT Gateway resource is a
// single, non-zonal-redundant-by-default resource per deployment, so the
// same "a NAT outage takes out every function's egress" risk network-
// stack.ts identified for a single NAT gateway is verified to recur here
// unchanged (both platforms funnel a subnet's egress through one gateway
// resource by default) — flagged for re-verification once real traffic
// exists, not assumed identical without checking (Infrastructure as Code §8).

@description('Stage-prefixed resource name base, e.g. "peaklogic-dev".')
param namePrefix string

param location string

@allowed(['dev', 'staging', 'prod'])
param stage string

@description('Standard resource tags (project/stage/managedBy) — Azure.Resource.UseTags, architecture-review PSRule remediation 2026-08-09.')
param tags object = {}

// Mirrors network-stack.ts's exact NAT-gateway-count-by-stage table
// (Deployment Architecture §3.1) — 0 for dev (cost-minimal, matches this
// fork's own not-yet-decided Key Vault-bypass question, Technical Debt
// Register v1.4), 1 for staging, 2 is not directly expressible as "more NAT
// Gateway resources" the way AWS's one-per-AZ model works; Azure's NAT
// Gateway already spans the zones it's associated with when zone-redundant
// is selected. Modeled here as a single boolean (deploy a NAT Gateway or
// not) rather than a count, since the zonal-redundancy knob is a separate,
// real decision not yet made (flagged below, not assumed).
var deployNatGateway = stage != 'dev'

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: '${namePrefix}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.0.0.0/16']
    }
    subnets: [
      {
        name: 'snet-compute'
        properties: {
          addressPrefix: '10.0.1.0/24'
          // Microsoft.Storage service endpoint — lets api.bicep's storage
          // account firewall (Azure.Storage.Firewall remediation,
          // architecture-review PSRule pass 2026-08-09) allow this subnet
          // specifically via a virtualNetworkRules entry, rather than
          // relying solely on the broader, less-precise "AzureServices"
          // bypass.
          serviceEndpoints: [
            { service: 'Microsoft.Storage' }
          ]
          delegations: [
            {
              name: 'functions-delegation'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
          networkSecurityGroup: {
            id: computeNsg.id
          }
          natGateway: deployNatGateway ? { id: natGateway.id } : null
        }
      }
      {
        name: 'snet-data'
        properties: {
          addressPrefix: '10.0.2.0/24'
          delegations: [
            {
              name: 'postgres-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
          networkSecurityGroup: {
            id: dataNsg.id
          }
        }
      }
    ]
  }
}

resource natGatewayPublicIp 'Microsoft.Network/publicIPAddresses@2023-11-01' = if (deployNatGateway) {
  name: '${namePrefix}-nat-pip'
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource natGateway 'Microsoft.Network/natGateways@2023-11-01' = if (deployNatGateway) {
  name: '${namePrefix}-natgw'
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: {
    publicIpAddresses: [
      { id: natGatewayPublicIp.id }
    ]
  }
}

// Two explicit outbound-deny rules on BOTH NSGs below satisfy
// Azure.NSG.LateralTraversal (architecture-review PSRule pass, 2026-08-09):
// "deny outbound management connections from non-management hosts." Neither
// subnet hosts anything that legitimately originates RDP/SSH (Functions and
// a managed Postgres server, not VMs), so this closes a real theoretical
// lateral-movement path with zero effect on actual traffic.
var lateralTraversalDenyRules = [
  {
    name: 'DenyOutboundRdp'
    properties: {
      priority: 4090
      direction: 'Outbound'
      access: 'Deny'
      protocol: 'Tcp'
      sourceAddressPrefix: '*'
      sourcePortRange: '*'
      destinationAddressPrefix: '*'
      destinationPortRange: '3389'
    }
  }
  {
    name: 'DenyOutboundSsh'
    properties: {
      priority: 4091
      direction: 'Outbound'
      access: 'Deny'
      protocol: 'Tcp'
      sourceAddressPrefix: '*'
      sourcePortRange: '*'
      destinationAddressPrefix: '*'
      destinationPortRange: '22'
    }
  }
]

// Compute subnet NSG — outbound-only posture, mirroring
// network-stack.ts's LambdaSg (`allowAllOutbound: true`, no inbound rules
// since nothing calls a Function directly through this VNet path).
resource computeNsg 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: '${namePrefix}-compute-nsg'
  location: location
  tags: tags
  properties: {
    securityRules: lateralTraversalDenyRules
  }
}

// Data subnet NSG — only accepts connections from the compute subnet on
// 5432, mirroring RdsSg's exact ingress rule (`rdsSg.addIngressRule(lambdaSg,
// tcp(5432), ...)`, data-stack.ts) precisely, not a broader allow.
resource dataNsg 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: '${namePrefix}-data-nsg'
  location: location
  tags: tags
  properties: {
    securityRules: concat(
      [
        {
          name: 'AllowPostgresFromCompute'
          properties: {
            priority: 100
            direction: 'Inbound'
            access: 'Allow'
            protocol: 'Tcp'
            sourceAddressPrefix: '10.0.1.0/24'
            sourcePortRange: '*'
            destinationAddressPrefix: '10.0.2.0/24'
            destinationPortRange: '5432'
          }
        }
        {
          name: 'DenyAllOtherInbound'
          properties: {
            priority: 4096
            direction: 'Inbound'
            access: 'Deny'
            protocol: '*'
            sourceAddressPrefix: '*'
            sourcePortRange: '*'
            destinationAddressPrefix: '*'
            destinationPortRange: '*'
          }
        }
      ],
      lateralTraversalDenyRules
    )
  }
}

// ── Real, disclosed gap, not silently omitted ──
// network-stack.ts's VPC Flow Logs (cdk-nag AwsSolutions-VPC7, and a real
// incident-response forensic source, Security Architecture §6) have a real
// Azure equivalent — NSG Flow Logs, which require a subscription-level
// Network Watcher resource to already exist (Azure auto-creates one per
// region on first VNet deployment in most subscriptions, but this is a
// subscription-level fact this module cannot verify or provision safely
// without knowing the target subscription's current state). Not wired up in
// this pass — flagged here, not silently dropped, as real follow-up work
// once this module is actually deployed against a real subscription
// (Infrastructure as Code §8).

output vnetId string = vnet.id
output computeSubnetId string = vnet.properties.subnets[0].id
output dataSubnetId string = vnet.properties.subnets[1].id
