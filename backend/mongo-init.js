// MongoDB initialization script for FocusForge
// This script creates the focusforge database and sets up indexes

// Switch to focusforge database
db = db.getSiblingDB('focusforge');

// Create collections and indexes
print('Creating collections and indexes...');

// Tasks collection
db.createCollection('tasks');
db.tasks.createIndex({ "user_id": 1, "status": 1 });
db.tasks.createIndex({ "user_id": 1, "deadline": 1 });
db.tasks.createIndex({ "user_id": 1, "priority": 1 });
db.tasks.createIndex({ "subject_id": 1 });
db.tasks.createIndex({ "created_at": 1 });
db.tasks.createIndex({ "ai_score": 1 });

// Chat messages collection
db.createCollection('chat_messages');
db.chat_messages.createIndex({ "user_id": 1, "timestamp": -1 });
db.chat_messages.createIndex({ "session_id": 1, "timestamp": 1 });
db.chat_messages.createIndex({ "user_id": 1, "session_id": 1 });

// Focus logs collection
db.createCollection('focus_logs');
db.focus_logs.createIndex({ "user_id": 1, "session_start": -1 });
db.focus_logs.createIndex({ "user_id": 1, "session_start": 1 });
db.focus_logs.createIndex({ "task_worked_on": 1 });
db.focus_logs.createIndex({ "streak_count": 1 });

// Vector store collection (for Pinecone alternative or backup)
db.createCollection('vector_store');
db.vector_store.createIndex({ "user_id": 1, "created_at": -1 });
db.vector_store.createIndex({ "metadata.type": 1, "created_at": -1 });

// Insert some default data for development
if (db.getName() === 'focusforge') {
  print('Inserting development data...');

  // Example subject data (would normally be in PostgreSQL, but here for reference)
  const exampleSubjects = [
    {
      name: "Mathematics",
      description: "Calculus, Algebra, Statistics",
      color_code: "#3b82f6",
      created_at: new Date()
    },
    {
      name: "Computer Science",
      description: "Programming, Algorithms, Data Structures",
      color_code: "#10b981",
      created_at: new Date()
    },
    {
      name: "Physics",
      description: "Mechanics, Thermodynamics, Electromagnetism",
      color_code: "#f59e0b",
      created_at: new Date()
    }
  ];

  // Note: Subjects are stored in PostgreSQL, this is just for reference
  print('Development setup complete!');
}

print('MongoDB initialization completed successfully!');