# AKS microservices with CI/CD and external data stores

Public Mermaid recreation of the supplied Azure Kubernetes Service reference
image. It shows the ingress request path, front-end and back-end namespaces,
container delivery, and supporting platform services.

Install the [optional Azure and supplemental Entra icon packs](../azure-icons.md) before opening this
example in the reader. Use the diagram's zoom controls to inspect the details.

```mermaid
flowchart LR
    client@{ icon: "azure:browser", label: "Client apps", pos: "b" }
    loadBalancer@{ icon: "azure:load-balancers", label: "Azure Load Balancer — Public IP address", pos: "b" }

    subgraph cluster["Azure Kubernetes Service — Kubernetes cluster"]
        direction TB
        aks@{ icon: "azure:aks", label: "Azure Kubernetes Service", pos: "b" }
        subgraph front["Front end — Namespace"]
            ingress["NGINX Ingress"]
        end
        subgraph back["Back end — Namespace"]
            direction LR
            micro1["microservice1"]
            micro2["microservice2"]
            micro3["microservice3"]
            micro4["microservice4"]
            micro5["microservice5"]
            micro1 --> micro2
            micro2 --> micro3
            micro2 --> micro4
            micro2 --> micro5
        end
        cni["Azure CNI powered by Cilium"]
        identity@{ icon: "azure:managed-identities", label: "Managed identities", pos: "b" }
        network@{ icon: "azure:virtual-networks", label: "Virtual network", pos: "b" }
    end

    subgraph delivery["CI/CD — Azure DevOps"]
        direction TB
        pipelines@{ icon: "azure:azure-devops", label: "Azure Pipelines", pos: "b" }
        helm["Helm"]
    end
    registry@{ icon: "azure:container-registries", label: "Azure Container Registry", pos: "b" }

    subgraph platform["Identity, secrets, and observability"]
        direction LR
        entra@{ icon: "azure:entra-id", label: "Microsoft Entra ID", pos: "b" }
        logs@{ icon: "azure:log-analytics-workspaces", label: "Log Analytics workspace", pos: "b" }
        insights@{ icon: "azure:application-insights", label: "Application Insights", pos: "b" }
        vault@{ icon: "azure:key-vault", label: "Azure Key Vault", pos: "b" }
        monitor@{ icon: "azure:monitor", label: "Azure Monitor", pos: "b" }
    end

    subgraph external["External data stores"]
        direction TB
        documentdb@{ icon: "azure:azure-documentdb", label: "Azure DocumentDB", pos: "b" }
        cosmos@{ icon: "azure:azure-cosmos-db", label: "Azure Cosmos DB", pos: "b" }
        redis@{ icon: "azure:azure-managed-redis", label: "Azure Managed Redis", pos: "b" }
        bus@{ icon: "azure:azure-service-bus", label: "Azure Service Bus", pos: "b" }
    end

    client --> loadBalancer
    loadBalancer --> ingress
    ingress --> micro1
    pipelines -. Image push .-> registry
    helm -. Helm deployment .-> aks
    aks -. Image pull .-> registry
    aks -. Role-based access control .-> entra
    identity -. Secrets access .-> vault
    aks -. Networking .-> cni
    cni -.-> network
    aks -. Logs .-> logs
    aks -. Application telemetry .-> insights
    aks -. Metrics .-> monitor

    style cluster fill:transparent,stroke:#2895f5,stroke-width:2px,stroke-dasharray:5 5
    style front fill:transparent,stroke:#a0a7af
    style back fill:transparent,stroke:#a0a7af
    style delivery fill:transparent,stroke:#a0a7af
    style platform fill:transparent,stroke:#a0a7af,stroke-dasharray:5 5
    style external fill:transparent,stroke:#a0a7af,stroke-dasharray:5 5
```

## Reading the diagram

- **Solid arrows** reproduce the request path: client apps → public load
  balancer → ingress → microservice1 → microservice2 → microservices 3, 4, and 5.
- **Dashed arrows** distinguish delivery and platform relationships from request
  traffic: image push/pull, Helm deployment, role-based access control, networking,
  telemetry, and managed-identity access to Key Vault.
- **External data stores** reproduce the reference's list. Connections from
  individual microservices are deliberately unspecified, as in the image.
- The front-end and back-end boxes represent Kubernetes namespaces inside one
  cluster; the drawing is conceptual, not a deployment manifest.

The NGINX, Helm, and Cilium labels use text rather than bundling additional logo
packs. Microservices use generic nodes so Azure Container Instances artwork is
not mistaken for an AKS workload. The standalone Microsoft Entra ID logo is
loaded from the separately installed official Entra icon pack as `azure:entra-id`.

Only Markdown and Mermaid source are included in this repository. The original
image, Microsoft branding, and Azure SVG artwork are not bundled with the sample.
Icons are loaded from each user's separately installed local pack under the
applicable Microsoft terms; see [third-party notices](../../THIRD_PARTY_NOTICES.md).
