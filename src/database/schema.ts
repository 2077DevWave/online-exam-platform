export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS question_bank (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT CHECK(correct_option IN ('A','B','C','D')) NOT NULL,
    tags TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
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
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT CHECK(correct_option IN ('A','B','C','D')) NOT NULL,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
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
    FOREIGN KEY (exam_id) REFERENCES exams(id)
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    selected_option TEXT,
    is_correct BOOLEAN,
    FOREIGN KEY (submission_id) REFERENCES submissions(id),
    FOREIGN KEY (question_id) REFERENCES questions(id)
  );

  CREATE TABLE IF NOT EXISTS exam_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
  );
`;

export const SAFE_MIGRATIONS: string[] = [
  "ALTER TABLE exams ADD COLUMN start_time TEXT",
  "ALTER TABLE exams ADD COLUMN end_time TEXT",
  "ALTER TABLE exams ADD COLUMN status TEXT DEFAULT 'published' CHECK(status IN ('draft','published'))",
  "ALTER TABLE exams ADD COLUMN password TEXT",
  "ALTER TABLE exams ADD COLUMN require_name BOOLEAN DEFAULT 1",
  "ALTER TABLE exams ADD COLUMN require_student_id BOOLEAN DEFAULT 0",
  "ALTER TABLE exams ADD COLUMN allow_multiple_submissions BOOLEAN DEFAULT 1",
  "ALTER TABLE exams ADD COLUMN shuffle_questions BOOLEAN DEFAULT 1",
  "ALTER TABLE exams ADD COLUMN shuffle_options BOOLEAN DEFAULT 1",
  `CREATE TABLE IF NOT EXISTS exam_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
  )`,
];
