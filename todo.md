# Blog Post TODO

## Priority 1 — Write now (supports ML/Platform Engineer positioning)

- [x] **Building a data platform with dbt + Dagster + ArgoCD from scratch**
  - 103 commits on dbt-poc over 14 months, deepest project
  - Cover: ELT architecture, why Dagster over Airflow, dbt transforms in the Dagster DAG, K8s/Helm/ArgoCD deploy, PII removal during extraction
  - Maps to portfolio signal #2 from CAREER-PLAN.md

- [ ] **Battery lifetime prediction at 100k-device IoT scale**
  - Partially covered by `evaluating-ml-algorithms-in-production`; still worth a dedicated architecture post focused on prediction and rollout.
  - Ties together datavil (83 commits), thermostat-supervisor (54 commits), battery-algorithm-evaluation, consumption-rate-generator
  - Cover: ML pipeline architecture, data flow from thermostats through supervisor to prediction algorithms, keeping predictions accurate at fleet scale
  - Maps to portfolio signal #1 from CAREER-PLAN.md

- [ ] **Deploying to production with ArgoCD and Helm: what I learned across 18 releases**
  - deploy repo has real multi-stage releases (DEV -> TEST -> STAGING -> PROD)
  - Cover: version management pattern, environment-specific Helm values, release workflow
  - Shorter post, high signal for platform/infra roles

## Priority 2 — Write after secure-llm-stack exists (already in CAREER-PLAN.md week 8)

- [ ] **Hardening a self-hosted LLM stack: SBOM, signed images, prompt-injection evals**
- [ ] **What profiling cryptographic transformer inference taught me about LLM serving memory**

## Priority 3 — Optional shorter posts

- [ ] **Strict runtime type safety in production Python: beartype + Pydantic + Pandera**
  - Used across datavil and thermostat-supervisor
  - Signals engineering rigor

- [ ] **4.5 years on a Vue 3 + Express platform: what I'd do differently**
  - 74+43 commits on dashboard-frontend/backend since Nov 2021
  - Architecture retrospective, signals seniority
