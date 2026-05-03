export const SCHEMA_VERSION = 2;

export const BASE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    require_name BOOLEAN DEFAULT 1,
    require_student_id BOOLEAN DEFAULT 0,
    allow_multiple_submissions BOOLEAN DEFAULT 1,
    shuffle_questions BOOLEAN DEFAULT 1,
    shuffle_options BOOLEAN DEFAULT 1,
    status TEXT DEFAULT 'published' CHECK(status IN ('draft','published')),
    password TEXT,
    end_time TEXT,
    start_time TEXT,
    settings_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS question_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    correct_option TEXT CHECK(correct_option IN ('A','B','C','D')) NOT NULL,
    text TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS question_item_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_item_id INTEGER NOT NULL,
    option_key TEXT CHECK(option_key IN ('A','B','C','D')) NOT NULL,
    option_text TEXT NOT NULL,
    UNIQUE(question_item_id, option_key),
    FOREIGN KEY (question_item_id) REFERENCES question_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS exam_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    question_item_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    FOREIGN KEY (question_item_id) REFERENCES question_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS question_bank_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    question_item_id INTEGER NOT NULL,
    tags TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    FOREIGN KEY (question_item_id) REFERENCES question_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    student_name TEXT,
    student_id TEXT,
    score REAL,
    total_questions INTEGER,
    started_at TEXT,
    finished_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS submission_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    exam_question_id INTEGER NOT NULL,
    selected_option TEXT,
    is_correct BOOLEAN,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_question_id) REFERENCES exam_questions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS exam_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    UNIQUE(exam_id, student_id),
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_exams_teacher_id ON exams(teacher_id);
  CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON exam_questions(exam_id);
  CREATE INDEX IF NOT EXISTS idx_submissions_exam_id ON submissions(exam_id);
  CREATE INDEX IF NOT EXISTS idx_submission_answers_submission_id ON submission_answers(submission_id);
  CREATE INDEX IF NOT EXISTS idx_question_bank_entries_teacher_id ON question_bank_entries(teacher_id);
`;
