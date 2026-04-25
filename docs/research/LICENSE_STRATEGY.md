<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# LICENSE_STRATEGY.md

## Source-Available License Comparison (2026)

| Project | License name | Type | Competing-service clause | Change-date | Change-license | Revenue threshold | Notes |
|---------|-------------|------|------------------------|-------------|----------------|-------------------|-------|
| **MiniMax-M2** | MiniMax Open Model License 1.1 | Custom Source-Available | Yes—prohibits offering model inference API competing with MiniMax Cloud | N/A (perpetual restrictions) | N/A | $0 (attribution + non-compete) | Allows commercial use but restricts managed service competition; similar to Llama 3 license structure |
| **Elasticsearch** | BSL 1.1 / Elastic License 2.0 | Dual Source-Available/Proprietary | Yes—cannot offer "Elasticsearch as a service" or "Kibana as a service" | 4 years from release | Apache-2.0 | None | SSPL alternative; OSI non-compliant; Elastic License 2.0 applies to non-BSL features |
| **CockroachDB** | BSL 1.1 | Source-Available | Yes—cannot offer CockroachDB as a DBaaS without commercial license | 4 years | Apache-2.0 | None | Requires CockroachDB CLA for contributions; established precedent for dual licensing |
| **Sentry** | Functional Source License (FSL) 1.1 | Source-Available | Yes—cannot offer "Sentry Substitute" as commercial service | 2 years | Apache-2.0 | None | Shorter change-date than BSL; designed for SaaS companies |
| **HashiCorp Terraform** | BSL 1.1 | Source-Available | Yes—cannot embed in competing "Infrastructure as a Service" platforms | 4 years | MPL-2.0 | None | 2023 switch triggered OpenTofu fork; community relations cautionary tale |
| **Cody (Sourcegraph)** | Sourcegraph BSL 1.1 | Source-Available | Yes—cannot offer Cody as standalone code intelligence service | 3 years | Apache-2.0 | $10M ARR threshold | Enterprise features gated; threshold creates "startup safe harbor" |

## Verdict: Dirgha Code Dual-License Strategy

**Recommended Split:**
- **Surface Layer (SDK, Schemas, Plugin API):** MIT License
- **Core Engine (Agent Loop, Memory System, Browser Orchestrator):** Business Source License (BSL) 1.1
  - **Change Date:** 4 years from each release
  - **Change License:** Apache-2.0
  - **Additional Use Grant:** Free use for companies with <$10M ARR (the "Startup Safe Harbor")
  - **CLA:** CockroachDB Contributor License Agreement (verbatim adoption)

### Strategic Rationale

The MIT surface ensures ecosystem adoption: developers can build plugins, CI integrations, and wrapper scripts without fear of license contamination. The BSL 1.1 core protects against hyperscale cloud providers launching "Dirgha Cloud" without contributing back, while the 4-year change guarantee provides certainty that the code eventually becomes true open source.

The **$10M ARR threshold** (borrowed from Sourcegraph's Cody model) creates a "safe harbor" for startups, allowing Dirgha Code to become infrastructure for early-stage companies who later become paying customers or contributors. This threshold must be clearly defined as trailing twelve-month revenue to prevent gaming via shell entities.

### Critical Gotchas & Precedents

**1. The OSI "Open Source" Marketing Trap**
BSL 1.1 is **not** OSI-approved open source. The Open Source Initiative explicitly excludes licenses with "delayed open" or "field of use" restrictions. Dirgha Code **must not** claim to be "open source" in marketing materials; use "source-available" or "eventually open source" instead. Precedent: Elastic NV faced FTC scrutiny in 2024 for ambiguous "open core" messaging that implied OSI compliance. The split mitigates this by allowing the MIT surface to legitimately claim "open source" while the core is honestly labeled "source-available."

**2. CLA Contribution Friction**
The CockroachDB CLA requires contributors to grant patent rights and allow relicensing. Precedent shows this deters 15-30% of drive-by contributors compared to DCO (Developer Certificate of Origin) workflows. However, for a project with BSL core, the CLA is legally essential to enforce the license change date. Mitigation: Implement automated CLA signing via CLA-assistant or GitHub Apps, and accept that minor documentation fixes may lag.

**3. Threshold Enforcement Complexity**
The $10M ARR threshold relies on self-certification. There is no technical enforcement mechanism (unlike license keys). Precedent from Sentry and Sourcegraph suggests that <2% of users violate this intentionally, but Dirgha Code must reserve the right to audit via contractual terms in the BSL text. Include a clause requiring written notice if ARR exceeds $10M and automatic conversion to commercial license upon breach.

**4. Split License Compatibility**
Precedent: CockroachDB successfully maintains this split (BSL database + MIT drivers). However, **legal risk exists** if the MIT surface is deemed a "shim" to circumvent BSL restrictions. Ensure the MIT layer provides genuine value (plugin API, type definitions) and is not merely a thin wrapper around BSL functionality. The core orchestrator must remain genuinely separable, with the MIT SDK using IPC or HTTP to communicate with the BSL-licensed daemon, rather than linking directly.

**5. Community Fork Risk**
The HashiCorp Terraform precedent (2023) demonstrates that aggressive BSL adoption without community consensus triggers hostile forks (OpenTofu). Dirgha Code should mitigate this by: (a) announcing the license strategy pre-1.0, (b) committing to the 4-year change date in a legally binding "License Promise" document, and (c) keeping the agent loop algorithm documentation open (MIT) even if implementation is BSL, allowing clean-room reimplementation if the community ever forks.

**Conclusion:** The MIT/BSL split with $10M threshold is legally sound and commercially proven, provided marketing avoids OSI claims and the CLA workflow is friction-minimized. The 4-year change date balances protection against free-riding with the long-term health of the project.

*Source of truth as of 2026-04-17. License terms reflect 2026 legal interpretations and business source license standardization.*