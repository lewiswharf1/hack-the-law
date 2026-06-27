import os
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, status, UploadFile
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime

from app import models, schemas
from app.config import settings
from app.deps import get_current_user, get_db
from app.routers.jobs import create_job
from app.services.pdf import extract_text
from app.services.doc_analyser import run_document_analysis

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post("/cases/{case_id}/documents", response_model=schemas.DocumentUploadResponse)
def upload_document(
    case_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Upload a PDF document to a case.

    Returns {document_id, job_id} for polling analysis progress.
    """
    try:
        UUID(case_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    case = db.query(models.Case).filter_by(id=case_id).first()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are supported",
        )

    # Create uploads directory if it doesn't exist
    os.makedirs(settings.UPLOADS_DIR, exist_ok=True)

    # Save file
    file_id = str(uuid.uuid4())[:8]
    safe_filename = file.filename.replace("/", "_").replace("\\", "_")
    file_path = os.path.join(settings.UPLOADS_DIR, f"{file_id}_{safe_filename}")

    try:
        with open(file_path, "wb") as f:
            content = file.file.read()
            f.write(content)
            file_size = len(content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}",
        )

    # Extract text synchronously (fast for most PDFs)
    try:
        extracted_text = extract_text(file_path)
    except ValueError as e:
        # PDF has no text (e.g., scanned)
        extracted_text = ""
        error_msg = str(e)
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to extract text from PDF: {str(e)}",
        )

    # Create Document record
    document = models.Document(
        id=str(uuid.uuid4()),
        case_id=case_id,
        filename=file.filename,
        file_path=file_path,
        file_size_bytes=file_size,
        extracted_text=extracted_text,
        processing_status="pending" if extracted_text else "failed",
        uploaded_at=datetime.utcnow(),
    )
    db.add(document)
    db.flush()

    # Skip LLM analysis if no text extracted
    if not extracted_text:
        document.processing_status = "failed"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF contains no extractable text (possibly scanned without OCR)",
        )

    # Create analysis job
    job = create_job(db, case_id=case_id, document_id=str(document.id), job_type="analyse_document")

    # Queue background analysis
    background_tasks.add_task(
        run_document_analysis,
        db=db,
        case_id=case_id,
        document_id=str(document.id),
        job_id=str(job.id),
    )

    return schemas.DocumentUploadResponse(
        document_id=document.id,
        job_id=job.id,
    )


@router.get("/cases/{case_id}/documents", response_model=list[schemas.Document])
def get_documents(
    case_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve all documents for a case."""
    try:
        UUID(case_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    case = db.query(models.Case).filter_by(id=case_id).first()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    documents = db.query(models.Document).filter_by(case_id=case_id).all()
    return documents


@router.get("/documents/{document_id}", response_model=schemas.DocumentDetail)
def get_document_detail(
    document_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve a specific document with its evidence items."""
    try:
        UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    document = db.query(models.Document).filter_by(id=document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    evidence = db.query(models.Evidence).filter_by(document_id=document_id).all()
    return schemas.DocumentDetail(
        id=document.id,
        case_id=document.case_id,
        filename=document.filename,
        file_size_bytes=document.file_size_bytes,
        doc_type=document.doc_type,
        processing_status=document.processing_status,
        uploaded_at=document.uploaded_at,
        processed_at=document.processed_at,
        evidence=evidence,
    )


@router.delete("/documents/{document_id}", response_model=schemas.OkResponse)
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
):
    """Delete a document and its associated file."""
    try:
        UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    document = db.query(models.Document).filter_by(id=document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Delete file from filesystem
    if document.file_path and os.path.exists(document.file_path):
        try:
            os.remove(document.file_path)
        except Exception:
            pass  # Don't fail if file is already gone

    # Delete from DB (cascade will remove evidence items)
    db.delete(document)
    db.commit()

    return schemas.OkResponse(ok=True)
