-- FocusForge Users Table Migration
-- Creates the main users table with authentication and profile information

-- Create the users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    academic_level VARCHAR(20) CHECK (academic_level IN ('HIGH_SCHOOL', 'UNDERGRADUATE', 'GRADUATE')) DEFAULT 'UNDERGRADUATE',
    major VARCHAR(100),
    weekly_study_goal_hours INTEGER DEFAULT 20 CHECK (weekly_study_goal_hours > 0 AND weekly_study_goal_hours <= 168),
    timezone VARCHAR(50) DEFAULT 'UTC',
    preferences JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_academic_level ON users(academic_level);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_login ON users(last_login_at) WHERE last_login_at IS NOT NULL;

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE users IS 'Core user table storing authentication and academic profile information';
COMMENT ON COLUMN users.id IS 'Primary key using UUID for better security and scalability';
COMMENT ON COLUMN users.firebase_uid IS 'Unique identifier from Firebase Authentication';
COMMENT ON COLUMN users.email IS 'User email address (unique across all users)';
COMMENT ON COLUMN users.academic_level IS 'Academic level: HIGH_SCHOOL, UNDERGRADUATE, or GRADUATE';
COMMENT ON COLUMN users.weekly_study_goal_hours IS 'Target study hours per week for goal tracking';
COMMENT ON COLUMN users.preferences IS 'JSON object storing user preferences and settings';
COMMENT ON COLUMN users.is_active IS 'Flag for soft deletes and account status';