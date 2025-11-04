-- FocusForge Subjects Table Migration
-- Creates table for managing subjects/courses with user-specific customizations

-- Create the subjects table
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color_code VARCHAR(7) DEFAULT '#3b82f6' CHECK (color_code ~ '^#[0-9A-Fa-f]{6}$'), -- Hex color validation
    course_code VARCHAR(20), -- e.g., "CS101", "MATH203"
    instructor VARCHAR(100),
    semester VARCHAR(20), -- e.g., "Fall 2024", "Spring 2024"
    credits INTEGER CHECK (credits >= 0 AND credits <= 10),
    difficulty_level INTEGER CHECK (difficulty_level >= 1 AND difficulty_level <= 5) DEFAULT 3,
    priority_weight DECIMAL(3,2) DEFAULT 1.0 CHECK (priority_weight >= 0.1 AND priority_weight <= 5.0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint: user cannot have duplicate subject names
    UNIQUE(user_id, name)
);

-- Create indexes for performance
CREATE INDEX idx_subjects_user_id ON subjects(user_id);
CREATE INDEX idx_subjects_name ON subjects(name);
CREATE INDEX idx_subjects_active ON subjects(user_id, is_active);
CREATE INDEX idx_subjects_priority ON subjects(user_id, priority_weight DESC);
CREATE INDEX idx_subjects_difficulty ON subjects(user_id, difficulty_level);
CREATE INDEX idx_subjects_semester ON subjects(user_id, semester);
CREATE INDEX idx_subjects_created_at ON subjects(created_at);

-- Create trigger to automatically update updated_at timestamp
CREATE TRIGGER update_subjects_updated_at
    BEFORE UPDATE ON subjects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert some default subjects for development (optional)
-- These would typically be created by users through the UI
DO $$
DECLARE
    default_subjects JSON[] := ARRAY[
        '{"name": "Mathematics", "description": "Calculus, Algebra, Statistics", "color_code": "#3b82f6", "difficulty_level": 4, "priority_weight": 1.2}',
        '{"name": "Computer Science", "description": "Programming, Algorithms, Data Structures", "color_code": "#10b981", "difficulty_level": 3, "priority_weight": 1.0}',
        '{"name": "Physics", "description": "Mechanics, Thermodynamics, Electromagnetism", "color_code": "#f59e0b", "difficulty_level": 4, "priority_weight": 1.1}',
        '{"name": "Chemistry", "description": "Organic, Inorganic, Physical Chemistry", "color_code": "#8b5cf6", "difficulty_level": 3, "priority_weight": 1.0}',
        '{"name": "Biology", "description": "Molecular, Cellular, Organismal Biology", "color_code": "#22c55e", "difficulty_level": 3, "priority_weight": 1.0}',
        '{"name": "History", "description": "World History, Civilizations, Historical Analysis", "color_code": "#f97316", "difficulty_level": 2, "priority_weight": 0.8}',
        '{"name": "Literature", "description": "Classic Literature, Poetry, Critical Analysis", "color_code": "#ec4899", "difficulty_level": 2, "priority_weight": 0.9}',
        '{"name": "Economics", "description": "Microeconomics, Macroeconomics, Financial Theory", "color_code": "#06b6d4", "difficulty_level": 3, "priority_weight": 1.1}'
    ];
BEGIN
    -- Only insert default subjects if the table is empty and we're in development
    IF (SELECT COUNT(*) FROM subjects) = 0 AND current_setting('application_name', true) = 'focusforge_dev' THEN
        -- Note: These would need a real user_id in production
        -- For now, we'll skip auto-insertion and let the frontend handle subject creation
        RAISE NOTICE 'Development mode detected. Default subjects can be created via the frontend.';
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE subjects IS 'User-defined subjects/courses with customizable properties';
COMMENT ON COLUMN subjects.id IS 'Primary key using UUID';
COMMENT ON COLUMN subjects.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN subjects.name IS 'Subject name (unique per user)';
COMMENT ON COLUMN subjects.color_code IS 'Hex color code for UI display';
COMMENT ON COLUMN subjects.course_code IS 'Official course identifier';
COMMENT ON COLUMN subjects.instructor IS 'Course instructor name';
COMMENT ON COLUMN subjects.semester IS 'Academic semester identifier';
COMMENT ON COLUMN subjects.credits IS 'Course credit hours';
COMMENT ON COLUMN subjects.difficulty_level IS 'Subjective difficulty (1-5 scale)';
COMMENT ON COLUMN subjects.priority_weight IS 'Weight multiplier for task prioritization';
COMMENT ON COLUMN subjects.is_active IS 'Flag to enable/disable subject for current semester';