import admin from 'firebase-admin';
import { config } from './environment';
import { logger } from '../utils/logger';

let firebaseApp: admin.app.App;
let firebaseAuth: admin.auth.Auth;

export function initializeFirebase(): void {
  try {
    if (!config.FIREBASE_ADMIN_KEY || !config.FIREBASE_PROJECT_ID) {
      logger.warn('Firebase configuration missing. Firebase features will be disabled.');
      return;
    }

    // Parse the Firebase admin key (it's stored as a JSON string)
    let serviceAccountKey;
    try {
      serviceAccountKey = JSON.parse(config.FIREBASE_ADMIN_KEY);
    } catch (parseError) {
      throw new Error('Invalid FIREBASE_ADMIN_KEY format. Must be valid JSON string.');
    }

    // Check if Firebase app is already initialized
    if (admin.apps.length > 0) {
      logger.info('Firebase app already initialized');
      firebaseApp = admin.apps[0]!;
      firebaseAuth = firebaseApp.auth();
      return;
    }

    // Initialize Firebase Admin SDK
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccountKey as admin.ServiceAccount),
      projectId: config.FIREBASE_PROJECT_ID,
    });

    firebaseAuth = firebaseApp.auth();

    logger.info('Firebase Admin SDK initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Firebase:', error);
    throw error;
  }
}

export function getFirebaseAuth(): admin.auth.Auth {
  if (!firebaseAuth) {
    throw new Error('Firebase Auth not initialized. Call initializeFirebase() first.');
  }
  return firebaseAuth;
}

export function getFirebaseApp(): admin.app.App {
  if (!firebaseApp) {
    throw new Error('Firebase app not initialized. Call initializeFirebase() first.');
  }
  return firebaseApp;
}

// Firebase token verification
export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  try {
    const auth = getFirebaseAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    logger.error('Firebase token verification failed:', error);
    throw new Error('Invalid or expired Firebase token');
  }
}

// Firebase user management
export async function getFirebaseUser(uid: string): Promise<admin.auth.UserRecord> {
  try {
    const auth = getFirebaseAuth();
    const userRecord = await auth.getUser(uid);
    return userRecord;
  } catch (error) {
    logger.error(`Failed to get Firebase user ${uid}:`, error);
    throw error;
  }
}

export async function createFirebaseUser(
  email: string,
  password: string,
  displayName?: string
): Promise<admin.auth.UserRecord> {
  try {
    const auth = getFirebaseAuth();
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });

    logger.info(`Created Firebase user: ${userRecord.uid}`);
    return userRecord;
  } catch (error) {
    logger.error(`Failed to create Firebase user ${email}:`, error);
    throw error;
  }
}

export async function updateFirebaseUser(
  uid: string,
  updates: admin.auth.UpdateRequest
): Promise<admin.auth.UserRecord> {
  try {
    const auth = getFirebaseAuth();
    const userRecord = await auth.updateUser(uid, updates);

    logger.info(`Updated Firebase user: ${uid}`);
    return userRecord;
  } catch (error) {
    logger.error(`Failed to update Firebase user ${uid}:`, error);
    throw error;
  }
}

export async function deleteFirebaseUser(uid: string): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    await auth.deleteUser(uid);

    logger.info(`Deleted Firebase user: ${uid}`);
  } catch (error) {
    logger.error(`Failed to delete Firebase user ${uid}:`, error);
    throw error;
  }
}

export async function disableFirebaseUser(uid: string): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    await auth.updateUser(uid, { disabled: true });

    logger.info(`Disabled Firebase user: ${uid}`);
  } catch (error) {
    logger.error(`Failed to disable Firebase user ${uid}:`, error);
    throw error;
  }
}

export async function enableFirebaseUser(uid: string): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    await auth.updateUser(uid, { disabled: false });

    logger.info(`Enabled Firebase user: ${uid}`);
  } catch (error) {
    logger.error(`Failed to enable Firebase user ${uid}:`, error);
    throw error;
  }
}

// Firebase email verification
export async function sendEmailVerification(uid: string): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    const link = await auth.generateEmailVerificationLink(
      'student@example.com', // This should be the user's actual email
      {
        url: `${config.FRONTEND_URL}/login`,
        handleCodeInApp: false,
      }
    );

    // In a real implementation, you would send this email via your email service
    logger.info(`Email verification link generated for user ${uid}: ${link}`);

    // TODO: Send email using your email service (SMTP, SendGrid, etc.)
  } catch (error) {
    logger.error(`Failed to send email verification for user ${uid}:`, error);
    throw error;
  }
}

// Firebase password reset
export async function sendPasswordResetEmail(email: string): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    const link = await auth.generatePasswordResetLink(email, {
      url: `${config.FRONTEND_URL}/reset-password`,
      handleCodeInApp: false,
    });

    // In a real implementation, you would send this email via your email service
    logger.info(`Password reset link generated for ${email}: ${link}`);

    // TODO: Send email using your email service (SMTP, SendGrid, etc.)
  } catch (error) {
    logger.error(`Failed to send password reset email for ${email}:`, error);
    throw error;
  }
}

// Custom token generation (for server-side authentication)
export async function createCustomToken(uid: string, additionalClaims?: object): Promise<string> {
  try {
    const auth = getFirebaseAuth();
    const customToken = await auth.createCustomToken(uid, additionalClaims);
    return customToken;
  } catch (error) {
    logger.error(`Failed to create custom token for user ${uid}:`, error);
    throw error;
  }
}

// Check if Firebase is configured
export function isFirebaseConfigured(): boolean {
  return !!(config.FIREBASE_ADMIN_KEY && config.FIREBASE_PROJECT_ID);
}

// Health check
export async function checkFirebaseHealth(): Promise<boolean> {
  try {
    if (!isFirebaseConfigured()) {
      return false;
    }

    // Try to get a list of users (limit 1) to test connection
    const auth = getFirebaseAuth();
    await auth.listUsers(1);
    return true;
  } catch (error) {
    logger.error('Firebase health check failed:', error);
    return false;
  }
}

export default {
  initializeFirebase,
  getFirebaseAuth,
  getFirebaseApp,
  verifyFirebaseToken,
  getFirebaseUser,
  createFirebaseUser,
  updateFirebaseUser,
  deleteFirebaseUser,
  disableFirebaseUser,
  enableFirebaseUser,
  sendEmailVerification,
  sendPasswordResetEmail,
  createCustomToken,
  isFirebaseConfigured,
  checkFirebaseHealth,
};