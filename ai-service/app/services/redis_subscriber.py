"""
Redis subscriber service for the AI Service.
Listens for messages from the backend and processes them.
"""

import json
import asyncio
import logging
from typing import Dict, Any, Callable, Optional
import redis.asyncio as redis

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


class RedisSubscriber:
    """Redis subscriber for handling incoming messages from the backend."""

    def __init__(self):
        """Initialize the Redis subscriber."""
        self.redis_client: Optional[redis.Redis] = None
        self.pubsub: Optional[redis.client.PubSub] = None
        self.message_handlers: Dict[str, Callable] = {}
        self.running = False

    async def connect(self) -> None:
        """Connect to Redis and initialize pubsub."""
        try:
            # Create Redis client
            self.redis_client = redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
            )

            # Test connection
            await self.redis_client.ping()
            logger.info("Connected to Redis")

            # Initialize pubsub
            self.pubsub = self.redis_client.pubsub()
            await self.pubsub.psubscribe(f"{settings.redis_task_channel_prefix}:*")
            await self.pubsub.psubscribe(f"{settings.redis_chat_channel_prefix}:*")

            logger.info("Redis pubsub initialized and subscribed to channels")

        except Exception as e:
            logger.error(f"Failed to connect to Redis: {str(e)}")
            raise

    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self.pubsub:
            await self.pubsub.close()
        if self.redis_client:
            await self.redis_client.close()
        logger.info("Disconnected from Redis")

    def register_handler(self, channel_pattern: str, handler: Callable) -> None:
        """Register a message handler for a specific channel pattern."""
        self.message_handlers[channel_pattern] = handler
        logger.info(f"Registered handler for channel pattern: {channel_pattern}")

    async def start_listening(self) -> None:
        """Start listening for messages."""
        if not self.pubsub:
            raise RuntimeError("Pubsub not initialized. Call connect() first.")

        self.running = True
        logger.info("Starting to listen for Redis messages...")

        while self.running:
            try:
                # Get message with timeout
                message = await asyncio.wait_for(
                    self.pubsub.get_message(timeout=1.0),
                    timeout=1.0
                )

                if message:
                    await self._handle_message(message)

            except asyncio.TimeoutError:
                # Normal timeout, continue listening
                continue
            except Exception as e:
                logger.error(f"Error processing message: {str(e)}")
                await asyncio.sleep(1)  # Brief pause before continuing

    def stop_listening(self) -> None:
        """Stop listening for messages."""
        self.running = False
        logger.info("Stopped listening for Redis messages")

    async def _handle_message(self, message: Any) -> None:
        """Handle an incoming message."""
        try:
            if message["type"] != "pmessage":
                return  # We only care about pattern-matched messages

            channel = message["channel"]
            data = message["data"]

            if not data:
                logger.warning(f"Received empty message on channel: {channel}")
                return

            # Parse JSON data
            try:
                message_data = json.loads(data)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON message on channel {channel}: {str(e)}")
                return

            # Log received message
            logger.info(f"Received message on channel: {channel}")
            logger.debug(f"Message data: {message_data}")

            # Find and call appropriate handler
            for pattern, handler in self.message_handlers.items():
                if self._matches_pattern(channel, pattern):
                    try:
                        await handler(channel, message_data)
                    except Exception as e:
                        logger.error(f"Error in handler for channel {channel}: {str(e)}")
                    break
            else:
                logger.warning(f"No handler found for channel: {channel}")

        except Exception as e:
            logger.error(f"Error handling message: {str(e)}")

    def _matches_pattern(self, channel: str, pattern: str) -> bool:
        """Check if channel matches the given pattern."""
        # Simple wildcard matching for now
        if pattern.endswith("*"):
            return channel.startswith(pattern[:-1])
        return channel == pattern

    async def publish_response(self, channel: str, response_data: Dict[str, Any]) -> None:
        """Publish a response back to Redis."""
        if not self.redis_client:
            logger.error("Redis client not connected")
            return

        try:
            await self.redis_client.publish(
                channel,
                json.dumps(response_data, default=str)
            )
            logger.info(f"Published response to channel: {channel}")
        except Exception as e:
            logger.error(f"Failed to publish response to {channel}: {str(e)}")

    async def health_check(self) -> Dict[str, Any]:
        """Perform a health check on the Redis connection."""
        try:
            if not self.redis_client:
                return {"status": "error", "message": "Not connected to Redis"}

            # Test Redis connection
            await self.redis_client.ping()

            # Check pubsub status
            pubsub_status = "connected" if self.pubsub else "disconnected"

            return {
                "status": "healthy",
                "redis_connected": True,
                "pubsub_status": pubsub_status,
                "subscribed_channels": list(self.message_handlers.keys()),
                "listening": self.running
            }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }


# Global instance
redis_subscriber = RedisSubscriber()