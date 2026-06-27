from datetime import datetime
from sqlalchemy.orm import Session
from app import models
from app.services import claude
from app.services.readiness import calculate_readiness, refresh_proposition_status
import uuid


def run_document_analysis(
    db: Session,
    case_id: str,
    document_id: str,
    job_id: str,
):
    """
    Full pipeline: text already extracted; call Claude → save evidence + gaps.
    Runs in BackgroundTasks.
    """
    try:
        job = db.query(models.Job).filter_by(id=job_id).first()
        if job:
            job.status = "running"
            db.commit()

        document = db.query(models.Document).filter_by(id=document_id).first()
        if not document:
            raise ValueError(f"Document {document_id} not found")

        doc = db.query(models.Document).filter_by(id=document_id).first()
        doc.processing_status = "processing"
        db.commit()

        # Get all propositions for the case
        propositions = db.query(models.Proposition).filter_by(case_id=case_id).all()
        props_for_prompt = [
            {"id": str(p.id), "label": p.label, "title": p.title}
            for p in propositions
        ]

        # Call Claude to analyze document
        result = claude.analyse_document(document.extracted_text, props_for_prompt)

        # Save doc_type
        doc.doc_type = result.get("doc_type")
        doc.processing_status = "done"
        doc.processed_at = datetime.utcnow()
        db.commit()

        # Save evidence mappings and track which propositions changed
        proposition_ids_updated = set()
        for mapping in result.get("evidence_mappings", []):
            prop_id = mapping.get("proposition_id")
            if not prop_id:
                continue

            ev = models.Evidence(
                id=str(uuid.uuid4()),
                document_id=document_id,
                proposition_id=prop_id,
                excerpt=mapping.get("excerpt", "")[:500],  # Cap excerpt length
                classification=mapping.get("classification", "Neutral"),
                source_ref=mapping.get("source_ref", ""),
                added_by="ai",
            )
            db.add(ev)
            proposition_ids_updated.add(prop_id)

        db.flush()

        # Refresh proposition statuses
        for prop_id in proposition_ids_updated:
            refresh_proposition_status(db, prop_id)

        # Save AI-suggested gaps (dedup: only if not already present from this source)
        existing_gap_prop_ids = {
            str(g.proposition_id)
            for g in db.query(models.Gap).filter_by(case_id=case_id, source="ai").all()
            if g.proposition_id
        }
        for gap_data in result.get("suggested_gaps", []):
            prop_id = gap_data.get("proposition_id")
            if prop_id and prop_id not in existing_gap_prop_ids:
                gap = models.Gap(
                    id=str(uuid.uuid4()),
                    case_id=case_id,
                    proposition_id=prop_id,
                    title=gap_data.get("title", "Gap identified"),
                    why=gap_data.get("why", ""),
                    severity=gap_data.get("severity", "High"),
                    action=gap_data.get("action", ""),
                    source="ai",
                    status="open",
                )
                db.add(gap)

        # Recalculate readiness
        readiness = calculate_readiness(db, case_id)
        case = db.query(models.Case).filter_by(id=case_id).first()
        if case:
            case.readiness = readiness

        if job:
            job.status = "done"
            job.completed_at = datetime.utcnow()

        db.commit()

    except Exception as e:
        db.rollback()
        doc = db.query(models.Document).filter_by(id=document_id).first()
        if doc:
            doc.processing_status = "failed"
            db.commit()

        job = db.query(models.Job).filter_by(id=job_id).first()
        if job:
            job.status = "failed"
            job.error = str(e)
            db.commit()
        raise
