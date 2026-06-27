"""Gaps CRUD."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db

router = APIRouter(dependencies=[Depends(get_current_user)])


def _get_case_or_404(db: Session, case_id: str) -> models.Case:
    case_obj = db.query(models.Case).filter_by(id=case_id).first()
    if not case_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case_obj


def _get_gap_or_404(db: Session, gap_id: str) -> models.Gap:
    gap = db.query(models.Gap).filter_by(id=gap_id).first()
    if not gap:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gap not found")
    return gap


@router.get("/cases/{case_id}/gaps", response_model=list[schemas.Gap])
def get_gaps(case_id: str, db: Session = Depends(get_db)):
    _get_case_or_404(db, case_id)

    # Order by severity (Critical > High > Medium > Low) then by created_at desc
    severity_order = case(
        (models.Gap.severity == "Critical", 0),
        (models.Gap.severity == "High", 1),
        (models.Gap.severity == "Medium", 2),
        (models.Gap.severity == "Low", 3),
        else_=4,
    )

    return (
        db.query(models.Gap)
        .filter_by(case_id=case_id)
        .order_by(severity_order, models.Gap.created_at.desc())
        .all()
    )


@router.post("/cases/{case_id}/gaps", response_model=schemas.Gap, status_code=status.HTTP_201_CREATED)
def create_gap(case_id: str, body: schemas.GapCreate, db: Session = Depends(get_db)):
    _get_case_or_404(db, case_id)

    gap = models.Gap(
        case_id=case_id,
        proposition_id=body.proposition_id,
        title=body.title,
        why=body.why,
        severity=body.severity,
        action=body.action,
        source="human",
        status="open",
    )
    db.add(gap)
    db.commit()
    db.refresh(gap)
    return gap


@router.put("/gaps/{gap_id}", response_model=schemas.Gap)
def update_gap(gap_id: str, body: schemas.GapUpdate, db: Session = Depends(get_db)):
    gap = _get_gap_or_404(db, gap_id)

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(gap, field, value)

    db.commit()
    db.refresh(gap)
    return gap


@router.delete("/gaps/{gap_id}", response_model=schemas.OkResponse)
def delete_gap(gap_id: str, db: Session = Depends(get_db)):
    gap = _get_gap_or_404(db, gap_id)
    db.delete(gap)
    db.commit()
    return schemas.OkResponse()
