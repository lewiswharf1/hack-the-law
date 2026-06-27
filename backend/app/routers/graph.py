"""Graph CRUD: elements and propositions."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db
from app.services.readiness import calculate_readiness, refresh_element_status

router = APIRouter(dependencies=[Depends(get_current_user)])


def _get_case_or_404(db: Session, case_id: str) -> models.Case:
    case = db.query(models.Case).filter_by(id=case_id).first()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


def _get_element_or_404(db: Session, element_id: str) -> models.Element:
    element = db.query(models.Element).filter_by(id=element_id).first()
    if not element:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Element not found")
    return element


def _get_proposition_or_404(db: Session, proposition_id: str) -> models.Proposition:
    proposition = db.query(models.Proposition).filter_by(id=proposition_id).first()
    if not proposition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposition not found")
    return proposition


def _build_graph(db: Session, case_id: str) -> schemas.GraphResponse:
    """Build and return graph with elements and propositions."""
    elements = (
        db.query(models.Element)
        .filter_by(case_id=case_id)
        .order_by(models.Element.position)
        .all()
    )

    # Per-proposition evidence + gap counts for this case
    evidence_counts = dict(
        db.query(models.Evidence.proposition_id, func.count(models.Evidence.id))
        .join(models.Proposition, models.Evidence.proposition_id == models.Proposition.id)
        .filter(models.Proposition.case_id == case_id)
        .group_by(models.Evidence.proposition_id)
        .all()
    )
    gap_counts = dict(
        db.query(models.Gap.proposition_id, func.count(models.Gap.id))
        .filter(models.Gap.case_id == case_id, models.Gap.proposition_id.isnot(None))
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

    return schemas.GraphResponse(elements=element_out)


# --- Elements ---------------------------------------------------------------


@router.get("/cases/{case_id}/graph", response_model=schemas.GraphResponse)
def get_graph(case_id: str, db: Session = Depends(get_db)):
    _get_case_or_404(db, case_id)
    return _build_graph(db, case_id)


@router.post("/cases/{case_id}/elements", response_model=schemas.ElementOut, status_code=status.HTTP_201_CREATED)
def create_element(case_id: str, body: schemas.ElementCreate, db: Session = Depends(get_db)):
    _get_case_or_404(db, case_id)

    # Auto-set position as max+1
    max_position = db.query(func.max(models.Element.position)).filter_by(case_id=case_id).scalar() or -1
    position = max_position + 1

    element = models.Element(
        case_id=case_id,
        label=body.label,
        title=body.title,
        source=body.source,
        position=position,
        status="Gap",
    )
    db.add(element)
    db.commit()
    db.refresh(element)

    # Return as ElementOut with empty propositions
    return schemas.ElementOut(
        id=element.id,
        label=element.label,
        title=element.title,
        status=element.status,
        source=element.source,
        position=element.position,
        propositions=[],
    )


@router.put("/elements/{element_id}", response_model=schemas.ElementOut)
def update_element(element_id: str, body: schemas.ElementUpdate, db: Session = Depends(get_db)):
    element = _get_element_or_404(db, element_id)

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(element, field, value)

    db.commit()
    db.refresh(element)

    # Return as ElementOut with current propositions
    propositions = (
        db.query(models.Proposition)
        .filter_by(element_id=element.id)
        .order_by(models.Proposition.position)
        .all()
    )

    # Get evidence/gap counts for this element's propositions
    evidence_counts = dict(
        db.query(models.Evidence.proposition_id, func.count(models.Evidence.id))
        .filter(models.Evidence.proposition_id.in_([p.id for p in propositions]))
        .group_by(models.Evidence.proposition_id)
        .all()
    ) if propositions else {}

    gap_counts = dict(
        db.query(models.Gap.proposition_id, func.count(models.Gap.id))
        .filter(models.Gap.proposition_id.in_([p.id for p in propositions]))
        .group_by(models.Gap.proposition_id)
        .all()
    ) if propositions else {}

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
        for p in propositions
    ]

    return schemas.ElementOut(
        id=element.id,
        label=element.label,
        title=element.title,
        status=element.status,
        source=element.source,
        position=element.position,
        propositions=prop_out,
    )


@router.delete("/elements/{element_id}", response_model=schemas.OkResponse)
def delete_element(element_id: str, db: Session = Depends(get_db)):
    element = _get_element_or_404(db, element_id)
    case_id = element.case_id
    db.delete(element)
    db.commit()

    # Recalculate case readiness after deletion
    readiness = calculate_readiness(db, str(case_id))
    db.query(models.Case).filter_by(id=case_id).update({"readiness": readiness})
    db.commit()

    return schemas.OkResponse()


# --- Propositions -----------------------------------------------------------


@router.post("/elements/{element_id}/propositions", response_model=schemas.PropositionOut, status_code=status.HTTP_201_CREATED)
def create_proposition(element_id: str, body: schemas.PropositionCreate, db: Session = Depends(get_db)):
    element = _get_element_or_404(db, element_id)
    case_id = element.case_id

    # Auto-set position as max+1
    max_position = db.query(func.max(models.Proposition.position)).filter_by(element_id=element_id).scalar() or -1
    position = max_position + 1

    proposition = models.Proposition(
        element_id=element_id,
        case_id=case_id,
        label=body.label,
        title=body.title,
        position=position,
        status="Gap",
    )
    db.add(proposition)
    db.commit()
    db.refresh(proposition)

    return schemas.PropositionOut(
        id=proposition.id,
        label=proposition.label,
        title=proposition.title,
        status=proposition.status,
        position=proposition.position,
        evidence_count=0,
        gap_count=0,
    )


@router.put("/propositions/{proposition_id}", response_model=schemas.PropositionOut)
def update_proposition(proposition_id: str, body: schemas.PropositionUpdate, db: Session = Depends(get_db)):
    proposition = _get_proposition_or_404(db, proposition_id)
    case_id = proposition.case_id

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(proposition, field, value)

    db.commit()
    db.refresh(proposition)

    # Refresh element status if proposition status changed
    refresh_element_status(db, str(proposition.element_id))

    # Recalculate case readiness
    readiness = calculate_readiness(db, str(case_id))
    db.query(models.Case).filter_by(id=case_id).update({"readiness": readiness})
    db.commit()

    # Get evidence/gap counts
    evidence_count = db.query(func.count(models.Evidence.id)).filter_by(proposition_id=proposition_id).scalar() or 0
    gap_count = db.query(func.count(models.Gap.id)).filter_by(proposition_id=proposition_id).scalar() or 0

    return schemas.PropositionOut(
        id=proposition.id,
        label=proposition.label,
        title=proposition.title,
        status=proposition.status,
        position=proposition.position,
        evidence_count=evidence_count,
        gap_count=gap_count,
    )


@router.delete("/propositions/{proposition_id}", response_model=schemas.OkResponse)
def delete_proposition(proposition_id: str, db: Session = Depends(get_db)):
    proposition = _get_proposition_or_404(db, proposition_id)
    case_id = proposition.case_id
    element_id = proposition.element_id

    db.delete(proposition)
    db.commit()

    # Refresh element status
    refresh_element_status(db, str(element_id))

    # Recalculate case readiness
    readiness = calculate_readiness(db, str(case_id))
    db.query(models.Case).filter_by(id=case_id).update({"readiness": readiness})
    db.commit()

    return schemas.OkResponse()
