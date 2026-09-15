Sub-workflow Node Architecture
The Sub-workflow Node lets an Automation Orchestrator workflow invoke another published workflow as a composable, reusable unit. This document is the target architecture for the capability: the composition model (a parent-side composition node and a child-side invocation boundary), the runtime execution flow, and the versioning, dependency, and authorization semantics that make composition safe. It is written for the Architect and the Feature Pod as the reference engineers build against.

ANSTRAT-2347 owns the Product and runtime composition capability. ANSTRAT-2422 (the Node SDK) is an emerging framework/registry/SDK dependency: this design aligns with it where practical but keeps the 2347 runtime capability independent of unfinished SDK representation. Unfinished 2422 contracts do not automatically become 2347 contracts.

Feature: ANSTRAT-2347 — Workflow Automation: Sub-workflow Node Parent outcome: ANSTRAT-2291 — Post-GA Adoption & Market Competitiveness SDK direction (WIP dependency): ANSTRAT-2422 — Automation Orchestrator Node SDK Status: Target-architecture baseline; reflects Product decisions closed as of 2026-09-15. Items marked OPEN are intentionally unresolved. Provenance: PoC evidence, repository verification, meeting history, and the full decision registers live in the companion documents anstrat-2347-subworkflow-architecture.md and anstrat-2347-architecture-evidence-report.md. This document keeps only the provenance needed to prevent ambiguity.
Source hierarchy & label legend
In decreasing authority: (1) the ANSTRAT-2347 SDP / Acceptance Criteria (Product source of truth); (2) current origin/devel Syntara code (verified implementation facts); (3) the ANSTRAT-2347 PoC (evidence only); (4) the Sep 9 2026 architecture meeting (meeting alignment, not approved architecture); (5) the ANSTRAT-2422 architecture/branch (WIP dependency, not an authoritative 2347 contract).

Each statement is marked by what it is: [PRODUCT] (Product/AC contract), [CODE] (verified current code), [POC], [MEETING-ALIGNED], [2422-WIP], [PROPOSED] (proposed architecture, not yet ratified), or [OPEN] (unresolved architecture). Within architecture-owned material we further distinguish an architectural invariant (must hold for correctness), a proposed safeguard (recommended, not yet ratified), and an implementation option (one way among several). None of PROPOSED / POC / MEETING-ALIGNED / 2422-WIP is a decided contract.
Target Architecture at a Glance
graph TB
    subgraph DESIGN["DESIGN / CONTROL PLANE"]
        PWF["Parent Workflow Definition"] --> SWN["Sub-workflow Composition Node<br/>[node identity OPEN — §2.1]"]
        SWN -->|references| CWF["Child Workflow Definition"]
        CWF --> ST["dedicated Subworkflow Trigger<br/>= invocation contract<br/>role PRODUCT · representation OPEN (§2.2)"]
        SWN -.->|composition edge| DEP["Dependency index<br/>derived vs materialized OPEN (§8.3)"]
        DEP --> UB["Used-By"]
        DEP --> PW["Publish warning"]
        DEP --> DG["Deletion guard"]
    end
    subgraph RUNTIME["RUNTIME"]
        PE["Parent execution reaches node"] --> RC["Resolve referenced child"]
        RC --> LP["Latest published version (§8.1)"]
        LP --> ENT["Enter via Subworkflow Trigger<br/>invocation contract (§2.2)"]
        ENT --> AZ["Authorization / admission:<br/>eligibility + execute-permission (§9)"]
        AZ --> MI["Mapped-input validation (§4)"]
        MI --> CH["Linked Temporal child workflow<br/>replay-safe start (§6)"]
        CH --> CG["Child graph runs"]
        CG --> RES["Result / error envelope<br/>shape OPEN (§5)"]
        RES --> CONT["Parent continues"]
    end
    ST -. "the same dedicated trigger is the runtime entry" .-> ENT
    CWF -. "resolved at runtime" .-> RC

Read the top half as authoring/design-time (what the builder persists and what the dependency graph supports) and the bottom half as one runtime invocation. Dashed nodes/edges mark representation that is OPEN; solid Product-decided structure is the two-role spine — a composition node that references a child, and a dedicated Subworkflow Trigger that is the only way in.
Decision Status
Topic
Status
Basis
Synchronous child invocation
DECIDED / Product
SDP AC
Always-latest published version
DECIDED / Product
SDP AC (AAP-91264)
Reference vs Embed modes
DECIDED / Product
SDP AC (Embed = AAP-91282)
Used-By, publish warning, deletion guard
DECIDED / Product
SDP AC (AAP-91271/76/77/78/79)
Dependency / invocation resolve published only
DECIDED / Product
PM decision (partly closes DEC-008)
Invocation enters child via a dedicated Subworkflow Trigger (existence & role)
DECIDED / Product
PM decision (was Sep 9 MEETING-ALIGNED)
Eligibility is trigger-based (invocable iff it exposes a Subworkflow Trigger); no callable/runnable boolean flags
DECIDED / Product
PM decision (supersedes AAP-91270 flag framing)
retry_policy behaves as standard node retry; repeated side effects accepted; idempotency is the designer's responsibility
DECIDED / Product
PM decision (closes DEC-004 at Product level; AAP-91316)
Input surfacing configured on the parent Sub-workflow node only (not promoted to parent workflow-level inputs)
DECIDED / Product
SDP AC-1d
Cross-project sub-workflows
Product intent: cross-project; V1 scope OPEN (pending engineering estimate)
DEC-007
Subworkflow Trigger persisted identity / SDK registration / config model
OPEN — architecture / 2422 (Product decided that it exists; how is open)
AAP-91315 / 2422
Parent composition node durable identity
OPEN — architecture
AAP-91262
Authoritative child input schema persistence (trigger is the boundary; where the schema lives)
OPEN — architecture
AAP-91261 follow-on
Output envelope & field names
OPEN — architecture / 2422 alignment
—
Child-start replay-safe identity (Temporal replay; distinct from business idempotency)
OPEN — architecture
AAP-91316 (architecture portion)
Pre-invocation contract validation (version-drift preflight)
OPEN — architecture; proposed safeguard, not a Product requirement
—
Cancellation-propagation behavior
OPEN — architecture
DEC-001
Cycle protection (two layers)
PROPOSED architecture
—
Exact nesting depth / timeout values
OPEN — architecture/perf
DEC-006 / AAP-92254
Dependency index: derived vs materialized
OPEN — architecture (published-only scope decided)
DEC-002 / DEC-008
Telemetry / audit event names
OPEN — pending security review
AAP-91238

What this document deliberately does not freeze yet
the exact parent NodeType string / persisted identity;
the exact child Subworkflow Trigger persisted identity and configuration model;
multiple Subworkflow Trigger support in v1;
a workflow_id + trigger_id (ingress-scoped) reference model;
the exact output envelope and field names;
the child-start replay-safe identity scheme (Temporal); note retry policy is decided — only the replay-safe execution identity is open (§7);
cancellation-propagation behavior;
fixed depth / timeout values;
SDK manifest / descriptor details.

The callable/runnable boolean-flag fields are not an "unfrozen" item — that model is dropped in favour of trigger-based eligibility (§9.1).
Architecture Principles
Composition over duplication. A workflow author references an existing published workflow instead of copying its logic; the referenced workflow stays a first-class, independently-maintained asset. [PRODUCT]

Always-latest published. A Reference-mode sub-workflow resolves its target to the target's latest published version at each invocation; publishing a new child version updates every referencing parent with no edit to the parent. [PRODUCT]

Synchronous, linked composition. The parent invokes the child as a child workflow execution, waits for its terminal result, and surfaces that result into the parent's namespace. [PRODUCT] The parent↔child relationship also carries audit correlation [PRODUCT]; the lineage-link shape and cancellation-propagation behavior are design concerns, not yet decided [OPEN — DEC-001].

Distinguishable invocation via a dedicated trigger. A sub-workflow invocation enters the child through a dedicated Subworkflow Trigger, making it distinguishable from a manual run and enabling invocation-source clarity, debugging, and permission gating. [PRODUCT] (The trigger's existence and role are decided; its persisted representation is open — §2.2.)

Reuse the engine's primitives. Composition is built from mechanisms the engine already has — workflow-plane control nodes and child workflow executions [CODE] — not a new execution class, which keeps the feature on replay-safe paths. The specific mapping onto those primitives is [PROPOSED].

Safe by construction. Referenced-workflow lifecycle protection (deletion blocked while referenced), execute-permission before any child starts, and dependency visibility (every composition edge queryable) are Product requirements. [PRODUCT] Runtime recursion/depth protection is an additional safety boundary in the proposed architecture; the exact depth policy is open. [PROPOSED]
1. Product Capability
1.1 Reference vs Embed [PRODUCT]
Mode
What it is
Runtime relationship
Reference
The parent references a target workflow and invokes it at runtime; the child always resolves to its latest published version.
Live parent↔child execution link. This document.
Embed
A design-time copy of a published workflow's nodes onto the parent canvas, as editable copies (AAP-91282).
None — after copy, the nodes are ordinary parent nodes.


Embed is a builder-side transform with no runtime execution path; the rest of this document describes Reference mode. Reference and Embed have different eligibility: Reference requires the child to expose a dedicated Subworkflow Trigger (§9.1); Embed is a design-time import and is not governed by that trigger or by any invocation flag.
1.2 Requirements with architectural weight [PRODUCT]
Synchronous composition, always-latest resolution, downstream availability of the child's result, execute-permission before invocation, trigger-based sub-workflow eligibility (§9.1), and dependency safety (Used-By / publish warning / deletion guard) are Product requirements. How each is represented in code is addressed below, and left open where unresolved. Missing Product requirements are not inferred here.
2. Conceptual Model: Two Roles
Sub-workflow composition has two distinct architectural roles. They are not the same node and should not be collapsed into one persisted identity unless architecture explicitly decides otherwise.
Diagram 1 — Two roles
graph TB
    subgraph A["Parent Workflow A"]
        SWN["Sub-workflow composition node<br/>sub_workflow [IDENTITY TBD]<br/>'Invoke Workflow B here'"]
    end
    subgraph B["Child Workflow B"]
        ING["dedicated Subworkflow Trigger<br/>[role PRODUCT · representation OPEN]<br/>'B is entered as a sub-workflow through this contract'"]
        G["Child graph"]
    end
    SWN -->|invokes| ING --> G
    classDef tbd stroke-dasharray:5 4
    class SWN,ING tbd

The parent-side composition node is a caller ("invoke Workflow B here"). The child-side Subworkflow Trigger is an entry contract ("B is entered as a sub-workflow through this contract"). Conflating them would make the parent's node identity depend on the child's trigger representation; keeping them separate lets each evolve under its own open decision.
2.1 Parent-side composition node [OPEN identity]
A control-plane node in the parent that says "invoke Workflow B here." Its durable node identity is not yet decided (AAP-91262). This document uses sub_workflow as a neutral placeholder: [PLACEHOLDER — FINAL NODE IDENTITY TBD].
2.2 Child-side invocation boundary [PRODUCT — role decided; representation OPEN]
Product has decided that a sub-workflow invocation enters the child through a dedicated Subworkflow Trigger — this is the invocation boundary and what makes a sub-workflow run distinguishable from a manual run.

[PRODUCT] — the decided semantic model:

a workflow is callable as a sub-workflow only if it exposes a dedicated Subworkflow Trigger;
a sub-workflow may be entered only through that Subworkflow Trigger;
a Subworkflow Trigger may be invoked only by a Sub-workflow node;
generic workflow triggers (manual / webhook / EDA / scheduled) do not establish sub-workflow eligibility.

[OPEN — architecture / 2422] — the representation: the trigger's persisted node type, any SDK registration mechanism, its descriptor/manifest, its configuration model, multiple-Subworkflow-Trigger behavior, and its ANSTRAT-2422 representation are not decided here.

Lead-engineer flag (admission rule vs eternal restriction). "A Subworkflow Trigger may be invoked only by a Sub-workflow node" is captured as a Product admission rule for V1. The supplied evidence establishes it as a V1 admission constraint; it does not separately establish it as a permanent architectural invariant forbidding any future caller type (e.g. an API- or event-initiated sub-invocation). Treat it as a V1 admission rule unless the Pod deliberately ratifies it as an invariant — see §13-C and Concern C-1.
2.3 Where this stands today
There is no production Reference-mode composition capability today: current production has only the existing trigger mechanisms (manual / webhook / EDA / scheduled) [CODE], and the PoC selected the child entry by order (triggers[0]), which is [POC] research behavior, not the decided mechanism. The target is the two-role spine above: a composition node (identity OPEN, §2.1) entering the child through its dedicated Subworkflow Trigger (representation OPEN, §2.2). Nothing in the target is implemented in production yet. (PoC detail is in the companion documents.)
3. Placement in the Platform (Taxonomy) [2422-WIP proposal]
Where practical, the two roles align with the emerging 2422 category model: a control-plane composition node and a trigger-category child ingress, both running in-process (no isolated runtime to provision). The child workflow may itself contain container-backed action/task nodes, dispatched to the execution plane as usual; composition adds no container of its own. This alignment is a proposal toward 2422 compatibility, not a contract 2347 is bound by.

graph TB
    NODE["Node to execute"] --> FORK{"execution_type?"}
    FORK -->|in_process| INPROC["workflow / trigger nodes<br/>+ sub_workflow composition [IDENTITY TBD]<br/>+ Subworkflow Trigger [role PRODUCT; placement 2422-WIP]"]
    FORK -->|container| CONT["action / task nodes → worker pods"]
    INPROC --> R["result surfaced to parent (envelope OPEN)"]
    CONT --> R
4. Child Invocation Contract
Two kinds of data must not be conflated: the business invocation contract the parent author sees, and the internal execution context the orchestrator manages.
4.1 Business invocation schema [PRODUCT boundary; schema persistence OPEN]
The author-facing contract — "what inputs does Child B expose?" — is domain data (e.g. customer_id, region, environment). The dedicated Subworkflow Trigger is the invocation boundary that owns this contract (Product — §2.2). Where and how the schema is persisted and represented (trigger descriptor, SDK schema, etc.) remains an open architecture / 2422 question.
4.2 Internal execution context [PROPOSED — not public inputs]
Orchestration metadata the engine manages — parent_execution_id, actor identity, resolved child published version, invocation depth, request/correlation id — is not a user-authored input contract. These belong to execution context, node settings, or platform configuration, not to the public Subworkflow Trigger input schema, unless approved architecture says otherwise.
4.3 Input mapping [PRODUCT surface; POC mechanism]
Per AC-1d, input surfacing and mapping are configured on the parent Sub-workflow node only and are not promoted to the parent workflow's workflow-level input contract. [PRODUCT] This is distinct from the open question of where the child's schema is persisted (§4.1).

The AAP-91261 spike findings on mechanism hold [POC]: mappings are node-local; a model like input_mapping: dict[str, Any] is reasonable; the existing ${...} expression machinery can be reused. The behavior of extra or unmapped inputs is governed by the child's schema validation — not assumed harmless — and follows the input-schema decision (§4.1). Three questions stay separate: what inputs the child exposes (§4.1), where that contract is declared (architecture / possibly Subworkflow Trigger + SDK), and where the parent author maps them (Product UX on the node).
5. Output Handling [OPEN / 2422 alignment]
[PRODUCT] The child's result must be available to downstream parent nodes.

[OPEN] The durable output envelope is not prescribed by 2347 ACs. ANSTRAT-2422 proposes a StandardOutputWrapper (Result, StatusCode, StatusMessage, ErrorMessage) [2422-WIP], which must not be frozen as the 2347 contract. Persisted field names (Result, outputs, output, child_status, …) are not frozen until aligned.

Contract-freeze caution. Any concrete accessor we publish is itself a commitment: writing ${subwf.Result.*} already commits to a field named Result. A genuine compatibility seam would surface child output through an indirection that does not bake a field name into author-visible expressions (resolving a logical "child result" reference that maps onto whichever envelope is finally chosen). Until such a seam is designed and agreed, no claim that an accessor "protects us from future SDK changes" holds. This is a proposed safeguard, and a contract-freeze blocker for author-visible output expressions (§13-B).
6. Runtime Execution Flow (the stable architectural core) [PROPOSED on CODE]
This sequence is the stable core of the feature and is designed to survive migration to ANSTRAT-2422 (§12).

graph TB
    S1["Parent reaches composition node"]:::wf
    S2["Resolve referenced workflow"]:::db
    S3["Resolve latest published version"]:::db
    S4["Resolve child Subworkflow Trigger (invocation contract)"]:::wf
    S5["Authorization / admission"]:::authz
    S6["Resolve + validate mapped inputs"]:::svc
    S7["Create + link child execution"]:::db
    S8["Execute child workflow (Temporal child)"]:::wf
    S9["Await completion"]:::wf
    S10["Surface child result in parent namespace"]:::svc
    S11["Continue parent"]:::wf
    S1-->S2-->S3-->S4-->S5-->S6-->S7-->S8-->S9-->S10-->S11
    classDef wf fill:#eef1fe,stroke:#3b5bdb;
    classDef db fill:#e4faf3,stroke:#0ca678;
    classDef svc fill:#fff4ec,stroke:#e8590c;
    classDef authz fill:#efeafe,stroke:#6f4bd8;

Responsibility lanes:

Step
Responsibility
Reach composition node; resolve entry contract; execute & await child; continue
Temporal workflow logic (deterministic, replay-safe)
Resolve referenced workflow; resolve latest published version; create + link child execution
Database work (read sessions not held across the child-start RPC, per the existing scheduled-launch pattern)
Resolve + validate mapped inputs; surface child result
Activity / backend-service work
Authorization / admission
Authorization / policy boundary — Subworkflow-Trigger eligibility/admission and execute-permission, both before the child starts


Replay-safety invariant. Child-workflow start must be replay-safe under Temporal replay: replaying the parent must not create a second child execution. This is an architectural invariant the proposed design must hold. It concerns A — Temporal replay safety and is distinct from B — node retry policy (a Product decision, §7) and C — business idempotency (the designer's responsibility, §7). The concrete replay-safe-identity strategy (e.g. a derived child workflow id) is not frozen here. [OPEN — architecture]
7. Failure, Retry & Idempotency [PRODUCT retry policy; architecture replay identity]
Three concerns must be distinguished and not collapsed:

A — Temporal replay safety (architectural invariant): a replayed parent must not start a duplicate child (§6). A determinism property of the engine, not a user-facing retry.
B — Node retry policy (Product-decided): retry_policy on the Sub-workflow node behaves as on any other node. Product has accepted that an intentional retry may re-run a child that already performed work — repeated side effects are accepted.
C — Business idempotency (designer's responsibility, Product-decided): making a child safe to invoke more than once is the workflow designer's responsibility, not a platform guarantee.

continue_on_failure is a separate concern again: it controls whether downstream parent nodes run after a failure; it does not retry anything.

Replay safety (A) is not business idempotency (C). Replay-idempotency prevents a replayed parent from creating a duplicate child; it does not prevent duplicate business side effects when a retry (B) intentionally re-runs a child that already performed side effects. Deterministic child IDs address A, not C — they must not be presented as a solution to business idempotency.

Status. The earlier tension between SDP AC-4a ("retry_policy must work on Sub-workflow nodes") and DEC-004 / AAP-91316 is resolved at the Product level: retry behaves as standard node retry, repeated side effects are accepted, and idempotency is the designer's responsibility. [PRODUCT] What remains open is purely architectural — the replay-safe child-start identity (A), and how the engine distinguishes a replay from an intentional retry attempt in execution identity/history — tracked under AAP-91316's architecture portion. [OPEN — architecture]

ANSTRAT-1779 (retry-from-failure / stalled-workflow detection) is a retry/resilience-related dependency; this document does not assert that 1779 "owns" sub-workflow retry absent explicit documentation.
8. Versioning & Dependency Safety
8.1 Always-latest resolution [PRODUCT]
Each invocation resolves the child's current published version; a workflow has at most one published version at a time, and publishing a new child version is immediately picked up by every referencing parent. Resolution and dependency checks operate on published workflows only — drafts are not invocation targets and draft references do not block deletion in v1. [PRODUCT]
8.2 Dependency must be queryable [PRODUCT]
Every composition edge (parent references child) must be queryable as a workflow dependency, supporting a Used-By view (which workflows reference this one), a publish warning (when publishing a workflow referenced by sub-workflow nodes), and a deletion guard (deletion blocked while actively referenced).
8.3 Persistence mechanism & timing [OPEN — architecture]
The published-only scope is decided (§8.1). What remains open is whether dependency data is derived from workflow definitions or materialized in a dedicated index, and the exact write timing within the published lifecycle (DEC-002 / DEC-008). That choice sets how strict and how timely the deletion guard and warnings are.

graph LR
    EDIT["Author publishes a Sub-workflow node"] --> Q["Composition edge becomes queryable<br/>(derived vs materialized — OPEN)"]
    Q --> USEDBY["Used-By API + UI"]
    Q --> WARN["Publish warning"]
    Q --> GUARD["Deletion guard"]
8.4 Version drift
Because Reference mode always resolves the latest published child (§8.1), design-time validation alone cannot guarantee compatibility: Parent A validated against Child B v3 may later execute against a B v4 that added a required input, without A ever being reopened. Drift handling has two layers:

Design time — early compatibility feedback. When an author edits the parent, the builder surfaces the child's current contract and flags mappings that no longer fit; publish warnings flag parents affected by a child change. This catches drift early but cannot catch a child republished after the parent was last edited.
Runtime — Product behavior vs architecture mechanism. A latest-published child change can make an existing parent incompatible; Product treats this as workflow-design compatibility. [PRODUCT] If execution then fails because of the change, the failure must be clear and actionable (an error naming the specific mismatch), and the UI may notify users that a referenced workflow changed. [PRODUCT] Product has not mandated pre-invocation schema validation. A preflight check that validates mapped inputs against the resolved child contract before the child starts is a useful proposed safeguard, not a Product requirement, and whether/where it runs is [OPEN — architecture].
9. Authorization & Lifecycle Safety
9.1 Sub-workflow eligibility is trigger-based [PRODUCT]
A workflow is invocable as a sub-workflow because it exposes a dedicated Subworkflow Trigger (§2.2) — not because of a separate callable/runnable boolean flag. The earlier two-boolean model (allow_as_subworkflow, runnable_independently) is dropped. Reciprocally, a sub-workflow may be entered only through its Subworkflow Trigger, and a Subworkflow Trigger may be invoked only by a Sub-workflow node (see the admission-rule flag in §2.2); generic triggers do not confer eligibility. [PRODUCT]

Can this workflow be invoked as a sub-workflow?  → yes iff it has a Subworkflow Trigger
Can this workflow be started independently?       → governed by its other triggers (manual / webhook / EDA / scheduled)

A workflow with only a Subworkflow Trigger is invocation-only (reusable, no independent-start path); one with a Subworkflow Trigger and, say, a manual trigger is both. Exposing reusable units without exposing their internals remains the product rationale [MEETING-ALIGNED MA-6].
9.2 Representation [PRODUCT eligibility model; trigger representation OPEN]
Eligibility representation is trigger-based and decided (§9.1): presence of a Subworkflow Trigger. There is no separate callable/runnable capability-flag schema. What remains open is the Subworkflow Trigger's own persisted representation (node type, SDK registration, config model), tracked in §2.2 / §13.
9.3 Execute-permission [PRODUCT; enforcement OPEN]
Independently of eligibility/admission, the invoking actor must hold execute-permission on the child before child execution starts. [PRODUCT] The platform already provides an RBAC/authorization substrate [CODE]; the concrete RBAC/Rego policy contract and enforcement seam for sub-workflow invocation are being resolved by the AuthZ spike (AAP-91260). [OPEN]
9.4 Child-metadata disclosure — proposed security invariant [PROPOSED]
Distinct from the UX (§11): the proposed architecture requires — as a security invariant the Pod is asked to ratify — that child metadata used for input/output discovery is exposed only through the applicable authorization boundary. An author who lacks the relevant permission on the child must not obtain the child's internal contract through the composition surface. How it is surfaced to the user is a UX choice (§11), not part of the invariant.
10. Cycle & Depth Protection [PROPOSED; depth number OPEN]
The proposed architecture uses two complementary protection layers:

graph TB
    D["Design-time: save/publish DFS across references"] -->|valid at save| OK["publish allowed"]
    OK -.->|"child later republished → may introduce a cycle"| R["Runtime: call-chain / invocation-depth guard (bound OPEN)"]
    R -->|bound exceeded| STOP["invocation halted"]

The layers are complementary because a graph acyclic at save time can become cyclic after a referenced child is later republished — so a runtime guard is the backstop the static check cannot provide. The proposed architecture includes runtime recursion/cycle protection; the maximum allowed nesting depth is an open architecture/performance decision (DEC-006 / AAP-92254) and no specific number is fixed here.
11. Frontend / Builder UX [PRODUCT + PROPOSED]
Palette entry with a reference-configuration form; a variable picker to map parent values into the child (rendered from the child's current input schema); a nested output picker over the child's result shape (expression syntax itself is open, DEC-011); and inline expansion of child results in the execution view.

When an author references a child they lack permission on, the security invariant is §9.4 (metadata only through the authorization boundary). How that is represented is a [PROPOSED] UX choice — an access indicator, a disabled state, or equivalent — and is not itself part of the architecture unless Product decides a specific treatment.
12. Migration Seam to ANSTRAT-2422 [PROPOSED]
The single most important 2422-aware goal: keep node registration/identity thin and replaceable over a stable execution capability.

graph LR
    subgraph NOW["CURRENT"]
        N1["NodeType / current registration"] --> N2["thin Sub-workflow adapter"] --> CAP["STABLE Sub-workflow execution capability"]
    end
    subgraph FUT["FUTURE"]
        F1["2422 Registry / SDK"] --> F2["thin Sub-workflow adapter"] --> CAP2["SAME stable capability"]
    end

Stable capability owns (unchanged across the migration): latest-version resolution, authorization/admission, input mapping, input validation, child execution creation, lineage, Temporal child invocation, result/error handling.

Replaceable layer contains (swaps when 2422 lands): node registration, node identity representation, schema registration, palette metadata, SDK descriptor/manifest representation.

Designing to this seam is what lets 2347 ship on the current framework now and migrate to the SDK later without reworking the runtime core.
13. Open Architectural Decisions (prioritized)
These are classified by when they must close, not by importance. Classification is engineering judgment; it does not decide the questions themselves.
13-A. Blockers for implementation
Durable work on the runtime core and persisted contracts should not begin until these close.

Decision
Why it blocks
Owner / ticket
Depends on
Parent composition node durable identity
The executor, palette registration, and persisted node schema all key off it; every stored parent definition embeds it
AAP-91262
2422 registration direction (§16)
Subworkflow Trigger representation (persisted identity, SDK registration, config model)
It is the invocation boundary and the eligibility marker; child definitions and the resolver depend on how it is persisted
AAP-91315 / 2422
2422 trigger-node model (§16)
Authoritative child invocation schema persistence
Input mapping (§4) and runtime validation validate against it; freezing the mapping surface needs a stable schema home
AAP-91261 follow-on
Subworkflow Trigger representation (above)
Cross-project V1 scope (planning blocker)
Determines whether Phase 3/4 must include cross-project AuthZ, Used-By RBAC filtering, deletion guards, and metadata visibility across projects — materially changes the estimate
DEC-007
Engineering estimate for both options

13-B. Required before durable API / contract freeze
Prototyping can proceed; these must close before any persisted contract or author-visible expression is frozen.

Decision
Why it must close before freeze
Owner / ticket
Output envelope & field names
Any author-visible ${child…} accessor commits a field name (§5); needs the logical-reference indirection or a chosen envelope
2422 alignment
Child-start replay-safe identity (Temporal)
Persisted in execution history/lineage; distinguishes replay from intentional retry (§6/§7)
AAP-91316 (arch)
Dependency index: derived vs materialized
Sets the stored dependency representation and the strictness/timeliness of the deletion guard (§8.3)
DEC-002 / DEC-008
Lineage link shape + child actor identity
Persisted audit/lineage; must fit the 2422 execution/telemetry model (§16)
DEC-001 / AAP-91314

13-C. Resolvable during implementation / hardening
Mechanism choices that do not break persisted contracts and can land during build/hardening.

Decision
Note
Owner / ticket
Pre-invocation contract validation (preflight)
Proposed safeguard, not a Product requirement (§8.4)
—
Execute-permission RBAC/Rego enforcement seam
Product requirement exists; enforcement contract is a spike — security-gating for GA
AAP-91260
Cancellation-propagation behavior
Can land in hardening once the child-execution link exists
DEC-001
Max nesting depth / timeout values
Tunable/perf; a guard must exist, the number can be set later
DEC-006 / AAP-92254
Telemetry / audit event names
Naming resolvable later but gated by security review
AAP-91238
"Subworkflow Trigger invoked only by a Sub-workflow node" — V1 admission rule vs permanent invariant
Ratify scope of the restriction (§2.2 flag)
—

13-D. Future / non-V1
Decision
Note
Multiple Subworkflow Trigger support
Not required for v1; representation should not preclude it
Cross-project execution (if deferred)
Product intent is cross-project; may ship after V1 if scope defers it (13-A)


Once an OPEN decision closes, it is recorded in backend/decision-records.md and the Decision Status table and this section are updated.
14. Implementation Sequencing
How the architecture becomes executable work. Phases are derived from the decisions and tickets in this document; ticket ownership and status are per Jira, not asserted here. Arrows are hard dependencies.

graph LR
    P1["Phase 1<br/>Contract / representation decisions"] --> P2["Phase 2<br/>Runtime composition core"]
    P1 --> P3["Phase 3<br/>Dependency / lifecycle capability"]
    P2 --> P4["Phase 4<br/>Hardening / security / cross-project"]
    P3 --> P4
    P2 --> P5["Phase 5<br/>2422 alignment / migration"]
    P4 --> P5

Phase 1 — Contract/representation decisions. Close the 13-A blockers: parent node identity (AAP-91262), Subworkflow Trigger representation (AAP-91315), child schema persistence (AAP-91261 follow-on), and the cross-project V1 scope decision (DEC-007). Output: contracts stable enough to build against. Gated by 2422 inputs (§16).

Phase 2 — Runtime composition core. Build the §6 flow: resolve child → latest published (§8.1) → enter via Subworkflow Trigger → admission (eligibility + execute-permission, §9) → mapped-input validation (§4) → linked Temporal child with a replay-safe start (§6) → result/error (§5) → continue. Carries AAP-91316 (replay identity) and consumes the AAP-91260 execute-permission seam. Depends on Phase 1 (node/trigger identity + schema).

Phase 3 — Dependency/lifecycle capability. Used-By, publish warning, deletion guard, and the dependency index (DEC-002/DEC-008, AAP-91271), published-only (§8). Depends on Phase 1 (node identity to record edges); otherwise parallel to Phase 2.

Phase 4 — Hardening/security/cross-project. Cycle/depth guard (DEC-006/AAP-92254), cancellation (DEC-001), the metadata-disclosure invariant (§9.4), telemetry names (AAP-91238, security-gated), the optional version-drift preflight (§8.4), and cross-project execution if it is in V1 scope (13-A). Depends on Phases 2 and 3.

Phase 5 — 2422 alignment/migration. Swap the thin registration/identity adapter onto the 2422 registry/SDK (§12), align the output envelope with StandardOutputWrapper, and attach category/execution_type tags. The migration seam (§12) is designed so this does not require reworking the Phase 2 runtime core. Depends on a stable capability from Phases 2–4; gated by 2422 readiness.
15. Related Initiatives
Key
What
Relevance
ANSTRAT-2291
Post-GA Adoption & Market Competitiveness (parent outcome)
Sub-workflows are a reuse/competitiveness capability.
ANSTRAT-2422
Automation Orchestrator Node SDK
Emerging taxonomy/registry/envelope direction; WIP; informed by this work. Not an authoritative 2347 contract.
ANSTRAT-1934
Kafka Subscribe/Publish nodes
Parallel extension of the trigger surface (Kafka Subscribe is a trigger).
ANSTRAT-1803
Execution Plane (On-Cluster OpenShift)
Runs the child's container nodes.
ANSTRAT-1779
Retry from Failure & Stalled-Workflow Detection
Retry/resilience-related dependency (not documented owner of sub-workflow retry).
ANSTRAT-1900 / 1740
RBAC & Audit (delivered)
Shipped substrates for execute-permission and audit/telemetry.

16. Examples
Parent composition node and child ingress are different definitions. Node identities below are placeholders/proposals, not final.

# Parent Workflow A  —  composition node

- id: process_payment
  type: sub_workflow        # [PLACEHOLDER — FINAL NODE IDENTITY TBD]
  parameters:
    workflow_id: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d"   # child definition (resolved to latest published)
    input_mapping:          # node-local mapping (AAP-91261); reuses ${...}
      order_id: "${trigger.order_id}"
      amount: "${validate_order.total_amount}"
  # settings: continue_on_failure, retry_policy.
  # retry_policy = standard node retry (Product-decided, §7); business idempotency is the
  # designer's responsibility; only the Temporal child-start replay identity is OPEN.

# Child Workflow B  —  invocation boundary

trigger:
  type: subworkflow_trigger   # Subworkflow Trigger — role Product-decided; persisted representation OPEN (§2.2)
  input_schema:               # business invocation contract (§4.1)
    order_id:
      type: string
      required: true
    amount:
      type: number
      required: true
# internal execution context (parent_execution_id, depth, actor, resolved version,
# correlation id) is orchestration metadata — NOT part of this public input schema (§4.2)

The parent composition node is not the child ingress trigger. They remain distinct roles unless architecture explicitly decides to share one persisted identity.
17. Questions requiring ANSTRAT-2422 / architecture alignment
Product intent is settled for each item; each still needs an architecture / 2422 decision before implementation. Format: Product has decided → architecture still needs → why 2422 input is needed.

Topic
Product has decided
Architecture still needs
Why 2422 input is needed
Parent node identity / registration
a parent composition node exists and invokes the child
its persisted NodeType / registration
2422 owns node registration & identity representation
Subworkflow Trigger SDK representation
the trigger exists and is the invocation boundary
its persisted identity + SDK descriptor
2422 defines trigger-category nodes & registration
Trigger input-schema representation
the trigger owns the business invocation contract
where / how the schema is persisted
2422 schema / descriptor model may own this
Output envelope
the child result must reach downstream parent nodes
the durable envelope + field names
2422 proposes StandardOutputWrapper
execution_type / category placement
composition is in-process; child containers run as usual
the node's category / execution_type tags
2422 taxonomy defines these
Child execution / lineage model
synchronous linked child execution + audit correlation
the persisted lineage link shape + actor identity
must fit the 2422 execution / telemetry model
Retry-attempt identity vs Temporal replay identity
retry = standard node retry; idempotency is the designer's
the replay-safe child-start identity
interacts with the 2422 execution / child-start model
Multiple Subworkflow Trigger semantics
not required for v1
whether / how multiple ingresses are supported later
2422 trigger model governs multiplicity
Migration seam
ship on current framework, migrate to the SDK later
the thin registration / identity adapter boundary
seam must map onto the 2422 registry / SDK




Target-state architecture for the ANSTRAT-2347 Sub-workflow Node. Items marked OPEN are not final and will be updated as the remaining Product/architecture decisions close. Provenance (PoC, repo verification, meeting history, full registers) lives in the companion documents.



