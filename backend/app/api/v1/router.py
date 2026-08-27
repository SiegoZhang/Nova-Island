from fastapi import APIRouter

from app.api.v1.routers import (
    admin,
    auth,
    columns,
    events,
    health,
    notifications,
    posts,
    rankings,
    tags,
    uploads,
    users,
    voyages,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(uploads.router)
api_router.include_router(notifications.router)
api_router.include_router(admin.router)
api_router.include_router(posts.router)
api_router.include_router(tags.router)
api_router.include_router(voyages.router)
api_router.include_router(columns.router)
api_router.include_router(rankings.router)
api_router.include_router(events.router)
