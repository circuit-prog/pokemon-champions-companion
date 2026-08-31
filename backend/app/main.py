from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import pokemon, reference, calc, meta

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pokemon Champions Companion API")

# Allow the local Vite dev server (and later, the deployed frontend) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    # Without this the browser can't read X-Total-Count cross-origin, so the
    # Pokedex wouldn't know how many results it's paging through.
    expose_headers=["X-Total-Count"],
)

app.include_router(pokemon.router)
app.include_router(reference.router)
app.include_router(calc.router)
app.include_router(meta.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
