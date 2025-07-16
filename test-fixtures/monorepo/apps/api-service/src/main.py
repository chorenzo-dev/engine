from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="API Service", version="1.0.0")

class HealthResponse(BaseModel):
    status: str
    version: str

@app.get("/health", response_model=HealthResponse)
def health_check():
    return HealthResponse(status="healthy", version="1.0.0")

@app.get("/api/users")
def get_users():
    return [{"id": 1, "name": "John"}, {"id": 2, "name": "Jane"}]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)