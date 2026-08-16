# KubeManifestPilot requirements baseline v2

## Product objective

KubeManifestPilot is a static, browser-only Kubernetes questionnaire generator:

```text
Questionnaire → QuestionnaireSpec → Kubernetes YAML + DEPLOY.md
```

The existing architecture designer remains available as an advanced visualization tool. It is not the source of truth for generated manifests.

## Supported first-version templates

1. Frontend and backend, one replica each
2. PostgreSQL, single replica
3. Frontend only
4. Backend only
5. Frontend, backend, and PostgreSQL
6. Backend with external PostgreSQL

“Single replica” refers to workload replicas and never means scheduling to a particular Kubernetes Node.

## Questionnaire

1. Template, project name, namespace, environment
2. Application images, ports, replicas, resources, probes, ConfigMap values, command and args
3. PostgreSQL mode, storage, and existing Secret references
4. ClusterIP, Ingress, or LoadBalancer exposure; optional PDB and HPA
5. Review, validation, YAML preview, deployment guide, and downloads

## Generation rules

- Create JavaScript resource objects before deterministic YAML serialization.
- Keep selectors, Pod labels, Service ports, and Ingress references consistent.
- Reject `latest` and unversioned images in Production.
- Accept Secret names and keys only; never accept or persist secret values.
- Use StatefulSet and `volumeClaimTemplates` for built-in PostgreSQL.
- Explicitly warn that single-replica PostgreSQL is not HA and has no backup or failover.
- Never emit unresolved placeholders such as `CHANGE_ME` or `REPLACE_ME`.
- Identical normalized input must produce identical output.

## Deployment guide

Generate commands with the actual names from QuestionnaireSpec. Include boundaries, context and capability checks, Secret prerequisites, client/server dry-run, staged apply, rollout and endpoint verification, logs and events, rollback, normal removal, and separate destructive PVC/Namespace removal warnings.

Passing local rules must not be described as cluster validation. The user must run server-side dry-run against the target cluster.

## Security and non-goals

- Never connect to a cluster or execute `kubectl`.
- Never request kubeconfig, cluster tokens, passwords, or private keys.
- Do not manage Node, Node Pool, taints, tolerations, cluster installation, upgrades, controllers, CRDs, Operators, StorageClasses, or Metrics Server.
- Browser storage may contain non-sensitive draft preferences only.

## Hosting and compatibility

- Plain HTML, CSS, and JavaScript; no runtime server, framework, package manager, or CDN.
- Relative URLs compatible with `username.github.io/repository/`.
- Current Chrome and Edge at desktop widths down to 1024px.
- Core features remain functional when ads, clipboard, or browser storage are unavailable.

## MVP acceptance

- GitHub Pages root and every subpage open without uncaught errors.
- Frontend/backend and PostgreSQL templates generate non-empty YAML, questionnaire JSON, and `DEPLOY.md`.
- Output is deterministic and has no unresolved placeholders or secret values.
- Deployment guides contain dry-run, apply, verification, logs, rollback, and removal sections.
- Architecture Designer remains usable from `designer/`.
- Privacy and third-party licensing pages are linked from the site footer.

