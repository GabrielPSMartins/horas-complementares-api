from fastapi import APIRouter

from app.api.routes import activity_requests, activity_types, auth, health
from app.api.routes.students import router as students_router
from app.api.routes.coordinator import router as coordinator_router

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(activity_types.router)
api_router.include_router(activity_requests.router)
api_router.include_router(students_router)
api_router.include_router(coordinator_router)