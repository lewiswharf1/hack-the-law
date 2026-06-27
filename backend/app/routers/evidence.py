"""Evidence CRUD."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db
from app.services.readiness import calculate_readiness, refresh_proposition_status

router = APIRouter(dependencies=[Depends(get_current_user)])


def _get_proposition_or_404(db: Session, proposition_id: str) -> models.Proposition:
    proposition = db.query(models.Proposition).filter_by(id=proposition_id).first()
    if not proposition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposition not found")
    return proposition


def _get_evidence_or_404(db: Session, evidence_id: str) -> models.Evidence:
    evidence = db.query(models.Evidence).filter_by(id=evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence not found")
    return evidence


@router.get("/propositions/{proposition_id}/evidence", response_model=list[schemas.Evidence])
def get_evidence(proposition_id: str, db: Session = Depends(get_db)):
    _get_proposition_or_404(db, proposition_id)
    return (
        db.query(models.Evidence)
        .filter_by(proposition_id=proposition_id)
        .order_by(models.Evidence.created_at)
        .all()
    )


@router.post("/propositions/{proposition_id}/evidence", response_model=schemas.Evidence, status_code=status.HTTP_201_CREATED)
def create_evidence(proposition_id: str, body: schemas.EvidenceCreate, db: Session = Depends(get_db)):
    proposition = _get_proposition_or_404(db, proposition_id)
    case_id = proposition.case_id

    evidence = models.Evidence(
        document_id=body.document_id,
        proposition_id=proposition_id,
        excerpt=body.excerpt,
        classification=body.classification,
        source_ref=body.source_ref,
        added_by="human",
    )
    db.add(evidence)
    db.commit()
    db.refresh(evidence)

    # Refresh proposition status
    refresh_proposition_status(db, proposition_id)

    # Recalculate case readiness
    readiness = calculate_readiness(db, str(case_id))
    db.query(models.Case).filter_by(id=case_id).update({"readiness": readiness})
    db.commit()

    return evidence


@router.put("/evidence/{evidence_id}", response_model=schemas.Evidence)
def update_evidence(evidence_id: str, body: schemas.EvidenceUpdate, db: Session = Depends(get_db)):
    evidence = _get_evidence_or_404(db, evidence_id)
    proposition_id = evidence.proposition_id
    case_id = db.query(models.Proposition).filter_by(id=proposition_id).first().case_id

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(evidence, field, value)

    db.commit()
    db.refresh(evidence)

    # Refresh proposition status
    refresh_proposition_status(db, str(proposition_id))

    # Recalculate case readiness
    readiness = calculate_readiness(db, str(case_id))
    db.query(models.Case).filter_by(id=case_id).update({"readiness": readiness})
    db.commit()

    return evidence


@router.delete("/evidence/{evidence_id}", response_model=schemas.OkResponse)
def delete_evidence(evidence_id: str, db: Session = Depends(get_db)):
    evidence = _get_evidence_or_404(db, evidence_id)
    proposition_id = evidence.proposition_id
    proposition = db.query(models.Proposition).filter_by(id=proposition_id).first()
    case_id = proposition.case_id if proposition else None

    db.delete(evidence)
    db.commit()

    # Refresh proposition status
    if proposition_id:
        refresh_proposition_status(db, str(proposition_id))

    # Recalculate case readiness
    if case_id:
        readiness = calculate_readiness(db, str(case_id))
        db.query(models.Case).filter_by(id=case_id).update({"readiness": readiness})
        db.commit()

    return schemas.OkResponse()
