from fastapi import APIRouter

from app.api.routes import (
    activity_requests,
    activity_types,
    auth,
    coordinator,
    coordinators,
    health,
    students,
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(activity_types.router)
api_router.include_router(activity_requests.router)
api_router.include_router(students.router)
api_router.include_router(coordinator.router)
api_router.include_router(coordinators.router)