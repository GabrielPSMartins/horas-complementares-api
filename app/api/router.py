from fastapi import APIRouter

from app.api.routes import activity_types, auth, health


api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(activity_types.router)