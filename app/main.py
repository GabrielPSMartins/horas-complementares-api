from fastapi import FastAPI, status

app = FastAPI(
    title="Horas Complementares API",
    version="0.1.0",
)


@app.get("/health", status_code=status.HTTP_200_OK)
def health_check() -> dict[str, str]:
    """Informa se a aplicação está disponível."""
    return {"status": "ok"}
