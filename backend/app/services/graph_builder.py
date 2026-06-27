from datetime import datetime
from sqlalchemy.orm import Session
from app import models
from app.services import cellar, claude
import uuid


def run_graph_build(
    db: Session,
    case_id: str,
    job_id: str,
    articles_input: list[dict],
):
    """
    Full pipeline: fetch articles + case law → Claude → save to DB.
    Runs in BackgroundTasks.

    articles_input: [{"regulation_id": "gdpr", "celex_id": "32016R0679", "article_number": "82"}]
    """
    try:
        job = db.query(models.Job).filter_by(id=job_id).first()
        if job:
            job.status = "running"
            db.commit()

        case = db.query(models.Case).filter_by(id=case_id).first()
        if not case:
            raise ValueError(f"Case {case_id} not found")

        # 1. Fetch article text from EUR-Lex for each article
        fetched_articles = []
        for art in articles_input:
            result = cellar.fetch_article_text(art["celex_id"], art["article_number"])

            ca = models.CaseArticle(
                id=str(uuid.uuid4()),
                case_id=case_id,
                regulation_id=art["regulation_id"],
                celex_id=art["celex_id"],
                article_number=art["article_number"],
                article_title=result["title"],
                article_text=result["text"],
            )
            db.add(ca)
            db.flush()

            fetched_articles.append({
                "article_number": art["article_number"],
                "article_title": result["title"],
                "article_text": result["text"],
            })

        # 2. Fetch related case law from CELLAR SPARQL
        case_law = []
        if fetched_articles:
            first = articles_input[0]
            try:
                case_law = cellar.fetch_related_case_law(first["celex_id"], first["article_number"])
            except Exception:
                pass

        # 3. Call Claude to build graph
        graph = claude.build_argument_graph(case.name, case.client, fetched_articles, case_law)

        # 4. Save elements + propositions
        for elem_data in graph.get("elements", []):
            element = models.Element(
                id=str(uuid.uuid4()),
                case_id=case_id,
                label=elem_data["label"],
                title=elem_data["title"],
                source=elem_data.get("source", ""),
                status="Gap",
                position=int(elem_data["label"][1:]) if elem_data["label"][1:].isdigit() else 0,
            )
            db.add(element)
            db.flush()

            for i, prop_data in enumerate(elem_data.get("propositions", [])):
                proposition = models.Proposition(
                    id=str(uuid.uuid4()),
                    element_id=element.id,
                    case_id=case_id,
                    label=prop_data["label"],
                    title=prop_data["title"],
                    status="Gap",
                    position=i,
                )
                db.add(proposition)

        # 5. Update case status
        case.has_graph = True
        case.status = "In Progress"
        case.claim_type = ", ".join(
            f"Art. {a['article_number']} {a['regulation_id'].upper()}"
            for a in articles_input
        )
        case.updated_at = datetime.utcnow()

        # 6. Mark job done
        if job:
            job.status = "done"
            job.completed_at = datetime.utcnow()

        db.commit()

    except Exception as e:
        db.rollback()
        job = db.query(models.Job).filter_by(id=job_id).first()
        if job:
            job.status = "failed"
            job.error = str(e)
            db.commit()
        raise
