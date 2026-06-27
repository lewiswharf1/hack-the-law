from sqlalchemy import Column, Text, Integer, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base

TS = DateTime(timezone=True)


class User(Base):
    __tablename__ = "users"

    id            = Column(UUID(as_uuid=True), primary_key=True, server_default=func.uuid_generate_v4())
    username      = Column(Text, unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    created_at    = Column(TS, server_default=func.now())


class Case(Base):
    __tablename__ = "cases"

    id         = Column(UUID(as_uuid=True), primary_key=True, server_default=func.uuid_generate_v4())
    name       = Column(Text, nullable=False)
    short_name = Column(Text, nullable=False)
    client     = Column(Text, nullable=False, server_default="")
    court      = Column(Text, nullable=False, server_default="")
    reference  = Column(Text, nullable=False, server_default="")
    status     = Column(Text, nullable=False, server_default="Draft")
    claim_type = Column(Text, nullable=False, server_default="Pending")
    lead       = Column(Text, nullable=False, server_default="LW")
    readiness  = Column(Integer, nullable=False, server_default="0")
    has_graph  = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(TS, server_default=func.now())
    updated_at = Column(TS, server_default=func.now())


class CaseArticle(Base):
    __tablename__ = "case_articles"

    id             = Column(UUID(as_uuid=True), primary_key=True, server_default=func.uuid_generate_v4())
    case_id        = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    regulation_id  = Column(Text, nullable=False)
    celex_id       = Column(Text, nullable=False)
    article_number = Column(Text, nullable=False)
    article_title  = Column(Text, nullable=False, server_default="")
    article_text   = Column(Text, nullable=False, server_default="")
    fetched_at     = Column(TS, server_default=func.now())


class Element(Base):
    __tablename__ = "elements"

    id         = Column(UUID(as_uuid=True), primary_key=True, server_default=func.uuid_generate_v4())
    case_id    = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    label      = Column(Text, nullable=False)
    title      = Column(Text, nullable=False)
    status     = Column(Text, nullable=False, server_default="Gap")
    source     = Column(Text, nullable=False, server_default="")
    position   = Column(Integer, nullable=False, server_default="0")
    created_at = Column(TS, server_default=func.now())


class Proposition(Base):
    __tablename__ = "propositions"

    id         = Column(UUID(as_uuid=True), primary_key=True, server_default=func.uuid_generate_v4())
    element_id = Column(UUID(as_uuid=True), ForeignKey("elements.id", ondelete="CASCADE"), nullable=False)
    case_id    = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    label      = Column(Text, nullable=False)
    title      = Column(Text, nullable=False)
    status     = Column(Text, nullable=False, server_default="Gap")
    position   = Column(Integer, nullable=False, server_default="0")
    created_at = Column(TS, server_default=func.now())


class Document(Base):
    __tablename__ = "documents"

    id                = Column(UUID(as_uuid=True), primary_key=True, server_default=func.uuid_generate_v4())
    case_id           = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    filename          = Column(Text, nullable=False)
    file_path         = Column(Text, nullable=False)
    file_size_bytes   = Column(Integer, nullable=False, server_default="0")
    file_type         = Column(Text, nullable=False, server_default="pdf")
    doc_type          = Column(Text)
    extracted_text    = Column(Text)
    processing_status = Column(Text, nullable=False, server_default="pending")
    uploaded_at       = Column(TS, server_default=func.now())
    processed_at      = Column(TS)


class Evidence(Base):
    __tablename__ = "evidence"

    id             = Column(UUID(as_uuid=True), primary_key=True, server_default=func.uuid_generate_v4())
    document_id    = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    proposition_id = Column(UUID(as_uuid=True), ForeignKey("propositions.id", ondelete="CASCADE"), nullable=False)
    excerpt        = Column(Text, nullable=False)
    classification = Column(Text, nullable=False)
    source_ref     = Column(Text, nullable=False, server_default="")
    added_by       = Column(Text, nullable=False, server_default="ai")
    created_at     = Column(TS, server_default=func.now())


class Gap(Base):
    __tablename__ = "gaps"

    id             = Column(UUID(as_uuid=True), primary_key=True, server_default=func.uuid_generate_v4())
    case_id        = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    proposition_id = Column(UUID(as_uuid=True), ForeignKey("propositions.id", ondelete="SET NULL"))
    title          = Column(Text, nullable=False)
    why            = Column(Text, nullable=False, server_default="")
    severity       = Column(Text, nullable=False, server_default="High")
    action         = Column(Text, nullable=False, server_default="")
    source         = Column(Text, nullable=False, server_default="ai")
    status         = Column(Text, nullable=False, server_default="open")
    created_at     = Column(TS, server_default=func.now())


class Job(Base):
    __tablename__ = "jobs"

    id           = Column(UUID(as_uuid=True), primary_key=True, server_default=func.uuid_generate_v4())
    case_id      = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"))
    document_id  = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"))
    job_type     = Column(Text, nullable=False)
    status       = Column(Text, nullable=False, server_default="pending")
    result       = Column(JSONB)
    error        = Column(Text)
    created_at   = Column(TS, server_default=func.now())
    completed_at = Column(TS)
