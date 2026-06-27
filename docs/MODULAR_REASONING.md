# Modular reasoning layer — design doc

> Status: design / ready to implement. Target repo: `lewiswharf1/hack-the-law` (Scaffold).
> Author: Fernando (+ Claude). Scope: extend the existing graph, do **not** rebuild it.
> All changes below are **additive** and back-compatible with the current schema and API.

## 0. What this adds, in one paragraph

Scaffold today is a single-strategy reasoning tool: an LLM (`claude.py`, `claude-haiku-4-5`)
builds the graph and maps evidence, and `readiness.py` collapses statuses with a hard-wired
**AND** rule. That has three problems we are fixing: (1) it cannot tell a *subsumption* norm
from a *ponderation* (balancing) norm; (2) it treats every requirement as cumulative, so an
**alternative** requirement (Art. 82 damage: *material* **or** *non-material*) is wrongly
reported as a gap; (3) all inference is done by the LLM, which is exactly where hallucination
enters. This doc introduces a **modular, neuro-symbolic reasoning layer**: the LLM (or a local
model) does *perception* — extraction, classification, evidence matching — and a **deterministic
logic engine** does *inference* — entailment over AND/OR/k-of-n, gap detection, and
contradiction detection. The engine is pure Python, zero-dependency, and unit-tested (Appendix A
and B, 7/7 passing). Engine selection is configurable per task, so the confidential bundle can be
matched by a **local model** while the public article text is built by Claude.

This is the same thesis the command-centre `AGENTS.md` calls load-bearing IP: *the verification /
inference step is a first-class component, never an LLM afterthought.*

---

## 1. The core idea

```
                 PERCEPTION  (LLM / local model — fuzzy, may hallucinate)
   ┌──────────────────────────────────────────────────────────────────┐
   │  classify norm (subsumption | ponderation, AND | OR | k-of-n)     │
   │  build graph from article text + case law                        │
   │  match evidence excerpts → leaves, classify Supportive/Adverse    │
   └──────────────────────────────────────────────────────────────────┘
                                   │  per-leaf facts only
                                   ▼
                 INFERENCE  (deterministic engine — code, not a model)
   ┌──────────────────────────────────────────────────────────────────┐
   │  evaluate requirement tree (AND / OR / k-of-n)  → node status     │
   │  derive gaps  (only where logically required — no false gaps)     │
   │  derive contradictions (P and ¬P, refuted necessary leaf, …)      │
   └──────────────────────────────────────────────────────────────────┘
```

The LLM never decides whether the claim *succeeds*. It only proposes structure and assigns
per-leaf evidence. The legally load-bearing step — combining those leaves — is computed by
`engines/logic.py`, which is deterministic and testable. That is the anti-hallucination guarantee.

---

## 2. Feature → file map

| Wishlist item | What it becomes | Files touched |
|---|---|---|
| **A. Classify subsumption vs ponderation** | `node_kind` on elements/propositions, set by the graph-builder LLM; ponderation nodes carry a balancing test | `claude.py` (prompt), `graph_builder.py`, `models.py`, `schema.sql`, new `balancing_prongs` |
| **B. Alternative vs cumulative requirements** | `connective` (AND / OR / KOFN) on each group; the **deterministic engine** evaluates it, replacing the AND-only collapse | `engines/logic.py` (new), `readiness.py` (rewired), `models.py`, `schema.sql` |
| **C. Engine routing** | `engines/` package: a router picks an engine per task (classify / match / infer) from config | `engines/` (new), `config.py`, `doc_analyser.py`, `graph_builder.py` |
| **D. Contradiction detection** | symbolic (in the logic engine) + optional semantic (local/Claude) pass; new `contradictions` table + endpoint + UI flag | `engines/logic.py`, `engines/contradictions.py` (new), `routers/`, `schemas.py`, frontend |

Nothing above deletes a column or breaks an endpoint. Existing cases keep working — they simply
default to `node_kind='subsumption'`, `connective='AND'`, which reproduces today's behaviour.

---

## 3. Data model changes (additive migration)

Run as `backend/migration_modular.sql` after the current `schema.sql`. Column styles match the
existing file.

```sql
-- A + B: node kind and logical connective on each group node
ALTER TABLE elements
  ADD COLUMN node_kind  TEXT    NOT NULL DEFAULT 'subsumption', -- subsumption | ponderation
  ADD COLUMN connective TEXT    NOT NULL DEFAULT 'AND',         -- AND | OR | KOFN
  ADD COLUMN threshold  INTEGER NOT NULL DEFAULT 1;            -- k, only used when KOFN

ALTER TABLE propositions
  ADD COLUMN node_kind   TEXT    NOT NULL DEFAULT 'subsumption',
  ADD COLUMN connective  TEXT    NOT NULL DEFAULT 'AND',
  ADD COLUMN threshold   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN required    BOOLEAN NOT NULL DEFAULT TRUE,         -- false = optional alternative
  ADD COLUMN parent_id   UUID REFERENCES propositions(id) ON DELETE CASCADE, -- optional nesting
  ADD COLUMN jurisdiction TEXT,                                -- ponderation only
  ADD COLUMN principles  JSONB;                                -- ponderation only: [{side,label,articles}]

-- A: balancing prongs for ponderation nodes (the test sequence from the mockup)
CREATE TABLE balancing_prongs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposition_id UUID NOT NULL REFERENCES propositions(id) ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL DEFAULT 0,
  label          TEXT NOT NULL,                 -- 'Necessity', 'Suitability', …
  hint           TEXT NOT NULL DEFAULT '',
  basis          TEXT NOT NULL DEFAULT 'arg',   -- ev | arg | both
  argument_text  TEXT NOT NULL DEFAULT '',      -- natural-language argument (no document)
  verdict        TEXT NOT NULL DEFAULT 'open',  -- met | contested | unmet | open
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_prongs_prop ON balancing_prongs(proposition_id);

-- A: evidence may attach to a prong instead of (or as well as) a proposition leaf
ALTER TABLE evidence ADD COLUMN prong_id UUID REFERENCES balancing_prongs(id) ON DELETE CASCADE;
ALTER TABLE evidence ALTER COLUMN proposition_id DROP NOT NULL; -- prong-only / argument items

-- D: contradictions — links one or two evidence items to a proposition/assumption
CREATE TABLE contradictions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id        UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  proposition_id UUID REFERENCES propositions(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL DEFAULT 'evidential', -- evidential | structural | semantic
  detail         TEXT NOT NULL DEFAULT '',
  severity       TEXT NOT NULL DEFAULT 'High',       -- Critical | High | Medium
  evidence_ids   JSONB,                              -- the conflicting evidence ids
  source         TEXT NOT NULL DEFAULT 'engine',     -- engine | ai | human
  status         TEXT NOT NULL DEFAULT 'open',       -- open | dismissed | resolved
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_contradictions_case ON contradictions(case_id);
```

`models.py` mirrors each of these (new `Column(...)` lines on `Element`/`Proposition`/`Evidence`,
two new classes `BalancingProng` and `Contradiction`). Because `evidence.proposition_id` is now
nullable, update `refresh_proposition_status` to skip `None` (it already iterates a set of ids).

**Nesting note.** The element-level `connective` already solves the stated problem (a Damage
element with `connective='OR'` over material/non-material). The optional `parent_id` self-FK lets
a proposition own sub-propositions later, e.g. `E1 AND (E2-P1 OR E2-P2)` at arbitrary depth — the
logic engine in §4 already recurses over nested groups, so this is a data-only extension with no
engine change. Treat deep nesting as a stretch; ship the two-level version first.

---

## 4. The deterministic logic engine (`engines/logic.py`)

This is the kernel. It is pure functions over a requirement tree; no DB, no network, no LLM.
**Full source is Appendix A; tests are Appendix B (7/7 passing).** Semantics:

**Leaf truth (4-valued).** A subsumption leaf reads its evidence; a ponderation leaf passes a
precomputed verdict (§6).

| supportive | adverse | leaf truth |
|---|---|---|
| > 0 | 0 | `Established` |
| > 0 | > 0 | `Contested` |
| 0 | > 0 | `Refuted` |
| 0 | 0 | `Gap` |

`Refuted` is new and important: it is the difference between "we don't know yet" (Gap) and "the
bundle actively disproves this" (Refuted). The UI should show it as a fourth badge (red); if you
want zero UI change on day one, map `Refuted → Contested` at the serializer and add the badge
later.

**Group combination.**

| Connective | Established when | Gap when | Refuted when |
|---|---|---|---|
| `AND` (cumulative) | all children Established | any necessary child Gap (none Refuted) | any child Refuted |
| `OR` (alternative) | any child Established | all children Gap | all children Refuted |
| `KOFN(k)` | ≥ k children Established | reachable but < k established | fewer than k children can still be established |

**Gap suppression — the fix for your damage example.** Under an `OR` group that is already
`Established`, the engine **drops the gaps on the unfilled siblings**: claiming non-material
damage with no material-damage evidence is *not* a gap. Under an unsatisfied `OR`, the alternative
leaves are emitted at `Medium` severity with the action "establish ANY ONE of the alternatives."
Under `AND`, every Gap child is a real gap. (Verified by `test_or_not_flagged_as_gap...` and
`test_or_unsatisfied_flags_alternatives_as_medium`.)

**Contradiction derivation (symbolic).** The same pass emits contradictions:

- *Evidential* — a leaf with both supportive and adverse evidence → contradiction linking the two
  evidence ids (this is your "witness statement against the assumption" case once that statement
  is mapped as Adverse to the leaf it undercuts).
- *Structural* — a `Refuted` leaf that sits under an `AND` the claim asserts must hold → Critical
  contradiction ("a necessary element is disproven by the bundle").
- *Mutual exclusion* — a group flagged `mutually_exclusive` with two children both `Established`.

(Verified by `test_planted_contradiction...`, `test_refuted_necessary_leaf...`,
`test_mutually_exclusive...`.)

### How `readiness.py` is rewired

Replace the body of `refresh_element_status` (and the cascade) with a single recompute that builds
the tree from the DB and calls the engine. Sketch (new `engines/apply.py`):

```python
def recompute_case(db, case_id):
    elements = db.query(models.Element).filter_by(case_id=case_id).order_by(models.Element.position).all()
    groups = []
    for el in elements:
        leaves = []
        for p in db.query(models.Proposition).filter_by(element_id=el.id):
            if p.node_kind == "ponderation":
                leaves.append(Leaf(str(p.id), kind="ponderation",
                                   verdict=ponderation_verdict(db, p.id)))   # §6
            else:
                ev = db.query(models.Evidence).filter_by(proposition_id=p.id).all()
                leaves.append(Leaf(str(p.id),
                    supportive=[str(e.id) for e in ev if e.classification == "Supportive"],
                    adverse=[str(e.id)    for e in ev if e.classification == "Adverse"]))
        groups.append(Group(el.label, el.connective, el.threshold, leaves))
    root = Group("CLAIM", "AND", children=groups)          # elements are cumulative
    result = evaluate(root)

    # write element + proposition statuses, then upsert engine-owned gaps/contradictions
    persist_statuses(db, elements, result)
    sync_issues(db, case_id, result.gaps, result.contradictions, source="engine")
    case = db.query(models.Case).filter_by(id=case_id).first()
    case.readiness = readiness_from(result)                  # Established 1.0 / Contested .5 / else 0
    db.commit()
```

Call `recompute_case` wherever the code currently calls `refresh_proposition_status` /
`calculate_readiness` — i.e. at the end of `doc_analyser.run_document_analysis`, and in the
`graph.py` proposition/element/evidence mutations. The naïve `refresh_element_status` becomes a
thin wrapper that calls `recompute_case`, so existing call sites keep compiling.

> **Keep AI and engine gaps separate.** `doc_analyser` currently writes `gaps` with `source='ai'`.
> Let the LLM keep suggesting *substantive* gaps ("you need an expert report on causation"), but
> let the **engine** own *structural* gaps and all contradictions (`source='engine'`). On
> recompute, replace only `source='engine'` rows so you never fight the model's suggestions.

---

## 5. Engine routing layer (`engines/`) — interface now, Claude default

```
backend/app/engines/
  __init__.py
  base.py            # Protocols: NormClassifier, EvidenceMatcher  (+ logic is deterministic)
  logic.py           # Appendix A — deterministic, the only non-pluggable engine
  apply.py           # recompute_case() — builds the tree from DB, calls logic, persists
  claude_engine.py   # wraps the current claude.py calls (default)
  local_engine.py    # Ollama / OpenAI-compatible client (stub, same interface)
  contradictions.py  # optional semantic pass (§7)
  router.py          # picks an engine per task from config
```

```python
# base.py
from typing import Protocol
class NormClassifier(Protocol):
    def classify(self, article_text: str) -> dict: ...        # -> {node_kind, connective, threshold, ...}
class EvidenceMatcher(Protocol):
    def match(self, doc_text: str, propositions: list[dict]) -> dict: ...  # -> {doc_type, evidence_mappings, ...}

# router.py
from app.config import settings
from app.engines import claude_engine, local_engine
def evidence_matcher() -> EvidenceMatcher:
    return local_engine if settings.ENGINE_EVIDENCE == "local" else claude_engine
def norm_classifier() -> NormClassifier:
    return local_engine if settings.ENGINE_CLASSIFY == "local" else claude_engine
```

`config.py` gains three settings (defaults keep today's behaviour, demo runs without Ollama):

```python
ENGINE_CLASSIFY: str = "claude"   # claude | local
ENGINE_EVIDENCE: str = "claude"   # claude | local   ← flip to 'local' for the privacy story
ENGINE_LOGIC:    str = "deterministic"   # always deterministic; reserved for a future z3 backend
OLLAMA_BASE_URL: str = "http://localhost:11434/v1"
OLLAMA_MODEL:    str = "llama3.1:8b"
```

`local_engine.py` is a thin client against the Ollama OpenAI-compatible endpoint with the **same
two methods** and the **same JSON contract** as `claude_engine.py`, so `doc_analyser` and
`graph_builder` import the router, not a concrete module:

```python
# doc_analyser.py — one-line change
from app.engines.router import evidence_matcher
result = evidence_matcher().match(document.extracted_text, props_for_prompt)
```

Privacy posture (ties to the Habeas Data / anonymisation thesis): with `ENGINE_EVIDENCE=local`,
the **bundle text never leaves the machine** — only the public article text reaches Claude during
graph build. Document that toggle in the README; it is a strong judge talking point. Build the seam
now; ship Claude as default so the demo is robust even if the local model isn't running.

---

## 6. Norm classification + connective extraction (`claude.py`)

Extend `GRAPH_BUILD_PROMPT` so each element returns its kind and connective, and ponderation nodes
return their balancing structure. New output schema (Appendix D has the full prompt):

```json
{
  "elements": [
    {
      "label": "E2", "title": "Damage suffered by the data subject",
      "source": "Art. 82(1) GDPR",
      "node_kind": "subsumption",
      "connective": "OR",                         // ← material OR non-material
      "propositions": [
        {"label": "E2-P1", "title": "Material damage (financial loss)"},
        {"label": "E2-P2", "title": "Non-material damage (distress / loss of control)"}
      ]
    },
    {
      "label": "E1", "title": "Infringement of the GDPR by the controller",
      "node_kind": "subsumption", "connective": "AND",
      "propositions": [
        {"label": "E1-P1", "title": "The defendant is a controller (Art. 4(7))"},
        {
          "label": "E1-P2", "title": "Processing was unlawful — Art. 6(1)(f) balancing fails",
          "node_kind": "ponderation",
          "jurisdiction": "eu",
          "principles": [
            {"side": "controller",   "label": "Freedom to conduct a business; fraud-prevention interest", "articles": "Art. 6(1)(f) GDPR; Art. 16 Charter"},
            {"side": "data_subject", "label": "Protection of personal data; private life", "articles": "Art. 8 & 7 Charter"}
          ],
          "prongs": [
            {"label": "Legitimate aim",  "hint": "Real, present, lawful interest?"},
            {"label": "Suitability",      "hint": "Processing apt to achieve it?"},
            {"label": "Necessity",        "hint": "Least restrictive means?"},
            {"label": "Proportionality stricto sensu", "hint": "Controller's interest vs data subject's rights"}
          ]
        }
      ]
    }
  ]
}
```

Prompt guidance to add: *classify each element as subsumption (a Tatbestand of factual conditions)
or ponderation (a balancing of competing principles/rights); for subsumption, set `connective` to
AND when all conditions are cumulative, OR when they are alternative, KOFN(threshold) when k-of-n
suffice. For Art. 82 GDPR specifically: damage is OR over material/non-material; lawfulness of
processing is a ponderation node when it turns on Art. 6(1)(f) legitimate interests.* The prong
set and jurisdiction labels come straight from the mockup in
`ponderation-node-mockup.html` (this folder) — reuse the four jurisdiction schemas there.

`graph_builder.py` saves the new fields and, for ponderation nodes, inserts the `balancing_prongs`
rows. `ponderation_verdict(db, proposition_id)` maps prong verdicts → the leaf's 4-valued truth
(this is the rule from the mockup, inverted because the proposition asserts *unlawfulness*):

```python
def ponderation_verdict(db, prop_id):
    v = [pr.verdict for pr in db.query(BalancingProng).filter_by(proposition_id=prop_id)]
    if "unmet" in v:                       return "Established"  # a prong fails → defence collapses → unlawful made out
    if "contested" in v or "open" in v:    return "Contested"   # turns on necessity / open balancing
    return "Refuted"                       # all prongs met → controller prevails → unlawfulness not made out
```

---

## 7. Contradiction detection (the two layers)

**Layer 1 — symbolic, already in `logic.py` (Appendix A).** Runs on every recompute, free,
deterministic: supportive+adverse on a leaf, refuted necessary leaf, mutual-exclusion. This alone
catches "a witness statement contradicts an established proposition" the moment that statement is
mapped as `Adverse` to the leaf it undercuts.

**Layer 2 — semantic, optional (`engines/contradictions.py`).** Some contradictions are not tied
to one proposition — a witness statement that cuts against an *assumption* the whole theory rests
on. A second pass gives the model the case's elements/propositions as the *theory of the case* plus
each document, and asks it to flag statements inconsistent with that theory even where they don't
map to a specific leaf. Output rows go to `contradictions` with `kind='semantic'`, `source='ai'`.
Run it through the router so it can be the **local** model (it reads the bundle). Prompt sketch:

```
THEORY OF THE CASE (assumptions that must hold):
{elements_and_propositions}
DOCUMENT:
{doc_text}
Return JSON: { "contradictions": [
  { "proposition_label": "E1-P1 | null", "statement": "...verbatim...",
    "with": "which assumption/evidence it contradicts",
    "severity": "Critical|High|Medium", "why": "..." } ] }
Only flag genuine inconsistencies with the theory, not mere weaknesses.
```

Keep Layer 2 behind a flag; Layer 1 is the reliable backbone you demo.

---

## 8. Pipeline wiring — before / after

**Graph build** (`graph_builder.run_graph_build`): fetch articles (unchanged) →
`norm_classifier()` builds graph **with `node_kind`/`connective`/prongs** → save elements,
propositions, `balancing_prongs` → `recompute_case` to set initial statuses.

**Document analysis** (`doc_analyser.run_document_analysis`): extract text (unchanged) →
`evidence_matcher().match(...)` (Claude default, local optional) → save evidence →
**`recompute_case`** (engine sets statuses, structural gaps, evidential/structural contradictions,
readiness) → optional `contradictions.semantic_scan(...)` for Layer 2.

The LLM's role shrinks to perception; the engine owns every status, gap, and contradiction that is
logically determined.

---

## 9. API + frontend contract changes

**`schemas.py`** — add to `ElementOut`/`PropositionOut`: `node_kind: str`, `connective: str`,
`threshold: int`; add `principles`, `jurisdiction`, and a `prongs: list[BalancingProngOut]` to
ponderation propositions; new `ContradictionOut`; new `GET /api/cases/{id}/contradictions` and
`GET/PUT /api/propositions/{id}/prongs`.

**`types/index.ts`** — mirror: `NodeKind = "subsumption" | "ponderation"`,
`Connective = "AND" | "OR" | "KOFN"`, extend `ElementStatus` with `"Refuted"`, add `Prong`,
`Contradiction`, the `principles`/`jurisdiction`/`prongs` fields.

**`ArgumentGraph.tsx`** — three visible changes, all driven by the mockup
`ponderation-node-mockup.html` in this folder (lift its markup/styles directly):

- render a ponderation proposition with the distinct purple ⚖ node and, on select, the guided
  balancing panel (jurisdiction switch + prongs + derived verdict) instead of the evidence list;
- show a connective badge on each element header — `all of` (AND) / `any of` (OR) / `k of n`;
- show a contradiction flag (red ⚠) on any leaf/element with an open contradiction, and suppress
  the gap chip on OR-satisfied alternatives (the engine already won't emit those gaps).

A new `ContradictionsPanel` tab mirrors `GapsPanel.tsx` (same card pattern, red accent).

---

## 10. Phased build plan (hackathon hours, with test gates)

| Phase | Build | Files | Done when |
|---|---|---|---|
| **1 · Engine kernel** | drop in `engines/logic.py` + tests | `engines/logic.py`, `tests/test_logic.py` | `pytest tests/test_logic.py` → 7/7 (Appendix B) |
| **2 · Migration + models** | additive SQL + ORM fields + 2 new models | `migration_modular.sql`, `models.py` | `psql < migration_modular.sql` clean; server boots |
| **3 · Recompute wiring** | `engines/apply.recompute_case`; rewire `readiness.py` + `graph.py` call sites | `engines/apply.py`, `readiness.py`, `routers/graph.py` | seed an OR-damage case; recompute → no false gap; readiness correct |
| **4 · Engine router** | `base/router/claude_engine/local_engine`; config; one-line swaps in the two services | `engines/*`, `config.py`, `doc_analyser.py`, `graph_builder.py` | `ENGINE_EVIDENCE=claude` works end-to-end; `local` stub callable |
| **5 · Classification + connective** | extend `GRAPH_BUILD_PROMPT`; persist `node_kind`/`connective`/prongs | `claude.py`, `graph_builder.py` | build a fresh Art. 82 case → Damage element comes back `connective='OR'` |
| **6 · Contradictions** | symbolic already free; add `contradictions` table sync + endpoint; optional Layer 2 | `engines/contradictions.py`, `routers/contradictions.py`, `schemas.py` | upload a planted adverse witness doc → contradiction row appears |
| **7 · Frontend** | ponderation node (from mockup), connective badge, contradiction flag, panel | `types/index.ts`, `ArgumentGraph.tsx`, `ContradictionsPanel.tsx` | clickable end-to-end against the live API |

Phases 1–3 are the demonstrable core (the no-false-gap fix); 4–7 layer on routing, classification,
contradictions, and UI. If time runs short, ship 1–3 + the symbolic contradictions from Phase 6.

---

## 11. Demo script (Art. 82 GDPR)

1. Build the graph: Damage element comes back as **`any of` (OR)** over material / non-material.
2. Upload a bundle that proves **non-material** damage (distress) but says nothing about material
   loss. The old tool flags a *gap* on material damage and drags readiness down. **Scaffold now
   shows no gap on material damage** — the OR is satisfied — and explains "any one of these
   suffices." (This is the headline correctness moment; it is `test_or_not_flagged_as_gap...`.)
3. Upload a witness statement that contradicts the established "controller" leaf. The deterministic
   engine raises a **contradiction** linking the register exhibit and the witness statement —
   *before* any human reads the bundle. (`test_planted_contradiction...`.)
4. Open the lawfulness node: it is a **ponderation node**, not a gap — it walks the Art. 6(1)(f)
   balancing, and the verdict is derived from the prongs, with the necessity prong contested.
5. Judge framing: *"The model proposes and matches; a deterministic engine decides. Every status,
   gap, and contradiction on screen is computed in code we can unit-test — that is how we keep a
   17–33% legal-AI hallucination rate out of the load-bearing reasoning."*

---

## 12. Scope guards

- **Additive only.** Every new column has a default that reproduces current behaviour; do not
  rename or drop anything. A pre-modular case must still render.
- **The engine owns inference; the model owns perception.** Resist putting "is the claim made out"
  back into a prompt — that re-imports the hallucination you removed.
- **Refuted is optional in the UI.** If a 4th badge is too much for the timebox, map
  `Refuted→Contested` at the serializer; keep it 4-valued internally so contradictions still fire.
- **Local model is a toggle, not a dependency.** Default Claude so the demo never blocks on Ollama.
- **Citations stay suspect.** Per the command-centre `AGENTS.md`, any article/case citation the
  classifier emits is `[UNVERIFIED]` until checked — the engine's determinism does not vouch for
  the model's legal text, only for the combination logic.

---

## Appendix A — `engines/logic.py` (verified, drop-in)

```python
"""Deterministic reasoning engine for Scaffold (reference implementation).

Pure functions, no LLM, no DB. The LLM/local model only assigns per-leaf
evidence; THIS module computes entailment, gaps, and contradictions in code,
so the load-bearing legal inference is hallucination-free and unit-testable.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal, Optional

ESTABLISHED, CONTESTED, REFUTED, GAP = "Established", "Contested", "Refuted", "Gap"
Connective = Literal["AND", "OR", "KOFN"]


@dataclass
class Leaf:
    pid: str
    supportive: list[str] = field(default_factory=list)   # evidence ids
    adverse: list[str] = field(default_factory=list)       # evidence ids
    verdict: Optional[str] = None      # ponderation nodes pass a precomputed verdict
    kind: str = "subsumption"          # or "ponderation"

    def truth(self) -> str:
        if self.kind == "ponderation" and self.verdict:
            return self.verdict
        s, a = len(self.supportive), len(self.adverse)
        if s and not a:  return ESTABLISHED
        if s and a:      return CONTESTED
        if a and not s:  return REFUTED
        return GAP


@dataclass
class Group:
    label: str
    connective: Connective = "AND"
    threshold: int = 1                 # only for KOFN
    children: list = field(default_factory=list)   # Leaf | Group
    mutually_exclusive: bool = False               # children can't both be Established


@dataclass
class Issue:
    kind: str          # "gap" | "contradiction"
    target: str        # proposition/group label or id
    detail: str
    severity: str = "High"
    refs: list[str] = field(default_factory=list)  # evidence ids involved


@dataclass
class Result:
    status: str
    gaps: list[Issue] = field(default_factory=list)
    contradictions: list[Issue] = field(default_factory=list)


def _leaf_contradictions(leaf: Leaf) -> list[Issue]:
    out = []
    if leaf.supportive and leaf.adverse:
        out.append(Issue("contradiction", leaf.pid,
                         "Supportive and adverse evidence on the same proposition.",
                         "High", leaf.supportive + leaf.adverse))
    return out


def evaluate(group: Group) -> Result:
    child_status, gaps, contradictions = [], [], []

    for ch in group.children:
        if isinstance(ch, Leaf):
            st = ch.truth()
            contradictions += _leaf_contradictions(ch)
            if st == GAP:
                gaps.append(Issue("gap", ch.pid, "No evidence mapped.", "High", []))
            elif st == REFUTED:
                contradictions.append(Issue("contradiction", ch.pid,
                    "Proposition is contradicted by the bundle (adverse only).",
                    "Critical", ch.adverse))
            child_status.append((ch.pid, st, ch))
        else:
            sub = evaluate(ch)
            gaps += sub.gaps
            contradictions += sub.contradictions
            child_status.append((ch.label, sub.status, ch))

    statuses = [s for _, s, _ in child_status]

    if group.connective == "AND":
        if   REFUTED in statuses:   status = REFUTED
        elif GAP in statuses:       status = GAP
        elif CONTESTED in statuses: status = CONTESTED
        else:                       status = ESTABLISHED
        live_gaps = gaps                       # every gap under AND is necessary

    elif group.connective == "OR":
        if   ESTABLISHED in statuses: status = ESTABLISHED
        elif CONTESTED in statuses:   status = CONTESTED
        elif GAP in statuses:         status = GAP
        else:                         status = REFUTED
        own_pids = {pid for pid, st, ch in child_status if isinstance(ch, Leaf)}
        if status == ESTABLISHED:              # satisfied OR → no gaps on unfilled siblings
            gaps = [g for g in gaps if g.target not in own_pids]
        else:                                  # otherwise: "any one of" at Medium severity
            for g in gaps:
                if g.target in own_pids:
                    g.severity = "Medium"
                    g.detail = "Establish ANY ONE of the alternatives in this element."
        live_gaps = gaps

    else:  # KOFN
        e = statuses.count(ESTABLISHED)
        r = statuses.count(REFUTED)
        n = len(statuses)
        if   e >= group.threshold:           status = ESTABLISHED
        elif (n - r) < group.threshold:      status = REFUTED
        elif CONTESTED in statuses:          status = CONTESTED
        else:                                status = GAP
        own_pids = {pid for pid, st, ch in child_status if isinstance(ch, Leaf)}
        if status == ESTABLISHED:
            gaps = [g for g in gaps if g.target not in own_pids]
        live_gaps = gaps

    if group.mutually_exclusive:
        est = [pid for pid, st, ch in child_status if st == ESTABLISHED]
        if len(est) > 1:
            contradictions.append(Issue("contradiction", group.label,
                f"Mutually exclusive propositions both Established: {', '.join(est)}.",
                "Critical", []))

    return Result(status, live_gaps, contradictions)
```

---

## Appendix B — `tests/test_logic.py` (7/7 passing)

```python
from app.engines.logic import Leaf, Group, evaluate, ESTABLISHED, CONTESTED, REFUTED, GAP

def names(issues): return sorted(i.target for i in issues)

def build_case(material_ev=None, nonmaterial_supportive=("ex_nm",), controller_adverse=()):
    e1 = Group("E1 Infringement", "AND", children=[
        Leaf("E1-P1", supportive=["ex3"], adverse=list(controller_adverse)),
        Leaf("E1-P2", kind="ponderation", verdict=CONTESTED)])
    e2 = Group("E2 Damage", "OR", children=[
        Leaf("E2-P1-material", supportive=list(material_ev or [])),
        Leaf("E2-P2-nonmaterial", supportive=list(nonmaterial_supportive))])
    e3 = Group("E3 Causation", "AND", children=[Leaf("E3-P1")])
    return Group("CLAIM", "AND", children=[e1, e2, e3])

def test_or_not_flagged_as_gap_when_sibling_established():
    r = evaluate(build_case())
    assert evaluate(build_case().children[1]).status == ESTABLISHED
    assert "E2-P1-material" not in names(r.gaps)     # OR satisfied → not a gap
    assert "E3-P1" in names(r.gaps)                  # the only real gap

def test_root_is_gap_due_to_causation_only():
    r = evaluate(build_case())
    assert r.status == GAP and names(r.gaps) == ["E3-P1"]

def test_or_unsatisfied_flags_alternatives_as_medium():
    r = evaluate(build_case(nonmaterial_supportive=()).children[1])
    assert r.status == GAP
    assert names(r.gaps) == ["E2-P1-material", "E2-P2-nonmaterial"]
    assert all(g.severity == "Medium" for g in r.gaps)

def test_planted_contradiction_on_controller_leaf():
    r = evaluate(build_case(controller_adverse=["witness1"]))
    c = next(c for c in r.contradictions if c.target == "E1-P1")
    assert "ex3" in c.refs and "witness1" in c.refs

def test_refuted_necessary_leaf_is_contradiction():
    r = evaluate(Group("E", "AND", children=[Leaf("P", adverse=["adv1"])]))
    assert r.status == REFUTED and any(c.severity == "Critical" for c in r.contradictions)

def test_mutually_exclusive_both_established():
    r = evaluate(Group("X", "OR", mutually_exclusive=True,
        children=[Leaf("A", supportive=["a"]), Leaf("B", supportive=["b"])]))
    assert any("Mutually exclusive" in c.detail for c in r.contradictions)

def test_kofn_threshold():
    g = Group("K", "KOFN", threshold=2, children=[
        Leaf("A", supportive=["a"]), Leaf("B", supportive=["b"]), Leaf("C")])
    assert evaluate(g).status == ESTABLISHED
    g2 = Group("K", "KOFN", threshold=2, children=[
        Leaf("A", supportive=["a"]), Leaf("B", adverse=["x"]), Leaf("C", adverse=["y"])])
    assert evaluate(g2).status == REFUTED
```

---

## Appendix C — revised `GRAPH_BUILD_PROMPT` additions

Append to the existing prompt's guidelines (keep everything already there):

```
Additionally, for each element decide its logical structure and return it:
- "node_kind": "subsumption" for a Tatbestand of factual conditions; "ponderation" for a
  balancing of competing principles/rights (proportionality / Abwägung).
- "connective": "AND" if all child propositions are cumulative (all necessary), "OR" if they are
  alternative (any one suffices), "KOFN" with "threshold": k if k-of-n suffice.
- For a "ponderation" proposition also return "jurisdiction", "principles" (the competing
  rights with their articles), and "prongs" (the test sequence). Use the EU four-prong test by
  default: legitimate aim, suitability, necessity, proportionality stricto sensu.

Worked guidance for Art. 82 GDPR:
- E1 Infringement: AND; its lawfulness proposition is a "ponderation" node when it turns on the
  Art. 6(1)(f) legitimate-interests balancing.
- E2 Damage: "connective": "OR" over material and non-material damage (only one is required).
- E3 Causation: AND.
```

> Reuse the four jurisdiction prong-sets and principle pairs already specified in
> `ponderation-node-mockup.html` (this folder): EU / German / Colombian / ECtHR.
