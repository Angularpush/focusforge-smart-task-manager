import { Request } from 'express';
import { User } from './database';

// JWT Payload
export interface JwtPayload {
  userId: string;
  email: string;
  firebaseUid: string;
  iat: number;
  exp: number;
}

// Authenticated Request (extends Express Request)
export interface AuthenticatedRequest extends Request {
  user?: User;
  token?: string;
}

// Firebase Auth Types
export interface FirebaseUser {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
  photoURL?: string;
  customClaims?: Record<string, any>;
}

export interface FirebaseToken {
  uid: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  iss: string;
  aud: string;
  auth_time: number;
  sub: string;
  iat: number;
  exp: number;
}

// Auth Service Types
export interface AuthService {
  // Firebase operations
  verifyIdToken(idToken: string): Promise<FirebaseToken>;
  createFirebaseUser(email: string, password: string, displayName?: string): Promise<FirebaseUser>;
  updateFirebaseUser(uid: string, updates: any): Promise<FirebaseUser>;
  deleteFirebaseUser(uid: string): Promise<void>;

  // JWT operations
  generateJwtToken(user: User): Promise<string>;
  verifyJwtToken(token: string): Promise<JwtPayload>;
  refreshJwtToken(refreshToken: string): Promise<string>;

  // User operations
  createUser(userData: any): Promise<User>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(userId: string, updates: any): Promise<User>;
  deactivateUser(userId: string): Promise<void>;
}

// Auth Middleware Types
export interface AuthMiddlewareOptions {
  required?: boolean;
  roles?: string[];
  permissions?: string[];
}

// Auth Context Types
export interface AuthContext {
  user: User;
  token: string;
  permissions: string[];
  roles: string[];
}

// Session Types
export interface SessionData {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  loginTime: Date;
  lastActivity: Date;
}

// Token Types
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenData {
  userId: string;
  tokenId: string;
  expiresAt: Date;
  isRevoked: boolean;
}

// Permission Types
export enum Permission {
  // Task permissions
  READ_TASKS = 'read:tasks',
  CREATE_TASKS = 'create:tasks',
  UPDATE_TASKS = 'update:tasks',
  DELETE_TASKS = 'delete:tasks',

  // Focus session permissions
  READ_SESSIONS = 'read:sessions',
  CREATE_SESSIONS = 'create:sessions',
  UPDATE_SESSIONS = 'update:sessions',
  DELETE_SESSIONS = 'delete:sessions',

  // Chat permissions
  READ_CHAT = 'read:chat',
  SEND_CHAT = 'send:chat',

  // Analytics permissions
  READ_ANALYTICS = 'read:analytics',

  // User management permissions
  READ_PROFILE = 'read:profile',
  UPDATE_PROFILE = 'update:profile',
  DELETE_ACCOUNT = 'delete:account',

  // Admin permissions
  MANAGE_USERS = 'manage:users',
  MANAGE_SYSTEM = 'manage:system',
  VIEW_LOGS = 'view:logs',
}

// Role Types
export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}

// Role-Permission Mapping
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.USER]: [
    Permission.READ_TASKS,
    Permission.CREATE_TASKS,
    Permission.UPDATE_TASKS,
    Permission.DELETE_TASKS,
    Permission.READ_SESSIONS,
    Permission.CREATE_SESSIONS,
    Permission.UPDATE_SESSIONS,
    Permission.DELETE_SESSIONS,
    Permission.READ_CHAT,
    Permission.SEND_CHAT,
    Permission.READ_ANALYTICS,
    Permission.READ_PROFILE,
    Permission.UPDATE_PROFILE,
    Permission.DELETE_ACCOUNT,
  ],
  [Role.MODERATOR]: [
    ...Object.values(Permission),
  ],
  [Role.ADMIN]: [
    ...Object.values(Permission),
  ],
};

// Auth Configuration Types
export interface AuthConfig {
  jwtSecret: string;
  jwtExpiry: string;
  refreshTokenExpiry: string;
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  sessionTimeout: number;
}

// Auth Error Types
export class AuthError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class InvalidTokenError extends AuthError {
  constructor(message: string = 'Invalid token') {
    super(message, 'INVALID_TOKEN', 401);
  }
}

export class ExpiredTokenError extends AuthError {
  constructor(message: string = 'Token expired') {
    super(message, 'TOKEN_EXPIRED', 401);
  }
}

export class InsufficientPermissionsError extends AuthError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'INSUFFICIENT_PERMISSIONS', 403);
  }
}

export class UserNotFoundError extends AuthError {
  constructor(message: string = 'User not found') {
    super(message, 'USER_NOT_FOUND', 404);
  }
}

export class UserAlreadyExistsError extends AuthError {
  constructor(message: string = 'User already exists') {
    super(message, 'USER_ALREADY_EXISTS', 409);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message: string = 'Invalid credentials') {
    super(message, 'INVALID_CREDENTIALS', 401);
  }
}

export class AccountLockedError extends AuthError {
  constructor(message: string = 'Account locked') {
    super(message, 'ACCOUNT_LOCKED', 423);
  }
}

export class EmailNotVerifiedError extends AuthError {
  constructor(message: string = 'Email not verified') {
    super(message, 'EMAIL_NOT_VERIFIED', 403);
  }
}