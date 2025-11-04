-- FocusForge Sessions Table Migration
-- Creates table for tracking focus sessions and study patterns

-- Create the sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    session_duration_minutes INTEGER NOT NULL CHECK (session_duration_minutes > 0 AND session_duration_minutes <= 480), -- Max 8 hours
    focus_quality VARCHAR(10) CHECK (focus_quality IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'MEDIUM',
    distractions_count INTEGER DEFAULT 0 CHECK (distractions_count >= 0),
    completed_task_id VARCHAR(50), -- Reference to MongoDB task ID
    notes TEXT,
    session_type VARCHAR(20) DEFAULT 'POMODORO' CHECK (session_type IN ('POMODORO', 'FREE_FORM', 'REVIEW', 'BREAK')),
    interruptions TEXT[], -- Array of interruption descriptions
    energy_level_before INTEGER CHECK (energy_level_before >= 1 AND energy_level_before <= 10),
    energy_level_after INTEGER CHECK (energy_level_after >= 1 AND energy_level_after <= 10),
    satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
    environment VARCHAR(50), -- 'home', 'library', 'cafe', etc.
    background_noise VARCHAR(50), -- 'silent', 'music', 'white_noise', etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_user_date ON sessions(user_id, session_date);
CREATE INDEX idx_sessions_date ON sessions(session_date);
CREATE INDEX idx_sessions_duration ON sessions(session_duration_minutes);
CREATE INDEX idx_sessions_quality ON sessions(focus_quality);
CREATE INDEX idx_sessions_type ON sessions(session_type);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);

-- Create composite index for common queries
CREATE INDEX idx_sessions_user_date_quality ON sessions(user_id, session_date, focus_quality);

-- Create trigger to automatically update updated_at timestamp
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE sessions IS 'Tracks focus/study sessions with detailed metrics for analytics';
COMMENT ON COLUMN sessions.id IS 'Primary key using UUID';
COMMENT ON COLUMN sessions.user_id IS 'Foreign key reference to users table';
COMMENT ON COLUMN sessions.session_date IS 'Date when the session occurred';
COMMENT ON COLUMN sessions.session_duration_minutes IS 'Actual duration of the focus session';
COMMENT ON COLUMN sessions.focus_quality IS 'Self-assessed quality: LOW, MEDIUM, or HIGH';
COMMENT ON COLUMN sessions.distractions_count IS 'Number of distractions during the session';
COMMENT ON COLUMN sessions.completed_task_id IS 'Reference to MongoDB task ID if session was task-focused';
COMMENT ON COLUMN sessions.session_type IS 'Type of study session';
COMMENT ON COLUMN sessions.interruptions IS 'Array of interruption descriptions';
COMMENT ON COLUMN sessions.energy_level_before IS 'Self-rated energy before session (1-10)';
COMMENT ON COLUMN sessions.energy_level_after IS 'Self-rated energy after session (1-10)';
COMMENT ON COLUMN sessions.satisfaction_rating IS 'Self-rated satisfaction (1-5 stars)';
COMMENT ON COLUMN sessions.environment IS 'Study environment location';
COMMENT ON COLUMN sessions.background_noise IS 'Background noise type during session';