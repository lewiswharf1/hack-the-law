from datetime import datetime
from sqlalchemy.orm import Session
from app import models
from app.services import claude
from app.services.readiness import calculate_readiness, refresh_proposition_status
import uuid


def _resolve_proposition_id(prop_id: str, label_to_uuid_map: dict) -> str | None:
    """
    Resolve proposition_id from Claude response.
    Claude might return either a UUID or a label (e.g., 'e1-p1').
    Map labels to UUIDs using the provided mapping.
    """
    if not prop_id:
        return None

    # If it looks like a UUID (contains dashes), return as-is
    if "-" in prop_id and len(prop_id) == 36:
        return prop_id

    # Otherwise, try to map the label to UUID
    mapped_id = label_to_uuid_map.get(prop_id)
    if mapped_id:
        return mapped_id

    # If no mapping found, log and return None
    return None


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

        # Build label-to-UUID map for fallback (in case Claude returns labels instead of UUIDs)
        label_to_uuid_map = {p.label: str(p.id) for p in propositions}

        # Call Claude to analyze document
        result = claude.analyse_document(document.extracted_text, props_for_prompt)

        # Save doc_type
        doc.doc_type = result.get("doc_type")
        doc.processing_status = "done"
        doc.processed_at = datetime.utcnow()
        db.commit()

        # Build set of valid proposition IDs for this case
        valid_proposition_ids = {str(p.id) for p in propositions}

        # Dedup: track evidence we've already seen from Claude (same proposition + excerpt)
        seen_evidence = set()

        # Save evidence mappings and track which propositions changed
        proposition_ids_updated = set()
        for mapping in result.get("evidence_mappings", []):
            prop_id_raw = mapping.get("proposition_id")
            prop_id = _resolve_proposition_id(prop_id_raw, label_to_uuid_map)
            if not prop_id or prop_id not in valid_proposition_ids:
                # Skip if proposition doesn't exist in this case
                continue

            # Dedup: skip if we've already seen this proposition + excerpt combo
            excerpt = mapping.get("excerpt", "")[:500]
            evidence_key = (prop_id, excerpt)
            if evidence_key in seen_evidence:
                continue
            seen_evidence.add(evidence_key)

            ev = models.Evidence(
                id=str(uuid.uuid4()),
                document_id=document_id,
                proposition_id=prop_id,
                excerpt=excerpt,
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

        # Save AI-suggested gaps (dedup: check both DB + current response)
        existing_gaps = db.query(models.Gap).filter_by(case_id=case_id, source="ai").all()
        existing_gap_keys = {
            (str(g.proposition_id), g.title)
            for g in existing_gaps
            if g.proposition_id
        }

        # Dedup: track gaps we've already seen in Claude's response
        seen_gaps = set()

        for gap_data in result.get("suggested_gaps", []):
            prop_id_raw = gap_data.get("proposition_id")
            prop_id = _resolve_proposition_id(prop_id_raw, label_to_uuid_map)
            gap_title = gap_data.get("title", "Gap identified")

            if not prop_id or prop_id not in valid_proposition_ids:
                # Skip if proposition doesn't exist
                continue

            gap_key = (prop_id, gap_title)
            if gap_key in seen_gaps or gap_key in existing_gap_keys:
                # Skip if already seen in this response or DB
                continue
            seen_gaps.add(gap_key)

            gap = models.Gap(
                id=str(uuid.uuid4()),
                case_id=case_id,
                proposition_id=prop_id,
                title=gap_title,
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
