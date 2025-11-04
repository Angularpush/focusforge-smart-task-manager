"""
Natural Language Processing service for parsing task input.
Uses spaCy for NLP and dateparser for date extraction.
"""

import spacy
import dateparser
import re
import json
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, time, timedelta
import logging

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


class TaskParser:
    """Service for parsing natural language task input into structured data."""

    def __init__(self):
        """Initialize the NLP parser with spaCy model."""
        try:
            # Load spaCy model
            self.nlp = spacy.load(settings.spacy_model)
            logger.info(f"Loaded spaCy model: {settings.spacy_model}")
        except OSError:
            logger.warning(f"spaCy model {settings.spacy_model} not found, using basic parsing")
            self.nlp = None

        # Configure dateparser
        self.dateparser_settings = json.loads(settings.dateparser_settings)

        # Subject patterns for matching
        self.subject_patterns = {
            'math': [
                r'math', r'calculus', r'algebra', r'statistics', r'geometry',
                r'trigonometry', r'pre-calculus', r'linear algebra'
            ],
            'science': [
                r'biology', r'chemistry', r'physics', r'bio', r'chem', r'phys',
                r'lab', r'experiment'
            ],
            'computer science': [
                r'programming', r'coding', r'python', r'java', r'javascript',
                r'web dev', r'algorithm', r'data structure', r'database',
                r'computer science', r'cs'
            ],
            'history': [
                r'history', r'historic', r'war', r'ancient', r'modern',
                r'world war', r'civilization'
            ],
            'literature': [
                r'literature', r'book', r'novel', r'poetry', r'shakespeare',
                r'essay', r'writing', r'read'
            ],
            'languages': [
                r'spanish', r'french', r'german', r'italian', r'chinese',
                r'japanese', r'language', r'foreign'
            ],
            'art': [
                r'art', r'drawing', r'painting', r'sketch', r'design',
                r'portfolio', r'creative'
            ]
        }

        # Priority patterns
        self.priority_patterns = {
            'urgent': [
                r'urgent', r'asap', r'immediately', r'right away',
                r'as soon as possible', r'emergency', r'critical'
            ],
            'high': [
                r'high', r'important', r'soon', r'quickly', r'priority',
                r'must do', r'need to'
            ],
            'medium': [
                r'medium', r'regular', r'normal', r'standard'
            ],
            'low': [
                r'low', r'when.*time', r'eventually', r'sometime',
                r'can wait', r'not urgent'
            ]
        }

        # Duration patterns (in minutes)
        self.duration_patterns = {
            'short': [
                (r'\b(\d+)\s*min\b', 1),  # X minutes
                (r'\b(\d+)\s*minute\b', 1),
                (r'\bquick\b', 15),
                (r'\bbrief\b', 20),
            ],
            'medium': [
                (r'\b(\d+)\s*hour\b', 60),  # X hours
                (r'\b(\d+)\s*hr\b', 60),
                (r'\b(\d+)\s*h\b', 60),
            ],
            'long': [
                (r'\b(\d+)\s*hours?\b', 60),  # X hours (already covered)
            ]
        }

        logger.info("Task parser initialized successfully")

    def parse_task(self, natural_input: str) -> Dict[str, Any]:
        """
        Parse natural language task input into structured task data.

        Args:
            natural_input: Natural language task description

        Returns:
            Dictionary containing parsed task information
        """
        if not natural_input or not natural_input.strip():
            return self._create_default_response(natural_input, "Empty input")

        try:
            logger.info(f"Parsing task: {natural_input[:100]}...")

            # Clean and normalize input
            cleaned_input = self._clean_input(natural_input)

            # Extract entities
            title = self._extract_title(cleaned_input)
            description = self._extract_description(cleaned_input)
            deadline = self._extract_deadline(cleaned_input)
            priority = self._extract_priority(cleaned_input)
            subject = self._extract_subject(cleaned_input)
            estimated_duration = self._extract_duration(cleaned_input)
            tags = self._extract_tags(cleaned_input)

            # Calculate confidence score
            confidence = self._calculate_confidence({
                'deadline': deadline,
                'priority': priority,
                'subject': subject,
                'duration': estimated_duration
            })

            # Create response
            result = {
                'title': title,
                'description': description,
                'deadline': deadline.isoformat() if deadline else None,
                'priority': priority,
                'subject': subject,
                'estimated_duration_minutes': estimated_duration,
                'tags': tags,
                'confidence': confidence,
                'extracted_entities': {
                    'dates': [deadline.isoformat()] if deadline else [],
                    'priorities': [priority] if priority else [],
                    'subjects': [subject] if subject else [],
                    'durations': [estimated_duration] if estimated_duration else []
                },
                'suggestions': {
                    'best_time_to_start': self._suggest_start_time(deadline, priority),
                    'recommended_break_points': self._suggest_break_points(estimated_duration),
                    'estimated_difficulty': self._estimate_difficulty(title, description)
                }
            }

            logger.info(f"Task parsed successfully: {title} (confidence: {confidence:.2f})")
            return result

        except Exception as e:
            logger.error(f"Error parsing task: {str(e)}")
            return self._create_default_response(natural_input, f"Parsing error: {str(e)}")

    def _clean_input(self, text: str) -> str:
        """Clean and normalize input text."""
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text.strip())

        # Convert to lowercase for processing
        return text

    def _extract_title(self, text: str) -> str:
        """Extract the main task title from input."""
        if not self.nlp:
            # Basic title extraction without spaCy
            return text.split(',')[0].split(' by ')[0].split(' for ')[0].strip()

        # Process with spaCy
        doc = self.nlp(text)

        # Extract noun chunks as potential titles
        noun_chunks = list(doc.noun_chunks)

        if noun_chunks:
            # Use the first noun chunk as title, clean it up
            title = noun_chunks[0].text.strip()
            # Remove trailing particles
            title = re.sub(r'\b(for|by|in|on|at|to|from)\b$', '', title, flags=re.IGNORECASE).strip()
            return title.capitalize()

        # Fallback: first sentence or phrase
        sentences = list(doc.sents)
        if sentences:
            return sentences[0].text.strip()

        return text.strip()

    def _extract_description(self, text: str) -> Optional[str]:
        """Extract additional description details."""
        # If there's a comma or separator, everything after it might be description
        separators = [',', ';', '-', '|']
        for sep in separators:
            if sep in text:
                parts = text.split(sep, 1)
                if len(parts) > 1 and len(parts[1].strip()) > 10:
                    return parts[1].strip()

        return None

    def _extract_deadline(self, text: str) -> Optional[datetime]:
        """Extract deadline/due date from text."""
        # Common deadline patterns
        deadline_patterns = [
            r'by\s+(.+)',
            r'due\s+(.+)',
            r'before\s+(.+)',
            r'complete\s+by\s+(.+)',
            r'finish\s+by\s+(.+)',
            r'submit\s+by\s+(.+)',
            r'turn\s+in\s+by\s+(.+)'
        ]

        for pattern in deadline_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                date_text = match.group(1).strip()
                parsed_date = self._parse_date(date_text)
                if parsed_date:
                    return parsed_date

        # Check for specific date mentions
        date_match = re.search(r'\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b', text)
        if date_match:
            parsed_date = self._parse_date(date_match.group(1))
            if parsed_date:
                return parsed_date

        return None

    def _parse_date(self, date_text: str) -> Optional[datetime]:
        """Parse date text into datetime object."""
        try:
            parsed_date = dateparser.parse(
                date_text,
                settings=self.dateparser_settings
            )

            if parsed_date:
                # If no time specified, set to end of day (23:59)
                if parsed_date.time() == time(0, 0):
                    parsed_date = parsed_date.replace(hour=23, minute=59, second=59, microsecond=999999)

                return parsed_date

        except Exception as e:
            logger.debug(f"Could not parse date '{date_text}': {str(e)}")

        return None

    def _extract_priority(self, text: str) -> Optional[str]:
        """Extract priority from text."""
        text_lower = text.lower()

        for priority, patterns in self.priority_patterns.items():
            for pattern in patterns:
                if re.search(pattern, text_lower):
                    return priority.upper()

        return 'MEDIUM'  # Default priority

    def _extract_subject(self, text: str) -> Optional[str]:
        """Extract subject/course from text."""
        text_lower = text.lower()

        # Check for subject mentions
        for subject, patterns in self.subject_patterns.items():
            for pattern in patterns:
                if re.search(r'\b' + pattern + r'\b', text_lower):
                    return subject.title()

        # Look for course codes (e.g., CS101, MATH203)
        course_code_match = re.search(r'\b([A-Z]{2,4}\d{3})\b', text)
        if course_code_match:
            return course_code_match.group(1)

        return None

    def _extract_duration(self, text: str) -> Optional[int]:
        """Extract estimated duration in minutes."""
        text_lower = text.lower()

        # Check duration patterns
        for category, patterns in self.duration_patterns.items():
            for pattern, multiplier in patterns:
                match = re.search(pattern, text_lower)
                if match:
                    if isinstance(match, tuple):
                        # Pattern with captured number
                        number_match = match[0]
                        number = re.search(r'\d+', number_match)
                        if number:
                            return int(number.group()) * multiplier
                    else:
                        # Fixed duration pattern
                        return multiplier

        return None

    def _extract_tags(self, text: str) -> List[str]:
        """Extract tags from text."""
        tags = []

        # Common tag indicators
        tag_patterns = [
            r'#(\w+)',  # hashtags
            r'\[(\w+)\]',  # brackets
        ]

        for pattern in tag_patterns:
            matches = re.findall(pattern, text)
            tags.extend(matches)

        # Add priority as tag if mentioned
        if 'urgent' in text.lower():
            tags.append('urgent')
        if 'important' in text.lower():
            tags.append('important')

        return list(set(tags))  # Remove duplicates

    def _calculate_confidence(self, entities: Dict[str, Any]) -> float:
        """Calculate confidence score for the parsing result."""
        confidence = 0.5  # Base confidence

        # Increase confidence for successfully extracted entities
        if entities.get('deadline'):
            confidence += 0.2
        if entities.get('priority') and entities['priority'] != 'MEDIUM':
            confidence += 0.1
        if entities.get('subject'):
            confidence += 0.1
        if entities.get('duration'):
            confidence += 0.1

        return min(1.0, confidence)

    def _suggest_start_time(self, deadline: Optional[datetime], priority: str) -> Optional[datetime]:
        """Suggest best time to start the task."""
        if not deadline:
            return None

        now = datetime.now()
        hours_until_deadline = (deadline - now).total_seconds() / 3600

        # Urgent tasks: start now
        if priority == 'URGENT' or hours_until_deadline < 4:
            return now

        # High priority: start soon
        if priority == 'HIGH' or hours_until_deadline < 24:
            start_time = now.replace(hour=9, minute=0, second=0, microsecond=0)
            if start_time < now:
                start_time += timedelta(days=1)
            return start_time

        # Medium priority: start tomorrow morning
        start_time = now.replace(hour=9, minute=0, second=0, microsecond=0)
        start_time += timedelta(days=1)
        return start_time

    def _suggest_break_points(self, duration_minutes: Optional[int]) -> List[int]:
        """Suggest recommended break points for the task."""
        if not duration_minutes:
            return [30, 60]  # Default break points

        break_points = []

        # Suggest breaks every 45-60 minutes for longer tasks
        if duration_minutes > 60:
            break_points.append(45)
        if duration_minutes > 90:
            break_points.append(90)
        if duration_minutes > 120:
            break_points.append(120)

        return break_points or [30, 60]

    def _estimate_difficulty(self, title: str, description: Optional[str]) -> int:
        """Estimate task difficulty on a scale of 1-5."""
        text = f"{title} {description or ''}".lower()

        # Keywords indicating difficulty
        difficulty_keywords = {
            1: ['easy', 'simple', 'basic', 'quick', 'review', 'practice'],
            2: ['moderate', 'standard', 'regular', 'complete'],
            3: ['medium', 'challenging', 'complex'],
            4: ['hard', 'difficult', 'advanced', 'detailed'],
            5: ['very hard', 'extremely', 'intensive', 'comprehensive']
        }

        for difficulty, keywords in difficulty_keywords.items():
            for keyword in keywords:
                if keyword in text:
                    return difficulty

        # Base on length and complexity
        total_length = len(title) + (len(description) if description else 0)
        if total_length > 200:
            return 4
        elif total_length > 100:
            return 3
        elif total_length > 50:
            return 2
        else:
            return 1

    def _create_default_response(self, original_input: str, error_message: str) -> Dict[str, Any]:
        """Create a default response when parsing fails."""
        return {
            'title': original_input.strip(),
            'description': None,
            'deadline': None,
            'priority': 'MEDIUM',
            'subject': None,
            'estimated_duration_minutes': 60,
            'tags': [],
            'confidence': 0.3,
            'extracted_entities': {
                'dates': [],
                'priorities': ['MEDIUM'],
                'subjects': [],
                'durations': []
            },
            'suggestions': {
                'best_time_to_start': None,
                'recommended_break_points': [30, 60],
                'estimated_difficulty': 2
            },
            'parsing_error': error_message
        }


# Global instance
task_parser = TaskParser()