# Private Azure web application

Mermaid recreation of the supplied Azure architecture image. Layout is adapted
for the reader; the subnets, private endpoints, service instances, and supporting
resources follow the reference. Solid arrows show application connectivity;
dotted lines show DNS, protection, identity, and monitoring relationships.

This example requires the [optional Azure and supplemental Entra icon packs](../azure-icons.md).
Use the diagram's **+**, **−**, and **Reset** controls to inspect the details.

```mermaid
flowchart TB
    user@{ icon: "azure:users", label: "User", pos: "b" }

    subgraph region["Azure region"]
        direction TB

        subgraph vnet["Virtual Network"]
            direction LR
            network@{ icon: "azure:virtual-networks", label: "Virtual Network", pos: "b" }

            subgraph gatewaySubnet["Application Gateway subnet"]
                direction TB
                gateway@{ icon: "azure:application-gateways", label: "Application Gateway with Web Application Firewall", pos: "b" }
            end

            subgraph integrationSubnet["App Service integration subnet"]
                nic@{ icon: "azure:network-interfaces", label: "Virtual interface", pos: "b" }
            end

            subgraph privateSubnet["Private endpoint subnet"]
                direction LR
                appPe@{ icon: "azure:private-endpoints", label: "App Service private endpoint", pos: "b" }
                dbPe@{ icon: "azure:private-endpoints", label: "Database private endpoint", pos: "b" }
                configPe@{ icon: "azure:private-endpoints", label: "Config private endpoint", pos: "b" }
                storagePe@{ icon: "azure:private-endpoints", label: "Storage private endpoint", pos: "b" }
            end
        end

        subgraph application["App Service"]
            direction TB
            app@{ icon: "azure:app-service", label: "App Service", pos: "b" }
            identity@{ icon: "azure:managed-identities", label: "Managed identity", pos: "b" }
            subgraph instances["App Service instances across availability zones"]
                direction LR
                subgraph zone1["Zone 1"]
                    instance1@{ icon: "azure:app-service", label: "App Service instance", pos: "b" }
                end
                subgraph zone2["Zone 2"]
                    instance2@{ icon: "azure:app-service", label: "App Service instance", pos: "b" }
                end
                subgraph zone3["Zone 3"]
                    instance3@{ icon: "azure:app-service", label: "App Service instance", pos: "b" }
                end
            end
        end

        database@{ icon: "azure:sql-database", label: "Azure SQL Database - Data", pos: "b" }
        vault@{ icon: "azure:key-vault", label: "Azure Key Vault - Secrets", pos: "b" }
        storage@{ icon: "azure:storage", label: "Azure Storage - Deployment storage", pos: "b" }

        subgraph supporting["Supporting resources"]
            direction LR
            dns@{ icon: "azure:dns-zones", label: "Private DNS zones", pos: "b" }
            ddos@{ icon: "azure:ddos-protection-plans", label: "DDoS protection", pos: "b" }
            entra@{ icon: "azure:entra-id", label: "Microsoft Entra ID - Identity", pos: "b" }
        end

        subgraph monitoring["Monitoring - outside the request path"]
            direction LR
            insights@{ icon: "azure:application-insights", label: "Application Insights", pos: "b" }
            monitor@{ icon: "azure:monitor", label: "Azure Monitor", pos: "b" }
            health@{ icon: "azure:monitor-health-models", label: "Azure Monitor health model - optional, preview in reference image", pos: "b" }
        end
    end

    user --> gateway
    gateway --> appPe
    appPe --> app
    app --> nic
    nic --> dbPe
    nic --> configPe
    nic --> storagePe
    dbPe --> database
    configPe --> vault
    storagePe --> storage

    dns -. Linked .-> network
    ddos -. Protects .-> network
    identity -. Identity .-> entra
    app -. Telemetry .-> insights
    app -. Metrics and logs .-> monitor
    insights -. Existing signals .-> health
    monitor -. Existing signals .-> health

    style region fill:transparent,stroke:#7a9cbf,stroke-width:2px
    style vnet fill:transparent,stroke:#7eb6ee,stroke-width:3px
    style gatewaySubnet fill:transparent,stroke:#7eb6ee,stroke-width:2px
    style integrationSubnet fill:transparent,stroke:#7eb6ee,stroke-width:2px
    style privateSubnet fill:transparent,stroke:#7eb6ee,stroke-width:2px
    style application fill:transparent,stroke:#9a9a9a
    style instances fill:transparent,stroke:transparent
    style zone1 fill:transparent,stroke:#d9aa26,stroke-width:2px
    style zone2 fill:transparent,stroke:#d9aa26,stroke-width:2px
    style zone3 fill:transparent,stroke:#d9aa26,stroke-width:2px
    style supporting fill:transparent,stroke:#9a9a9a,stroke-dasharray:5 5
    style monitoring fill:transparent,stroke:#9a9a9a,stroke-dasharray:5 5
```

The health-model preview label reproduces the supplied reference image rather
than asserting current Azure availability. The source image's Microsoft branding
and artwork are not bundled here; the service icons come from your local pack.
The standalone Entra ID logo comes from the supplemental official Entra pack
rather than substituting another service's icon.
