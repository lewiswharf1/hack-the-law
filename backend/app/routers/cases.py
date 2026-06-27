from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db

router = APIRouter(dependencies=[Depends(get_current_user)])


def _derive_short_name(name: str) -> str:
    """Mirror the frontend's short_name derivation (client.ts)."""
    return name[:26] + "…" if len(name) > 28 else name


def _get_case_or_404(db: Session, case_id: str) -> models.Case:
    case = db.query(models.Case).filter_by(id=case_id).first()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


def _build_case_detail(db: Session, case: models.Case) -> schemas.CaseDetail:
    elements = (
        db.query(models.Element)
        .filter_by(case_id=case.id)
        .order_by(models.Element.position)
        .all()
    )

    # Per-proposition evidence + gap counts for this case, fetched in two queries.
    evidence_counts = dict(
        db.query(models.Evidence.proposition_id, func.count(models.Evidence.id))
        .join(models.Proposition, models.Evidence.proposition_id == models.Proposition.id)
        .filter(models.Proposition.case_id == case.id)
        .group_by(models.Evidence.proposition_id)
        .all()
    )
    gap_counts = dict(
        db.query(models.Gap.proposition_id, func.count(models.Gap.id))
        .filter(models.Gap.case_id == case.id, models.Gap.proposition_id.isnot(None))
        .group_by(models.Gap.proposition_id)
        .all()
    )

    element_out = []
    for element in elements:
        props = (
            db.query(models.Proposition)
            .filter_by(element_id=element.id)
            .order_by(models.Proposition.position)
            .all()
        )
        prop_out = [
            schemas.PropositionOut(
                id=p.id,
                label=p.label,
                title=p.title,
                status=p.status,
                position=p.position,
                evidence_count=evidence_counts.get(p.id, 0),
                gap_count=gap_counts.get(p.id, 0),
            )
            for p in props
        ]
        element_out.append(
            schemas.ElementOut(
                id=element.id,
                label=element.label,
                title=element.title,
                status=element.status,
                source=element.source,
                position=element.position,
                propositions=prop_out,
            )
        )

    return schemas.CaseDetail(
        **schemas.CaseSummary.model_validate(case).model_dump(),
        elements=element_out,
    )


@router.get("/cases", response_model=list[schemas.CaseSummary])
def list_cases(db: Session = Depends(get_db)):
    return (
        db.query(models.Case)
        .order_by(models.Case.created_at.desc())
        .all()
    )


@router.post("/cases", response_model=schemas.CaseSummary, status_code=status.HTTP_201_CREATED)
def create_case(body: schemas.NewCaseDetails, db: Session = Depends(get_db)):
    case = models.Case(
        name=body.name,
        short_name=_derive_short_name(body.name),
        client=body.client,
        court=body.court,
        reference=body.reference,
        status="Draft",
        claim_type="Pending",
        readiness=0,
        has_graph=False,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@router.get("/cases/{case_id}", response_model=schemas.CaseDetail)
def get_case(case_id: str, db: Session = Depends(get_db)):
    case = _get_case_or_404(db, case_id)
    return _build_case_detail(db, case)


@router.put("/cases/{case_id}", response_model=schemas.CaseSummary)
def update_case(case_id: str, body: schemas.CaseUpdate, db: Session = Depends(get_db)):
    case = _get_case_or_404(db, case_id)
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(case, field, value)
    if "name" in updates:
        case.short_name = _derive_short_name(updates["name"])
    case.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(case)
    return case


@router.delete("/cases/{case_id}", response_model=schemas.OkResponse)
def delete_case(case_id: str, db: Session = Depends(get_db)):
    case = _get_case_or_404(db, case_id)
    db.delete(case)
    db.commit()
    return schemas.OkResponse()
