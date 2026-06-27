from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, cases, jobs, articles, documents, graph, evidence, gaps

app = FastAPI(title="Scaffold")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(cases.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(articles.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(evidence.router, prefix="/api")
app.include_router(gaps.router, prefix="/api")
