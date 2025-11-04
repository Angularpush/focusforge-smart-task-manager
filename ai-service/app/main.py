"""
Main FastAPI application for the FocusForge AI Service.
Provides NLP task parsing and context-aware chat responses.
"""

import logging
import logging.config
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from app.config.settings import get_settings, LOGGING_CONFIG
from app.services.redis_subscriber import redis_subscriber
from app.services.nlp_parser import task_parser
from app.pipelines.chat_pipeline import chat_pipeline

# Configure logging
logging.config.dictConfig(LOGGING_CONFIG)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    # Startup
    logger.info("Starting FocusForge AI Service...")

    try:
        # Initialize Redis subscriber
        await redis_subscriber.connect()

        # Register message handlers
        redis_subscriber.register_handler("task:*", handle_task_parsing_request)
        redis_subscriber.register_handler("chat:*", handle_chat_message)

        # Start background task for listening to messages
        import asyncio
        background_task = asyncio.create_task(redis_subscriber.start_listening())

        logger.info("AI Service started successfully")

        yield  # Application runs here

    except Exception as e:
        logger.error(f"Failed to start AI Service: {str(e)}")
        raise

    # Shutdown
    logger.info("Shutting down AI Service...")
    redis_subscriber.stop_listening()
    await redis_subscriber.disconnect()
    logger.info("AI Service shut down complete")


# Create FastAPI app
app = FastAPI(
    title="FocusForge AI Service",
    description="AI service for task parsing and context-aware chat assistance",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


async def handle_task_parsing_request(channel: str, message_data: dict) -> None:
    """Handle task parsing requests from Redis."""
    try:
        logger.info(f"Received task parsing request: {channel}")

        # Extract task data
        natural_input = message_data.get("natural_language_input", "")
        user_id = message_data.get("userId", "")

        if not natural_input:
            logger.warning("No natural language input provided")
            return

        # Parse the task
        parsed_task = task_parser.parse_task(natural_input)

        # Add metadata
        parsed_task.update({
            "user_id": user_id,
            "original_input": natural_input,
            "parsed_at": message_data.get("timestamp"),
            "request_id": message_data.get("request_id"),
        })

        # Publish response back to backend
        response_channel = channel.replace("task:", "task:response:")
        await redis_subscriber.publish_response(response_channel, {
            "success": True,
            "data": parsed_task,
            "metadata": {
                "service": "ai-service",
                "model": "nlp-parser",
                "confidence": parsed_task.get("confidence", 0.0),
            }
        })

        logger.info(f"Task parsed successfully: {parsed_task.get('title')} (confidence: {parsed_task.get('confidence', 0.0):.2f})")

    except Exception as e:
        logger.error(f"Error in task parsing: {str(e)}")

        # Publish error response
        response_channel = channel.replace("task:", "task:response:")
        await redis_subscriber.publish_response(response_channel, {
            "success": False,
            "error": str(e),
            "metadata": {
                "service": "ai-service",
                "model": "nlp-parser",
            }
        })


async def handle_chat_message(channel: str, message_data: dict) -> None:
    """Handle chat messages from Redis."""
    try:
        logger.info(f"Received chat message: {channel}")

        # Extract message data
        user_id = message_data.get("userId", "")
        session_id = message_data.get("sessionId", "")
        content = message_data.get("content", "")
        context = message_data.get("context", {})

        if not all([user_id, session_id, content]):
            logger.warning("Missing required fields in chat message")
            return

        # Generate AI response
        response = await chat_pipeline.process_message(
            user_id=user_id,
            session_id=session_id,
            content=content,
            context=context
        )

        # Add metadata
        response.update({
            "metadata": {
                "service": "ai-service",
                "model": settings.openai_model if settings.use_openai() else settings.ollama_model,
                "provider": get_settings().get_model_provider(),
                "temperature": settings.chat_temperature,
            }
        })

        # Publish response back to backend
        response_channel = channel.replace("chat:", "chat:response:")
        await redis_subscriber.publish_response(response_channel, {
            "success": True,
            "data": response,
        })

        logger.info(f"Chat response generated for user {user_id} (confidence: {response.get('confidence', 0.0):.2f})")

    except Exception as e:
        logger.error(f"Error in chat processing: {str(e)}")

        # Publish error response
        response_channel = channel.replace("chat:", "chat:response:")
        await redis_subscriber.publish_response(response_channel, {
            "success": False,
            "error": str(e),
            "metadata": {
                "service": "ai-service",
            }
        })


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        redis_health = await redis_subscriber.health_check()

        return JSONResponse({
            "status": "healthy" if redis_health.get("status") == "healthy" else "degraded",
            "service": "focusforge-ai-service",
            "version": "1.0.0",
            "environment": settings.environment,
            "dependencies": {
                "redis": redis_health,
                "nlp_parser": "operational",
                "chat_pipeline": "operational",
            },
            "features": {
                "task_parsing": settings.enable_task_parsing,
                "chat_responses": settings.enable_chat_responses,
                "scheduling": settings.enable_scheduling,
                "memory_persistence": settings.enable_memory_persistence,
            },
            "models": {
                "provider": get_settings().get_model_provider(),
                "openai_configured": settings.use_openai(),
                "ollama_configured": settings.use_ollama(),
                "openai_model": settings.openai_model if settings.use_openai() else None,
                "ollama_model": settings.ollama_model if settings.use_ollama() else None,
            }
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse({
            "status": "error",
            "service": "focusforge-ai-service",
            "error": str(e)
        }, status_code=503)


# Direct API endpoints (for testing/debugging)
@app.post("/parse-task")
async def parse_task_direct(request: Request):
    """Direct task parsing endpoint for testing."""
    try:
        data = await request.json()
        natural_input = data.get("natural_language_input", "")

        if not natural_input:
            raise HTTPException(status_code=400, detail="natural_language_input is required")

        result = task_parser.parse_task(natural_input)

        return {
            "success": True,
            "data": result,
            "metadata": {
                "service": "ai-service",
                "endpoint": "direct",
            }
        }

    except Exception as e:
        logger.error(f"Direct task parsing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat_direct(request: Request):
    """Direct chat endpoint for testing."""
    try:
        data = await request.json()
        user_id = data.get("user_id", "test-user")
        session_id = data.get("session_id", "test-session")
        content = data.get("content", "")
        context = data.get("context", {})

        if not content:
            raise HTTPException(status_code=400, detail="content is required")

        result = await chat_pipeline.process_message(
            user_id=user_id,
            session_id=session_id,
            content=content,
            context=context
        )

        return {
            "success": True,
            "data": result,
            "metadata": {
                "service": "ai-service",
                "endpoint": "direct",
            }
        }

    except Exception as e:
        logger.error(f"Direct chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Metrics endpoint
@app.get("/metrics")
async def get_metrics():
    """Get service metrics."""
    try:
        redis_health = await redis_subscriber.health_check()

        # Count active sessions in chat pipeline
        active_sessions = len(chat_pipeline.memory)

        return {
            "service": "focusforge-ai-service",
            "status": "operational",
            "uptime": "N/A",  # Would need to track startup time
            "metrics": {
                "redis_status": redis_health.get("status", "unknown"),
                "active_chat_sessions": active_sessions,
                "listening_to_redis": redis_health.get("listening", False),
                "registered_handlers": len(redis_subscriber.message_handlers),
            },
            "performance": {
                "avg_response_time": "N/A",  # Would need to track response times
                "total_requests": "N/A",  # Would need to track request count
                "error_rate": "N/A",  # Would need to track errors
            }
        }

    except Exception as e:
        logger.error(f"Metrics endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Middleware for logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests."""
    logger.info(f"Request: {request.method} {request.url.path}")

    response = await call_next(request)

    logger.info(f"Response: {response.status_code}")
    return response


# Exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler."""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)

    return JSONResponse(
        {
            "success": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An internal error occurred",
                "details": str(exc) if settings.debug else None,
            },
            "metadata": {
                "service": "focusforge-ai-service",
                "path": request.url.path,
            }
        },
        status_code=500
    )


if __name__ == "__main__":
    # Run the application
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )