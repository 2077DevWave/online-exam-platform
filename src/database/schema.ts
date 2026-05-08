export const SCHEMA_VERSION = 3;

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
    weight REAL NOT NULL DEFAULT 1.0,
    negative_mark REAL NOT NULL DEFAULT 0.0,
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
    awarded_points REAL NOT NULL DEFAULT 0.0,
    penalty_points REAL NOT NULL DEFAULT 0.0,
    needs_review BOOLEAN NOT NULL DEFAULT 0,
    reviewer_override_is_correct BOOLEAN,
    reviewer_note TEXT,
    reviewed_by_teacher_id INTEGER,
    reviewed_at TEXT,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_question_id) REFERENCES exam_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS review_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_answer_id INTEGER NOT NULL,
    actor_teacher_id INTEGER NOT NULL,
    previous_is_correct BOOLEAN,
    new_is_correct BOOLEAN,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (submission_answer_id) REFERENCES submission_answers(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attempt_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    student_name TEXT,
    student_id TEXT,
    exam_token TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    submitted_at TEXT,
    question_order_json TEXT,
    remaining_seconds INTEGER,
    session_key TEXT UNIQUE,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attempt_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_session_id INTEGER NOT NULL,
    exam_question_id INTEGER NOT NULL,
    selected_option TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(attempt_session_id, exam_question_id),
    FOREIGN KEY (attempt_session_id) REFERENCES attempt_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_question_id) REFERENCES exam_questions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS exam_pool_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    tag TEXT,
    difficulty TEXT CHECK(difficulty IN ('easy','medium','hard')),
    question_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS exam_attempt_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_session_id INTEGER NOT NULL,
    exam_question_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    UNIQUE(attempt_session_id, exam_question_id),
    FOREIGN KEY (attempt_session_id) REFERENCES attempt_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_question_id) REFERENCES exam_questions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS integrity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_session_id INTEGER,
    exam_id INTEGER NOT NULL,
    student_id TEXT,
    event_type TEXT NOT NULL,
    event_payload_json TEXT,
    ip_address TEXT,
    device_fingerprint TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (attempt_session_id) REFERENCES attempt_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS organization_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    teacher_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher' CHECK(role IN ('admin','teacher','reviewer')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(organization_id, teacher_id),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notification_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    job_type TEXT NOT NULL,
    target_student_id TEXT,
    scheduled_for TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
    payload_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
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
  CREATE INDEX IF NOT EXISTS idx_attempt_sessions_exam_id ON attempt_sessions(exam_id);
  CREATE INDEX IF NOT EXISTS idx_attempt_answers_session_id ON attempt_answers(attempt_session_id);
  CREATE INDEX IF NOT EXISTS idx_integrity_events_exam_id ON integrity_events(exam_id);
  CREATE INDEX IF NOT EXISTS idx_notification_jobs_scheduled_for ON notification_jobs(scheduled_for);
`;
