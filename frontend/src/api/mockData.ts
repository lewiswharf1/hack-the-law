/*
  Mock dataset that backs the drop-in API client (src/api/client.ts) while the
  FastAPI backend is being built. This is the ONLY place fake data lives — when
  the real endpoints land, the client stops importing this module entirely.

  The data models a realistic GDPR Article 82 (right to compensation) claim, which
  is the worked example called out throughout CLAUDE.md (§11 graph-build prompt).
*/
import type {
  CaseArticle,
  CaseSummary,
  DocumentItem,
  Element,
  Evidence,
  Gap,
} from "../types"

// A frozen "now" so timestamps are stable across reloads in the demo.
const NOW = "2026-06-27T09:00:00Z"

export const mockCases: CaseSummary[] = [
  {
    id: "case-1",
    name: "Müller v. DataCorp Analytics GmbH",
    short_name: "Müller v. DataCorp",
    client: "Hannah Müller",
    court: "Landgericht Berlin",
    reference: "LG-BLN-2026-0142",
    status: "In Progress",
    claim_type: "Art. 82 GDPR, Art. 32 GDPR",
    lead: "LW",
    readiness: 58,
    has_graph: true,
    created_at: "2026-06-12T10:00:00Z",
    updated_at: NOW,
  },
  {
    id: "case-2",
    name: "Okafor v. NorthBank plc",
    short_name: "Okafor v. NorthBank",
    client: "Daniel Okafor",
    court: "High Court of Justice (KBD)",
    reference: "KB-2026-001893",
    status: "Draft",
    claim_type: "Pending",
    lead: "LW",
    readiness: 0,
    has_graph: false,
    created_at: "2026-06-24T14:30:00Z",
    updated_at: "2026-06-24T14:30:00Z",
  },
  {
    id: "case-3",
    name: "Verbraucherschutz e.V. v. AdTech Solutions",
    short_name: "VS v. AdTech",
    client: "Verbraucherschutz e.V.",
    court: "Landgericht München I",
    reference: "LG-M1-2026-0771",
    status: "Filed",
    claim_type: "Art. 6 GDPR",
    lead: "LW",
    readiness: 84,
    has_graph: true,
    created_at: "2026-05-30T08:15:00Z",
    updated_at: "2026-06-20T16:45:00Z",
  },
]

// Articles linked to case-1 (already fetched from CELLAR in the real flow).
export const mockArticles: Record<string, CaseArticle[]> = {
  "case-1": [
    {
      id: "art-1",
      case_id: "case-1",
      regulation_id: "gdpr",
      celex_id: "32016R0679",
      article_number: "82",
      article_title: "Right to compensation and liability",
      article_text:
        "Article 82\nRight to compensation and liability\n\n1. Any person who has suffered material or non-material damage as a result of an infringement of this Regulation shall have the right to receive compensation from the controller or processor for the damage suffered.",
      fetched_at: "2026-06-12T10:05:00Z",
    },
    {
      id: "art-2",
      case_id: "case-1",
      regulation_id: "gdpr",
      celex_id: "32016R0679",
      article_number: "32",
      article_title: "Security of processing",
      article_text:
        "Article 32\nSecurity of processing\n\n1. Taking into account the state of the art, the controller and the processor shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk.",
      fetched_at: "2026-06-12T10:05:00Z",
    },
  ],
}

/*
  The argument graph for case-1. Statuses are derived by the backend from evidence
  (CLAUDE.md §9), but here they're hand-set to show the full range of states.
  `evidence_count` / `gap_count` are denormalised onto each proposition by the
  GET /cases/{id}/graph endpoint.
*/
export const mockElements: Record<string, Element[]> = {
  "case-1": [
    {
      id: "el-1",
      label: "E1",
      title: "GDPR infringement by the controller",
      status: "Established",
      source: "Art. 32 GDPR",
      position: 1,
      propositions: [
        {
          id: "p-1",
          label: "E1-P1",
          title: "DataCorp was the controller of the claimant's personal data",
          status: "Established",
          position: 0,
          evidence_count: 2,
          gap_count: 0,
        },
        {
          id: "p-2",
          label: "E1-P2",
          title:
            "DataCorp failed to implement appropriate technical and organisational security measures",
          status: "Contested",
          position: 1,
          evidence_count: 2,
          gap_count: 0,
        },
      ],
    },
    {
      id: "el-2",
      label: "E2",
      title: "Damage suffered by the data subject",
      status: "Contested",
      source: "Art. 82(1) GDPR",
      position: 2,
      propositions: [
        {
          id: "p-3",
          label: "E2-P1",
          title: "The claimant suffered non-material damage (distress, anxiety)",
          status: "Contested",
          position: 0,
          evidence_count: 1,
          gap_count: 0,
        },
        {
          id: "p-4",
          label: "E2-P2",
          title: "The claimant suffered material damage (financial loss)",
          status: "Gap",
          position: 1,
          evidence_count: 0,
          gap_count: 1,
        },
      ],
    },
    {
      id: "el-3",
      label: "E3",
      title: "Causal link between infringement and damage",
      status: "Gap",
      source: "Art. 82(1) GDPR",
      position: 3,
      propositions: [
        {
          id: "p-5",
          label: "E3-P1",
          title:
            "The security failure directly caused the unauthorised disclosure of the claimant's data",
          status: "Gap",
          position: 0,
          evidence_count: 0,
          gap_count: 1,
        },
      ],
    },
  ],
}

// Evidence keyed by proposition id.
export const mockEvidence: Record<string, Evidence[]> = {
  "p-1": [
    {
      id: "ev-1",
      document_id: "doc-1",
      proposition_id: "p-1",
      excerpt:
        "DataCorp Analytics GmbH determines the purposes and means of processing customer profile data for its analytics products.",
      classification: "Supportive",
      source_ref: "§2.1, p.4",
      added_by: "ai",
      created_at: NOW,
      document_filename: "DataCorp_Privacy_Policy.pdf",
    },
    {
      id: "ev-2",
      document_id: "doc-2",
      proposition_id: "p-1",
      excerpt:
        "The data controller for the affected records is identified as DataCorp Analytics GmbH (Berlin).",
      classification: "Supportive",
      source_ref: "para 12",
      added_by: "ai",
      created_at: NOW,
      document_filename: "Regulator_Decision_BlnBDI.pdf",
    },
  ],
  "p-2": [
    {
      id: "ev-3",
      document_id: "doc-3",
      proposition_id: "p-2",
      excerpt:
        "The customer database was not encrypted at rest and access logs were retained for only 7 days, falling below industry standard.",
      classification: "Supportive",
      source_ref: "§4.2",
      added_by: "ai",
      created_at: NOW,
      document_filename: "Expert_Report_Security.pdf",
    },
    {
      id: "ev-4",
      document_id: "doc-1",
      proposition_id: "p-2",
      excerpt:
        "DataCorp maintains ISO 27001 certification and conducts annual third-party penetration testing.",
      classification: "Adverse",
      source_ref: "§5.3, p.9",
      added_by: "ai",
      created_at: NOW,
      document_filename: "DataCorp_Privacy_Policy.pdf",
    },
  ],
  "p-3": [
    {
      id: "ev-5",
      document_id: "doc-4",
      proposition_id: "p-3",
      excerpt:
        "Since learning of the breach I have experienced persistent anxiety about the misuse of my financial information and have lost sleep.",
      classification: "Supportive",
      source_ref: "para 8",
      added_by: "human",
      created_at: NOW,
      document_filename: "Witness_Statement_Muller.pdf",
    },
  ],
}

// Documents uploaded to case-1.
export const mockDocuments: Record<string, DocumentItem[]> = {
  "case-1": [
    {
      id: "doc-1",
      case_id: "case-1",
      filename: "DataCorp_Privacy_Policy.pdf",
      file_size_bytes: 248_500,
      doc_type: "Correspondence",
      processing_status: "done",
      uploaded_at: "2026-06-13T09:30:00Z",
      processed_at: "2026-06-13T09:31:00Z",
    },
    {
      id: "doc-2",
      case_id: "case-1",
      filename: "Regulator_Decision_BlnBDI.pdf",
      file_size_bytes: 512_000,
      doc_type: "Judgment",
      processing_status: "done",
      uploaded_at: "2026-06-13T09:35:00Z",
      processed_at: "2026-06-13T09:36:30Z",
    },
    {
      id: "doc-3",
      case_id: "case-1",
      filename: "Expert_Report_Security.pdf",
      file_size_bytes: 1_340_000,
      doc_type: "Expert Report",
      processing_status: "done",
      uploaded_at: "2026-06-14T11:00:00Z",
      processed_at: "2026-06-14T11:02:00Z",
    },
    {
      id: "doc-4",
      case_id: "case-1",
      filename: "Witness_Statement_Muller.pdf",
      file_size_bytes: 96_200,
      doc_type: "Witness Statement",
      processing_status: "done",
      uploaded_at: "2026-06-15T15:20:00Z",
      processed_at: "2026-06-15T15:20:40Z",
    },
  ],
}

// Gaps for case-1.
export const mockGaps: Record<string, Gap[]> = {
  "case-1": [
    {
      id: "gap-1",
      case_id: "case-1",
      proposition_id: "p-4",
      title: "No evidence of quantifiable financial loss",
      why: "The claim for material damage under Art. 82 requires proof of a concrete financial loss. No document on file quantifies a monetary loss to the claimant.",
      severity: "High",
      action:
        "Obtain bank statements or a forensic accountant's report evidencing fraudulent transactions linked to the breach.",
      source: "ai",
      status: "open",
      created_at: NOW,
    },
    {
      id: "gap-2",
      case_id: "case-1",
      proposition_id: "p-5",
      title: "Causation between security failure and disclosure unproven",
      why: "The expert report establishes a security weakness but does not link it to the specific incident that disclosed the claimant's data.",
      severity: "Critical",
      action:
        "Commission a forensic analysis tracing the breach vector to the unencrypted database identified in the expert report.",
      source: "ai",
      status: "open",
      created_at: NOW,
    },
    {
      id: "gap-3",
      case_id: "case-1",
      proposition_id: "p-3",
      title: "Distress claim lacks corroboration",
      why: "Non-material damage currently rests solely on the claimant's own witness statement.",
      severity: "Medium",
      action:
        "Consider a short medical or GP note corroborating the reported anxiety and sleep disturbance.",
      source: "human",
      status: "open",
      created_at: NOW,
    },
  ],
}
