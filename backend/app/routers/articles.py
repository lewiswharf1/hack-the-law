from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app import models, schemas
from app.deps import get_current_user, get_db
from app.routers.jobs import create_job
from app.services.graph_builder import run_graph_build

router = APIRouter(dependencies=[Depends(get_current_user)])


class ArticlesRequest(schemas.BaseModel):
    articles: list[schemas.ArticleInput]


@router.post("/cases/{case_id}/articles", response_model=schemas.JobIdResponse)
def add_articles(
    case_id: str,
    body: ArticlesRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Trigger argument graph build from selected EU regulation articles.

    Returns job_id for polling.
    """
    try:
        UUID(case_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    case = db.query(models.Case).filter_by(id=case_id).first()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    job = create_job(db, case_id=case_id, job_type="build_graph")

    articles_input = [
        {
            "regulation_id": a.regulation_id,
            "celex_id": a.celex_id,
            "article_number": a.article_number,
        }
        for a in body.articles
    ]

    background_tasks.add_task(
        run_graph_build,
        db=db,
        case_id=case_id,
        job_id=str(job.id),
        articles_input=articles_input,
    )

    return schemas.JobIdResponse(job_id=job.id)


@router.get("/cases/{case_id}/articles", response_model=list[schemas.CaseArticle])
def get_articles(
    case_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve all articles added to a case."""
    try:
        UUID(case_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    case = db.query(models.Case).filter_by(id=case_id).first()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    articles = db.query(models.CaseArticle).filter_by(case_id=case_id).all()
    return articles
