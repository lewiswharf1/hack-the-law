from sqlalchemy.orm import Session
from app import models


def refresh_proposition_status(db: Session, proposition_id: str):
    """Auto-update proposition status based on evidence.

    Gap: no evidence
    Contested: has both supportive and adverse
    Established: has supportive, no adverse
    """
    evidence = db.query(models.Evidence).filter_by(proposition_id=proposition_id).all()
    if not evidence:
        status = "Gap"
    else:
        supportive = sum(1 for e in evidence if e.classification == "Supportive")
        adverse = sum(1 for e in evidence if e.classification == "Adverse")
        if supportive > 0 and adverse == 0:
            status = "Established"
        else:
            status = "Contested"

    prop = db.query(models.Proposition).filter_by(id=proposition_id).first()
    if prop:
        prop.status = status
        db.commit()

    # Cascade up to parent element
    if prop:
        refresh_element_status(db, str(prop.element_id))


def refresh_element_status(db: Session, element_id: str):
    """Auto-update element status based on child propositions.

    Gap: any child is Gap
    Contested: any child is Contested
    Established: all children are Established
    """
    propositions = db.query(models.Proposition).filter_by(element_id=element_id).all()
    if not propositions:
        return

    statuses = [p.status for p in propositions]
    if "Gap" in statuses:
        status = "Gap"
    elif "Contested" in statuses:
        status = "Contested"
    else:
        status = "Established"

    elem = db.query(models.Element).filter_by(id=element_id).first()
    if elem:
        elem.status = status
        db.commit()


def calculate_readiness(db: Session, case_id: str) -> int:
    """Calculate case readiness score (0-100).

    Established = 1.0, Contested = 0.5, Gap = 0.0
    Score = sum(weights) / total_propositions * 100
    """
    propositions = db.query(models.Proposition).filter_by(case_id=case_id).all()
    if not propositions:
        return 0

    total = len(propositions)
    score = sum(
        1.0 if p.status == "Established" else
        0.5 if p.status == "Contested" else
        0.0
        for p in propositions
    )
    return round((score / total) * 100)
