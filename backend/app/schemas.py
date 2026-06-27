"""Pydantic request/response schemas mirroring CLAUDE.md §7 JSON shapes.

Keep in sync with the frontend contracts in `frontend/src/types/index.ts`.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


# --- Cases ---------------------------------------------------------------

class CaseSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    short_name: str
    client: str
    court: str
    reference: str
    status: str
    claim_type: str
    lead: str
    readiness: int
    has_graph: bool
    created_at: datetime
    updated_at: datetime


class NewCaseDetails(BaseModel):
    name: str
    client: str = ""
    court: str = ""
    reference: str = ""


class CaseUpdate(BaseModel):
    name: Optional[str] = None
    client: Optional[str] = None
    court: Optional[str] = None
    reference: Optional[str] = None
    status: Optional[str] = None


# --- Argument graph ------------------------------------------------------

class PropositionOut(BaseModel):
    id: UUID
    label: str
    title: str
    status: str
    position: int
    evidence_count: int
    gap_count: int


class ElementOut(BaseModel):
    id: UUID
    label: str
    title: str
    status: str
    source: str
    position: int
    propositions: list[PropositionOut]


class CaseDetail(CaseSummary):
    elements: list[ElementOut]


class GraphResponse(BaseModel):
    elements: list[ElementOut]


# --- Articles ------------------------------------------------------------

class ArticleInput(BaseModel):
    regulation_id: str
    celex_id: str
    article_number: str


class CaseArticle(ArticleInput):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    case_id: UUID
    article_title: str
    article_text: str
    fetched_at: datetime


# --- Evidence ------------------------------------------------------------

class Evidence(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    proposition_id: UUID
    excerpt: str
    classification: str
    source_ref: str
    added_by: str
    created_at: datetime


# --- Gaps ----------------------------------------------------------------

class Gap(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    case_id: UUID
    proposition_id: Optional[UUID] = None
    title: str
    why: str
    severity: str
    action: str
    source: str
    status: str
    created_at: datetime


# --- Documents -----------------------------------------------------------

class Document(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    case_id: UUID
    filename: str
    file_size_bytes: int
    doc_type: Optional[str] = None
    processing_status: str
    uploaded_at: datetime
    processed_at: Optional[datetime] = None


class DocumentDetail(Document):
    evidence: list[Evidence]


# --- Jobs ----------------------------------------------------------------

class JobStatus(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    job_type: str
    error: Optional[str] = None
    completed_at: Optional[datetime] = None


# --- Misc ----------------------------------------------------------------

class OkResponse(BaseModel):
    ok: bool = True
