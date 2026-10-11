from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as api_router
from app.core.config import settings

app = FastAPI(
    title="Waste2Value API",
    description="Deterministic E-Waste Recycling Verification, Value Intelligence & Verifiable Circularity Passport Service",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Router
app.include_router(api_router, prefix=settings.API_V1_PREFIX)

@app.get("/")
def root():
    return {
        "service": "Waste2Value — Circular Intelligence & Verification Platform API",
        "tagline": "Turn Waste Into Verified Value.",
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/health",
        "ready": "/ready",
        "api_v1": settings.API_V1_PREFIX,
    }

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "Waste2Value Verification Backend",
        "version": settings.VERSION,
    }

@app.get("/ready")
def ready():
    return {
        "status": "ready",
        "service": "Waste2Value Verification Backend",
        "version": settings.VERSION,
    }

# AWS Lambda ASGI handler (Mangum)
try:
    from mangum import Mangum
    handler = Mangum(app)
except Exception:
    handler = None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

