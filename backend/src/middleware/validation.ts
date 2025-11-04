import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { ValidationError } from '../types';

// Handle validation errors
export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const validationError = new ValidationError('Validation failed');
    validationError.context = {
      errors: errors.array().map(error => ({
        field: error.type === 'field' ? error.path : 'unknown',
        message: error.msg,
        value: error.value,
      })),
    };

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: validationError.context?.errors,
      },
    });
  }

  next();
}

// Common validation chains
export const validation = {
  // User authentication
  register: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    body('displayName')
      .isLength({ min: 2, max: 50 })
      .withMessage('Display name must be between 2 and 50 characters'),
    body('academicLevel')
      .isIn(['HIGH_SCHOOL', 'UNDERGRADUATE', 'GRADUATE'])
      .withMessage('Academic level must be HIGH_SCHOOL, UNDERGRADUATE, or GRADUATE'),
    body('major')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Major must be less than 100 characters'),
    body('weeklyStudyGoalHours')
      .optional()
      .isInt({ min: 1, max: 168 })
      .withMessage('Weekly study goal must be between 1 and 168 hours'),
    body('timezone')
      .optional()
      .matches(/^[A-Za-z_\/]+$/)
      .withMessage('Invalid timezone format'),
  ],

  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
  ],

  // Task management
  createTask: [
    body('naturalLanguageInput')
      .optional()
      .isLength({ min: 3, max: 500 })
      .withMessage('Natural language input must be between 3 and 500 characters'),
    body('title')
      .optional()
      .isLength({ min: 3, max: 200 })
      .withMessage('Title must be between 3 and 200 characters'),
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('subject')
      .optional()
      .isUUID()
      .withMessage('Subject must be a valid UUID'),
    body('deadline')
      .optional()
      .isISO8601()
      .withMessage('Deadline must be a valid date'),
    body('priority')
      .optional()
      .isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
      .withMessage('Priority must be LOW, MEDIUM, HIGH, or URGENT'),
    body('estimatedDurationMinutes')
      .optional()
      .isInt({ min: 5, max: 480 })
      .withMessage('Estimated duration must be between 5 and 480 minutes'),
  ],

  updateTask: [
    body('title')
      .optional()
      .isLength({ min: 3, max: 200 })
      .withMessage('Title must be between 3 and 200 characters'),
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('subject')
      .optional()
      .isUUID()
      .withMessage('Subject must be a valid UUID'),
    body('deadline')
      .optional()
      .isISO8601()
      .withMessage('Deadline must be a valid date'),
    body('priority')
      .optional()
      .isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
      .withMessage('Priority must be LOW, MEDIUM, HIGH, or URGENT'),
    body('status')
      .optional()
      .isIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
      .withMessage('Status must be PENDING, IN_PROGRESS, COMPLETED, or CANCELLED'),
    body('estimatedDurationMinutes')
      .optional()
      .isInt({ min: 5, max: 480 })
      .withMessage('Estimated duration must be between 5 and 480 minutes'),
  ],

  // Focus sessions
  startFocusSession: [
    body('taskId')
      .optional()
      .isUUID()
      .withMessage('Task ID must be a valid UUID'),
    body('durationMinutes')
      .isInt({ min: 5, max: 480 })
      .withMessage('Duration must be between 5 and 480 minutes'),
    body('focusMode')
      .isIn(['POMODORO', 'FREE_FORM'])
      .withMessage('Focus mode must be POMODORO or FREE_FORM'),
  ],

  endFocusSession: [
    body('actualDurationMinutes')
      .isInt({ min: 1, max: 480 })
      .withMessage('Actual duration must be between 1 and 480 minutes'),
    body('focusQuality')
      .isIn(['LOW', 'MEDIUM', 'HIGH'])
      .withMessage('Focus quality must be LOW, MEDIUM, or HIGH'),
    body('distractionsCount')
      .isInt({ min: 0, max: 100 })
      .withMessage('Distractions count must be between 0 and 100'),
    body('notes')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Notes must be less than 500 characters'),
    body('energyLevelBefore')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Energy level must be between 1 and 10'),
    body('energyLevelAfter')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Energy level must be between 1 and 10'),
    body('satisfactionRating')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Satisfaction rating must be between 1 and 5'),
    body('environment')
      .optional()
      .isLength({ max: 50 })
      .withMessage('Environment must be less than 50 characters'),
    body('backgroundNoise')
      .optional()
      .isLength({ max: 50 })
      .withMessage('Background noise must be less than 50 characters'),
  ],

  // Subjects
  createSubject: [
    body('name')
      .isLength({ min: 2, max: 100 })
      .withMessage('Subject name must be between 2 and 100 characters'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('colorCode')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('Color code must be a valid hex color'),
    body('courseCode')
      .optional()
      .isLength({ max: 20 })
      .withMessage('Course code must be less than 20 characters'),
    body('instructor')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Instructor name must be less than 100 characters'),
    body('semester')
      .optional()
      .isLength({ max: 20 })
      .withMessage('Semester must be less than 20 characters'),
    body('credits')
      .optional()
      .isInt({ min: 0, max: 10 })
      .withMessage('Credits must be between 0 and 10'),
    body('difficultyLevel')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Difficulty level must be between 1 and 5'),
    body('priorityWeight')
      .optional()
      .isFloat({ min: 0.1, max: 5.0 })
      .withMessage('Priority weight must be between 0.1 and 5.0'),
  ],

  updateSubject: [
    body('name')
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage('Subject name must be between 2 and 100 characters'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('colorCode')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('Color code must be a valid hex color'),
    body('courseCode')
      .optional()
      .isLength({ max: 20 })
      .withMessage('Course code must be less than 20 characters'),
    body('instructor')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Instructor name must be less than 100 characters'),
    body('semester')
      .optional()
      .isLength({ max: 20 })
      .withMessage('Semester must be less than 20 characters'),
    body('credits')
      .optional()
      .isInt({ min: 0, max: 10 })
      .withMessage('Credits must be between 0 and 10'),
    body('difficultyLevel')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Difficulty level must be between 1 and 5'),
    body('priorityWeight')
      .optional()
      .isFloat({ min: 0.1, max: 5.0 })
      .withMessage('Priority weight must be between 0.1 and 5.0'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
  ],

  // Query parameters
  taskId: [
    param('taskId')
      .isUUID()
      .withMessage('Task ID must be a valid UUID'),
  ],

  sessionId: [
    param('sessionId')
      .isUUID()
      .withMessage('Session ID must be a valid UUID'),
  ],

  subjectId: [
    param('subjectId')
      .isUUID()
      .withMessage('Subject ID must be a valid UUID'),
  ],

  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],

  dateRange: [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid date'),
  ],

  sorting: [
    query('sortBy')
      .optional()
      .isIn(['deadline', 'priority', 'created', 'ai_score', 'title'])
      .withMessage('Sort field is invalid'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc'),
  ],

  taskFilters: [
    query('status')
      .optional()
      .isIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
      .withMessage('Status filter is invalid'),
    query('subject')
      .optional()
      .isUUID()
      .withMessage('Subject filter must be a valid UUID'),
    query('search')
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage('Search term must be between 2 and 100 characters'),
  ],

  focusStatsPeriod: [
    query('period')
      .optional()
      .isIn(['DAY', 'WEEK', 'MONTH'])
      .withMessage('Period must be DAY, WEEK, or MONTH'),
  ],
};

// Custom validation functions
export const customValidators = {
  // Validate that deadline is in the future
  isFutureDate: (value: string) => {
    const date = new Date(value);
    return date > new Date();
  },

  // Validate that duration is reasonable
  isValidDuration: (value: number) => {
    return value >= 5 && value <= 480; // 5 minutes to 8 hours
  },

  // Validate hex color
  isHexColor: (value: string) => {
    return /^#[0-9A-Fa-f]{6}$/.test(value);
  },

  // Validate timezone
  isValidTimezone: (value: string) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
};

// Helper to create validation middleware
export function validate(validations: ValidationChain[]) {
  return [...validations, handleValidationErrors];
}

export default {
  handleValidationErrors,
  validation,
  customValidators,
  validate,
};