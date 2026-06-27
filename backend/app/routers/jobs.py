from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.deps import get_current_user, get_db

router = APIRouter(dependencies=[Depends(get_current_user)])


def create_job(
    db: Session,
    case_id: Optional[str] = None,
    job_type: str = "",
    document_id: Optional[str] = None,
) -> models.Job:
    """Insert a pending job row and return it.

    Reused by the articles and documents routers to register background work
    before handing a job_id back to the client for polling.
    """
    job = models.Job(
        case_id=case_id,
        document_id=document_id,
        job_type=job_type,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/jobs/{job_id}", response_model=schemas.JobStatus)
def get_job(job_id: str, db: Session = Depends(get_db)):
    try:
        UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    job = db.query(models.Job).filter_by(id=job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job
