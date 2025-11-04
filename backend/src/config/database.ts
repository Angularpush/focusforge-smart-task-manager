import { Pool, PoolClient } from 'pg';
import mongoose from 'mongoose';
import { postgresConfig, mongodbConfig, isDevelopment } from './environment';
import { logger } from '../utils/logger';

// PostgreSQL connection pool
let pgPool: Pool;

export async function connectPostgres(): Promise<Pool> {
  try {
    logger.info('Connecting to PostgreSQL...');

    pgPool = new Pool({
      ...postgresConfig,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30s
      connectionTimeoutMillis: 2000, // Return an error after 2s if connection not established
    });

    // Test the connection
    const client = await pgPool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('PostgreSQL connected successfully');

    // Handle pool errors
    pgPool.on('error', (err) => {
      logger.error('PostgreSQL pool error:', err);
    });

    return pgPool;
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL:', error);
    throw error;
  }
}

export function getPostgresPool(): Pool {
  if (!pgPool) {
    throw new Error('PostgreSQL pool not initialized. Call connectPostgres() first.');
  }
  return pgPool;
}

export async function disconnectPostgres(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    logger.info('PostgreSQL disconnected');
  }
}

// MongoDB connection
let mongoConnection: typeof mongoose;

export async function connectMongoDB(): Promise<typeof mongoose> {
  try {
    logger.info('Connecting to MongoDB...');

    const mongoOptions = {
      maxPoolSize: 10, // Maximum number of socket connections
      serverSelectionTimeoutMS: 5000, // How long to try selecting a server before giving up
      socketTimeoutMS: 45000, // How long a send or receive on a socket can take before timing out
      bufferMaxEntries: 0, // Disable mongoose buffering
      bufferCommands: false, // Disable mongoose buffering
    };

    await mongoose.connect(mongodbConfig.url, mongoOptions);
    mongoConnection = mongoose;

    logger.info('MongoDB connected successfully');

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    return mongoose;
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export function getMongoConnection(): typeof mongoose {
  if (!mongoConnection) {
    throw new Error('MongoDB connection not initialized. Call connectMongoDB() first.');
  }
  return mongoConnection;
}

export async function disconnectMongoDB(): Promise<void> {
  if (mongoConnection) {
    await mongoConnection.disconnect();
    logger.info('MongoDB disconnected');
  }
}

// Health check functions
export async function checkPostgresHealth(): Promise<boolean> {
  try {
    const client = await pgPool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    logger.error('PostgreSQL health check failed:', error);
    return false;
  }
}

export async function checkMongoDBHealth(): Promise<boolean> {
  try {
    const state = mongoose.connection.readyState;
    return state === 1; // 1 = connected
  } catch (error) {
    logger.error('MongoDB health check failed:', error);
    return false;
  }
}

// Transaction helper for PostgreSQL
export async function withPostgresTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Initialize all database connections
export async function initializeDatabases(): Promise<void> {
  try {
    await Promise.all([
      connectPostgres(),
      connectMongoDB(),
    ]);

    logger.info('All databases connected successfully');
  } catch (error) {
    logger.error('Failed to initialize databases:', error);
    throw error;
  }
}

// Close all database connections
export async function closeDatabases(): Promise<void> {
  try {
    await Promise.all([
      disconnectPostgres(),
      disconnectMongoDB(),
    ]);

    logger.info('All databases disconnected successfully');
  } catch (error) {
    logger.error('Failed to close databases:', error);
    throw error;
  }
}

// Graceful shutdown handler
export function setupDatabaseGracefulShutdown(): void {
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, closing database connections...`);

    try {
      await closeDatabases();
      logger.info('Database connections closed, exiting...');
      process.exit(0);
    } catch (error) {
      logger.error('Error during database shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  if (isDevelopment) {
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon
  }
}