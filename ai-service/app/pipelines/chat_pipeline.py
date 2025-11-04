"""
Chat pipeline for processing user messages and generating AI responses.
Uses LangChain for context retrieval and response generation.
"""

import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta

from langchain.schema import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain.memory import ConversationBufferMemory
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import LLMChain
from langchain.output_parsers import ResponseSchema, StructuredOutputParser
from langchain.chat_models.base import BaseChatModel

from app.config.settings import get_settings
from app.services.context_retriever import ContextRetriever
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)

settings = get_settings()


class ChatResponseSchema(ResponseSchema):
    """Schema for structured chat responses."""
    response: str = "The main response to the user"
    suggested_actions: List[str] = ["List of suggested actions the user can take"]
    task_recommendations: List[Dict[str, Any]] = ["Recommended tasks with details"]
    focus_advice: Optional[str] = "Advice about focus/study time"
    confidence: float = "Confidence score (0-1)"


class ChatPipeline:
    """Pipeline for processing chat messages with context-aware AI responses."""

    def __init__(self):
        """Initialize the chat pipeline."""
        self.llm_service = LLMService()
        self.context_retriever = ContextRetriever()
        self.memory: Dict[str, ConversationBufferMemory] = {}

        # Initialize response parser
        self.response_parser = StructuredOutputParser.from_response_schemas(
            [ChatResponseSchema]
        )

        # Setup chat prompt template
        self.prompt_template = self._create_prompt_template()

        logger.info("Chat pipeline initialized")

    def _create_prompt_template(self) -> ChatPromptTemplate:
        """Create the chat prompt template."""
        template = """
You are FocusForge AI, a smart study assistant for students. Your role is to help students manage their tasks, maintain focus, and optimize their study schedule.

CONTEXT ABOUT THE STUDENT:
{context}

RECENT CONVERSATION HISTORY:
{chat_history}

Current task suggestions:
{task_suggestions}

Focus time recommendations:
{focus_advice}

USER'S CURRENT MESSAGE:
{user_message}

Based on the student's context, tasks, and study patterns, provide a helpful, encouraging response. Focus on:
1. Understanding their immediate needs
2. Providing practical suggestions for their current situation
3. Recommending specific actions they can take
4. Offering motivational support

Respond in a natural, conversational tone. Be specific and actionable.

Your response should include:
- A main response addressing their question or concern
- Specific suggested actions they can take right now
- Task recommendations based on their current workload and deadlines
- Advice about focus time and study scheduling
- A confidence score indicating how certain you are about your recommendations

Format your response as a JSON object with the following structure:
{format_instructions}
"""

        return ChatPromptTemplate(
            input_variables=[
                "context", "chat_history", "task_suggestions", "focus_advice", "user_message"
            ],
            input_types={
                "context": "str",
                "chat_history": "List[BaseMessage]",
                "task_suggestions": "str",
                "focus_advice": "str",
                "user_message": "str"
            },
            partial_variables={"format_instructions": self.response_parser.get_format_instructions()},
            template=template,
        )

    async def process_message(
        self,
        user_id: str,
        session_id: str,
        content: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process a user message and generate an AI response.

        Args:
            user_id: The user's ID
            session_id: The chat session ID
            content: The user's message content
            context: Additional context from the backend

        Returns:
            Dictionary containing the AI response and metadata
        """
        try:
            logger.info(f"Processing chat message for user {user_id}, session {session_id}")

            # Get or create memory for this session
            memory = self._get_or_create_memory(session_id)

            # Retrieve user context
            user_context = await self._retrieve_user_context(user_id, context)

            # Get chat history from memory
            chat_history = memory.chat_memory.messages

            # Generate task suggestions based on context
            task_suggestions = await self._generate_task_suggestions(user_context)

            # Generate focus advice
            focus_advice = await self._generate_focus_advice(user_context)

            # Create LLM chain
            llm = self.llm_service.get_llm()
            chain = LLMChain(llm=llm, prompt=self.prompt_template)

            # Generate response
            response = await chain.arun(
                context=user_context["context_text"],
                chat_history=self._format_chat_history(chat_history),
                task_suggestions=task_suggestions,
                focus_advice=focus_advice,
                user_message=content
            )

            # Parse the structured response
            parsed_response = self.response_parser.parse(response)

            # Save the exchange to memory
            memory.chat_memory.add_user_message(content)
            memory.chat_memory.add_ai_message(parsed_response["response"])

            # Create result
            result = {
                "response": parsed_response["response"],
                "suggested_actions": parsed_response.get("suggested_actions", []),
                "task_recommendations": parsed_response.get("task_recommendations", []),
                "focus_advice": parsed_response.get("focus_advice"),
                "confidence": parsed_response.get("confidence", 0.8),
                "context_used": {
                    "tasks_count": len(user_context.get("tasks", [])),
                    "focus_sessions_count": len(user_context.get("focus_sessions", [])),
                    "current_streak": user_context.get("current_streak", 0)
                },
                "timestamp": datetime.utcnow().isoformat(),
                "session_id": session_id,
                "user_id": user_id
            }

            logger.info(f"Generated response for user {user_id} (confidence: {result['confidence']:.2f})")
            return result

        except Exception as e:
            logger.error(f"Error processing chat message: {str(e)}")
            return self._create_error_response(str(e), user_id, session_id)

    def _get_or_create_memory(self, session_id: str) -> ConversationBufferMemory:
        """Get or create conversation memory for a session."""
        if session_id not in self.memory:
            self.memory[session_id] = ConversationBufferMemory(
                memory_key="chat_history",
                return_messages=True,
                max_token_limit=settings.chat_max_history * 50  # Approximate tokens per message
            )
        return self.memory[session_id]

    async def _retrieve_user_context(self, user_id: str, additional_context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Retrieve comprehensive context about the user."""
        try:
            # Get context from context retriever
            context_data = await self.context_retriever.get_user_context(user_id)

            # Add additional context from backend
            if additional_context:
                context_data.update(additional_context)

            # Format context as text for the prompt
            context_text = self._format_context_for_prompt(context_data)

            return {
                "context_data": context_data,
                "context_text": context_text,
                "tasks": context_data.get("tasks", []),
                "focus_sessions": context_data.get("focus_sessions", []),
                "current_streak": context_data.get("current_streak", 0),
                "weekly_stats": context_data.get("weekly_stats", {})
            }

        except Exception as e:
            logger.error(f"Error retrieving user context: {str(e)}")
            return self._get_default_context(user_id)

    def _format_context_for_prompt(self, context_data: Dict[str, Any]) -> str:
        """Format context data as text for the prompt."""
        parts = []

        # Tasks context
        tasks = context_data.get("tasks", [])
        if tasks:
            parts.append(f"Current Tasks ({len(tasks)}):")
            for task in tasks[:5]:  # Limit to top 5 tasks
                parts.append(f"  • {task.get('title', 'Untitled')} - {task.get('priority', 'MEDIUM')} priority")
                if task.get('deadline'):
                    parts.append(f"    Due: {task['deadline']}")
            if len(tasks) > 5:
                parts.append(f"  ... and {len(tasks) - 5} more tasks")

        # Focus stats
        focus_stats = context_data.get("weekly_stats", {})
        if focus_stats:
            parts.append("\nFocus Statistics:")
            parts.append(f"  • Weekly focus time: {focus_stats.get('total_focus_minutes', 0)} minutes")
            parts.append(f"  • Current streak: {context_data.get('current_streak', 0)} days")
            parts.append(f"  • Sessions completed: {focus_stats.get('total_sessions_count', 0)}")

        # Recent focus sessions
        recent_sessions = context_data.get("focus_sessions", [])[:3]
        if recent_sessions:
            parts.append("\nRecent Focus Sessions:")
            for session in recent_sessions:
                parts.append(f"  • {session.get('duration_minutes', 0)}min session ({session.get('focus_quality', 'MEDIUM')} quality)")

        return "\n".join(parts)

    def _format_chat_history(self, messages: List[BaseMessage]) -> str:
        """Format chat history for the prompt."""
        if not messages:
            return "No previous conversation history."

        formatted = []
        for message in messages[-10:]:  # Limit to last 10 messages
            if isinstance(message, HumanMessage):
                formatted.append(f"User: {message.content}")
            elif isinstance(message, AIMessage):
                formatted.append(f"Assistant: {message.content}")

        return "\n".join(formatted)

    async def _generate_task_suggestions(self, user_context: Dict[str, Any]) -> str:
        """Generate task suggestions based on user context."""
        tasks = user_context.get("tasks", [])

        if not tasks:
            return "No current tasks found."

        suggestions = []

        # Find urgent tasks
        urgent_tasks = [t for t in tasks if t.get("priority") == "URGENT"]
        if urgent_tasks:
            suggestions.append(f"URGENT: {len(urgent_tasks)} urgent tasks need immediate attention")

        # Find overdue tasks
        overdue_tasks = [t for t in tasks if t.get("overdue", False)]
        if overdue_tasks:
            suggestions.append(f"OVERDUE: {len(overdue_tasks)} tasks are past due")

        # High priority tasks due soon
        high_priority_tasks = [t for t in tasks if t.get("priority") == "HIGH" and t.get("deadline")]
        if high_priority_tasks:
            suggestions.append(f"HIGH PRIORITY: {len(high_priority_tasks)} high-priority tasks with deadlines")

        return "\n".join(suggestions) if suggestions else "All tasks appear to be on track."

    async def _generate_focus_advice(self, user_context: Dict[str, Any]) -> str:
        """Generate focus advice based on user context."""
        current_streak = user_context.get("current_streak", 0)
        weekly_stats = user_context.get("weekly_stats", {})

        advice_parts = []

        # Streak-based advice
        if current_streak >= 5:
            advice_parts.append(f"Great! You're on a {current_streak}-day focus streak! Keep it going.")
        elif current_streak == 0:
            advice_parts.append("Ready to start a new focus streak? Begin with a 25-minute session.")
        else:
            advice_parts.append(f"Good progress! You're on a {current_streak}-day streak.")

        # Time-based advice
        weekly_minutes = weekly_stats.get("total_focus_minutes", 0)
        if weekly_minutes < 300:  # Less than 5 hours
            advice_parts.append("Consider increasing your weekly study time for better results.")
        elif weekly_minutes > 1200:  # More than 20 hours
            advice_parts.append("Excellent focus time! Make sure to take adequate breaks.")

        return "\n".join(advice_parts) if advice_parts else "Keep up the good work!"

    def _get_default_context(self, user_id: str) -> Dict[str, Any]:
        """Get default context when retrieval fails."""
        return {
            "context_data": {},
            "context_text": "Unable to retrieve detailed user context.",
            "tasks": [],
            "focus_sessions": [],
            "current_streak": 0,
            "weekly_stats": {}
        }

    def _create_error_response(self, error_message: str, user_id: str, session_id: str) -> Dict[str, Any]:
        """Create an error response."""
        return {
            "response": "I apologize, but I encountered an error processing your message. Please try again.",
            "suggested_actions": ["Try rephrasing your question", "Contact support if the issue persists"],
            "task_recommendations": [],
            "focus_advice": "Focus on one task at a time and take regular breaks.",
            "confidence": 0.3,
            "error": error_message,
            "timestamp": datetime.utcnow().isoformat(),
            "session_id": session_id,
            "user_id": user_id
        }

    def clear_session_memory(self, session_id: str) -> None:
        """Clear memory for a specific session."""
        if session_id in self.memory:
            del self.memory[session_id]
            logger.info(f"Cleared memory for session {session_id}")

    def get_session_summary(self, session_id: str) -> Dict[str, Any]:
        """Get a summary of the current session."""
        if session_id not in self.memory:
            return {"session_id": session_id, "message_count": 0, "memory_empty": True}

        memory = self.memory[session_id]
        messages = memory.chat_memory.messages

        return {
            "session_id": session_id,
            "message_count": len(messages),
            "last_message_time": messages[-1].additional_kwargs.get("timestamp") if messages else None,
            "memory_empty": False
        }


# Global instance
chat_pipeline = ChatPipeline()