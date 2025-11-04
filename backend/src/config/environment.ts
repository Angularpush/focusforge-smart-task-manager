import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  HOST: z.string().default('localhost'),

  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('7d'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  // Database Configuration
  POSTGRES_URL: z.string().url('Invalid PostgreSQL URL'),
  POSTGRES_USER: z.string().default('focusforge'),
  POSTGRES_PASSWORD: z.string().default('dev_password_123'),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.string().transform(Number).default('5432'),
  POSTGRES_DB: z.string().default('focusforge'),

  // MongoDB Configuration
  MONGODB_URL: z.string().url('Invalid MongoDB URL'),
  MONGODB_HOST: z.string().default('localhost'),
  MONGODB_PORT: z.string().transform(Number).default('27017'),
  MONGODB_DATABASE: z.string().default('focusforge'),
  MONGODB_USER: z.string().default('focusforge'),
  MONGODB_PASSWORD: z.string().default('dev_password_123'),

  // Redis Configuration
  REDIS_URL: z.string().url('Invalid Redis URL'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().default('dev_password_123'),
  REDIS_DB: z.string().transform(Number).default('0'),

  // Firebase Configuration
  FIREBASE_ADMIN_KEY: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),

  // AI Service Configuration
  AI_SERVICE_URL: z.string().url('Invalid AI service URL').default('http://localhost:8000'),
  AI_SERVICE_API_KEY: z.string().optional(),
  AI_SERVICE_TIMEOUT: z.string().transform(Number).default('30000'),

  // OpenAI Configuration
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-3.5-turbo'),
  OPENAI_MAX_TOKENS: z.string().transform(Number).default('1000'),
  OPENAI_TEMPERATURE: z.string().transform(Number).default('0.7'),

  // Ollama Configuration
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('mistral'),
  OLLAMA_ENABLED: z.string().transform(val => val === 'true').default('false'),

  // Vector Database Configuration
  PINECONE_API_KEY: z.string().optional(),
  PINECONE_ENVIRONMENT: z.string().optional(),
  PINECONE_INDEX_NAME: z.string().default('focusforge'),

  // CORS Configuration
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CORS_CREDENTIALS: z.string().transform(val => val === 'true').default('true'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS: z.string().transform(val => val === 'true').default('false'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
  LOG_FILE_ENABLED: z.string().transform(val => val === 'true').default('true'),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),

  // Security
  BCRYPT_ROUNDS: z.string().transform(Number).default('12'),
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),
  COOKIE_SECRET: z.string().min(32, 'Cookie secret must be at least 32 characters'),

  // Application Settings
  APP_NAME: z.string().default('FocusForge'),
  APP_VERSION: z.string().default('1.0.0'),
  APP_URL: z.string().default('http://localhost:3001'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Email Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Monitoring
  HEALTH_CHECK_ENABLED: z.string().transform(val => val === 'true').default('true'),
  METRICS_ENABLED: z.string().transform(val => val === 'true').default('true'),
  PROFILING_ENABLED: z.string().transform(val => val === 'true').default('false'),

  // Development Settings
  DEV_SEED_DATA: z.string().transform(val => val === 'true').default('true'),
  DEV_MOCK_AI: z.string().transform(val => val === 'true').default('false'),
  DEV_DISABLE_AUTH: z.string().transform(val => val === 'true').default('false'),
});

// Validate and parse environment variables
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach(err => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

// Export validated environment configuration
export const config = validateEnv();

// Export convenience getters
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

// Database connection strings
export const postgresConfig = {
  url: config.POSTGRES_URL,
  host: config.POSTGRES_HOST,
  port: config.POSTGRES_PORT,
  database: config.POSTGRES_DB,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
};

export const mongodbConfig = {
  url: config.MONGODB_URL,
  host: config.MONGODB_HOST,
  port: config.MONGODB_PORT,
  database: config.MONGODB_DATABASE,
  user: config.MONGODB_USER,
  password: config.MONGODB_PASSWORD,
};

export const redisConfig = {
  url: config.REDIS_URL,
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
  db: config.REDIS_DB,
};

// Export the config for use in other modules
export default config;