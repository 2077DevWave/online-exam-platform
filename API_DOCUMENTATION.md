# API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication

Most teacher endpoints require JWT authentication. Include the token in the `Authorization` header:
```
Authorization: Bearer <your-jwt-token>
```

---

## Health Check

### GET /health
Check API and database health status.

**Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Authentication Endpoints

### POST /auth/register
Register a new teacher account.

**Request Body:**
```json
{
  "username": "teacher@example.com",
  "password": "SecurePass123"
}
```

**Password Requirements:**
- Minimum 6 characters

**Responses:**
- `201 Created`: Registration successful
- `400 Bad Request`: Validation error
- `409 Conflict`: Username already taken

---

### POST /auth/login
Login and receive JWT token.

**Request Body:**
```json
{
  "username": "teacher@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### PUT /auth/change-password
Change password (requires authentication).

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Request Body:**
```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewSecurePass456"
}
```

---

### POST /auth/organizations
Create a new organization (requires authentication).

**Request Body:**
```json
{
  "name": "My School"
}
```

**Response:**
```json
{
  "organization_id": 1
}
```

---

### POST /auth/organizations/:id/members
Add member to organization (requires authentication).

**Request Body:**
```json
{
  "member_teacher_id": 2,
  "role": "teacher"
}
```

**Roles:** `admin`, `teacher`

---

## Exam Management (Teacher)

### POST /exams
Create a new exam.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Request Body:**
```json
{
  "title": "Math Final Exam",
  "duration_minutes": 90,
  "require_name": true,
  "require_student_id": true,
  "allow_multiple_submissions": false,
  "shuffle_questions": true,
  "shuffle_options": true,
  "status": "published",
  "password": "exam123",
  "start_time": "2024-01-20T09:00:00Z",
  "end_time": "2024-01-20T11:00:00Z"
}
```

**Field Descriptions:**
- `title`: Exam title (required, max 255 chars)
- `duration_minutes`: Exam duration in minutes
- `require_name`: Require student name on submission
- `require_student_id`: Require student ID on submission
- `allow_multiple_submissions`: Allow students to submit multiple times
- `shuffle_questions`: Randomize question order
- `shuffle_options`: Randomize answer options
- `status`: `draft` or `published`
- `password`: Optional exam access password
- `start_time`: ISO 8601 datetime when exam becomes available
- `end_time`: ISO 8601 datetime when exam closes

**Time Zone Handling:**
All datetime fields should be provided in ISO 8601 format. The system converts them to UTC timestamps internally for consistent comparison across time zones.

**Response:**
```json
{
  "id": 1,
  "title": "Math Final Exam",
  "duration_minutes": 90,
  "require_name": true,
  "require_student_id": true,
  "allow_multiple_submissions": false,
  "shuffle_questions": true,
  "shuffle_options": true,
  "status": "published",
  "password": true
}
```

---

### GET /exams
List all exams for the authenticated teacher.

**Response:**
```json
[
  {
    "id": 1,
    "title": "Math Final Exam",
    "duration_minutes": 90,
    "require_name": true,
    "require_student_id": true,
    "allow_multiple_submissions": false,
    "shuffle_questions": true,
    "shuffle_options": true,
    "status": "published",
    "password": "****",
    "start_time": "2024-01-20T09:00:00Z",
    "end_time": "2024-01-20T11:00:00Z"
  }
]
```

---

### GET /exams/:id
Get exam details with questions and students.

**Response:**
```json
{
  "id": 1,
  "title": "Math Final Exam",
  "questions": [
    {
      "id": 1,
      "text": "What is 2 + 2?",
      "correct_option": "B",
      "weight": 1,
      "negative_mark": 0,
      "option_a": "3",
      "option_b": "4",
      "option_c": "5",
      "option_d": "6"
    }
  ],
  "students": [
    {
      "id": 1,
      "student_id": "STU001"
    }
  ]
}
```

---

### PUT /exams/:id
Update an exam.

**Request Body:** (same as POST /exams, all fields optional)

---

### DELETE /exams/:id
Delete an exam.

**Response:**
```json
{
  "success": true
}
```

---

### POST /exams/:id/pool-rules
Configure question pool rules for random selection.

**Request Body:**
```json
{
  "rules": [
    {
      "tag": "algebra",
      "difficulty": "medium",
      "question_count": 5
    },
    {
      "tag": "geometry",
      "difficulty": null,
      "question_count": 3
    }
  ]
}
```

---

### GET /exams/:id/pool-rules
Get configured pool rules.

---

### GET /exams/:id/notifications
Get scheduled notification jobs.

---

### POST /exams/:id/notifications
Schedule notifications.

**Request Body:**
```json
{
  "jobs": [
    {
      "job_type": "email",
      "target_student_id": "STU001",
      "scheduled_for": "2024-01-19T08:00:00Z",
      "payload": {
        "subject": "Exam Reminder",
        "message": "Your exam starts tomorrow"
      }
    }
  ]
}
```

---

## Submission Endpoints (Student)

### POST /submissions
Submit exam answers.

**Request Body:**
```json
{
  "exam_id": 1,
  "student_name": "John Doe",
  "student_id": "STU001",
  "answers": [
    {
      "question_id": 1,
      "selected_option": "B"
    },
    {
      "question_id": 2,
      "selected_option": "A"
    }
  ],
  "exam_token": "optional-token-if-required"
}
```

**Score Calculation:**
Scores are calculated using weighted points with optional negative marking. The final score is rounded to 1 decimal place to ensure consistent floating-point precision.

Formula:
```
score = ((earned_points - penalty_points) / total_possible_weight) * 100
```

Where:
- `earned_points`: Sum of weights for correctly answered questions
- `penalty_points`: Sum of negative marks for incorrectly answered questions  
- `total_possible_weight`: Sum of all question weights

**Response:**
```json
{
  "submission_id": 1,
  "score": 66.7,
  "total_questions": 2
}
```

---

### GET /public/exams/:id
Get public exam details for students.

**Response:**
```json
{
  "id": 1,
  "title": "Math Final Exam",
  "duration_minutes": 90,
  "require_name": true,
  "require_student_id": true,
  "allow_multiple_submissions": false,
  "shuffle_questions": true,
  "shuffle_options": true,
  "questions": [
    {
      "id": 1,
      "text": "What is 2 + 2?",
      "option_a": "3",
      "option_b": "4",
      "option_c": "5",
      "option_d": "6"
    }
  ]
}
```

---

### GET /public/exams/:id/already-submitted
Check if a student has already submitted an exam.

**Query Parameters:**
- `name`: Student name
- `student_id`: Student ID (optional)

**Response:**
```json
{
  "submitted": true
}
```

---

### POST /public/exams/:id/verify-password
Verify exam access password.

**Request Body:**
```json
{
  "password": "exam123"
}
```

**Response:**
```json
{
  "token": "exam-access-token"
}
```

---

### POST /public/exams/:id/student-login
Login with student credentials for exam access.

**Request Body:**
```json
{
  "student_id": "STU001",
  "password": "student-password"
}
```

**Response:**
```json
{
  "token": "exam-access-token"
}
```

---

### POST /exams/:id/submissions/rescore
Recalculate scores for all submissions after question changes.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "updated": 5,
  "submissions": [
    {
      "submission_id": 1,
      "old_score": 66.7,
      "new_score": 100.0
    }
  ]
}
```

---

### GET /exams/:id/submissions
List all submissions for an exam.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
[
  {
    "id": 1,
    "student_name": "John Doe",
    "student_id": "STU001",
    "score": 85.5,
    "total_questions": 20,
    "started_at": "2024-01-20T09:00:00Z",
    "finished_at": "2024-01-20T10:30:00Z"
  }
]
```

---

### GET /submissions/:id
Get detailed submission review with answers.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "id": 1,
  "student_name": "John Doe",
  "student_id": "STU001",
  "score": 85.5,
  "answers": [
    {
      "question_id": 1,
      "selected_option": "B",
      "is_correct": true,
      "awarded_points": 1,
      "penalty_points": 0
    }
  ],
  "integrity_events": []
}
```

---

### POST /submissions/:id/answers/:answerId/review
Review and override answer grading.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Request Body:**
```json
{
  "override_is_correct": true,
  "note": "Student provided valid alternative answer",
  "needs_review": false
}
```

---

### GET /exams/:id/analytics
Get exam analytics and statistics.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "totals": {
    "submissions": 50,
    "avg_score": 75.5,
    "min_score": 30.0,
    "max_score": 100.0
  },
  "items": [
    {
      "question_id": 1,
      "text": "What is 2 + 2?",
      "difficulty_index": 0.85,
      "avg_points": 0.85
    }
  ],
  "distribution": {
    "below_40": 5,
    "from_40_to_59": 10,
    "from_60_to_79": 20,
    "above_80": 15
  }
}
```

---

### GET /exams/:id/submissions/export
Export submissions as CSV file.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response:** CSV file download

---

## Question Management (Teacher)

### POST /exams/:id/questions
Add a question to an exam.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Request Body:**
```json
{
  "text": "What is the capital of France?",
  "option_a": "Paris",
  "option_b": "London",
  "option_c": "Berlin",
  "option_d": "Madrid",
  "correct_option": "A",
  "weight": 2,
  "negative_mark": 0.5
}
```

**Field Descriptions:**
- `text`: Question text (required)
- `option_a` to `option_d`: Answer options (required)
- `correct_option`: Correct answer (A, B, C, or D)
- `weight`: Point weight for this question (default: 1)
- `negative_mark`: Penalty for wrong answer (default: 0)

**Response:**
```json
{
  "id": 1,
  "text": "What is the capital of France?",
  "correct_option": "A",
  "weight": 2,
  "negative_mark": 0.5
}
```

---

### PUT /questions/:id
Update a question.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Request Body:** (all fields optional)
```json
{
  "text": "Updated question text",
  "correct_option": "B",
  "weight": 3,
  "negative_mark": 1
}
```

---

### DELETE /questions/:id
Delete a question.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

---

### GET /questions/pool
Search question bank.

**Query Parameters:**
- `search`: Search term in question text
- `tag`: Filter by tag
- `difficulty`: Filter by difficulty

---

### POST /questions/pool
Create a new question in the question bank.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Request Body:**
```json
{
  "text": "Question text",
  "option_a": "Option A",
  "option_b": "Option B",
  "option_c": "Option C",
  "option_d": "Option D",
  "correct_option": "A",
  "tags": ["algebra", "medium"],
  "difficulty": "medium"
}
```

---

### PUT /questions/pool/:id
Update a question in the question bank.

---

### DELETE /questions/pool/:id
Delete a question from the question bank.

---

## Student Management (Teacher)

### GET /students
List all students.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

---

### POST /students
Create a new student.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Request Body:**
```json
{
  "student_id": "STU001",
  "password": "studentpass123"
}
```

---

### PUT /students/:id
Update a student.

---

### DELETE /students/:id
Delete a student.

---

### POST /attempt-sessions/start
Start an attempt session for autosave.

**Request Body:**
```json
{
  "exam_id": 1,
  "student_name": "John Doe",
  "student_id": "STU001",
  "exam_token": "optional-token",
  "remaining_seconds": 5400
}
```

**Response:**
```json
{
  "attempt_session_id": 1,
  "session_key": "uuid-session-key"
}
```

---

### POST /attempt-sessions/:id/autosave
Autosave answers during exam.

**Request Body:**
```json
{
  "answers": [
    {
      "question_id": 1,
      "selected_option": "B"
    }
  ],
  "remaining_seconds": 3600,
  "question_order": [1, 3, 2, 4]
}
```

---

### GET /attempt-sessions/resume
Resume an interrupted exam session.

**Query Parameters:**
- `exam_id`: Exam ID
- `student_id`: Student ID
- `student_name`: Student name

**Response:**
```json
{
  "resumable": true,
  "attempt_session_id": 1,
  "remaining_seconds": 3600,
  "answers": [
    {
      "question_id": 1,
      "selected_option": "B"
    }
  ],
  "question_order": [1, 3, 2, 4]
}
```

---

### POST /integrity-events
Report integrity events (e.g., tab switch, copy-paste).

**Request Body:**
```json
{
  "attempt_session_id": 1,
  "exam_id": 1,
  "student_id": "STU001",
  "event_type": "tab_switch",
  "payload": {
    "timestamp": "2024-01-20T10:15:00Z"
  },
  "device_fingerprint": "device-id-xyz"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "ErrorType",
  "message": "Human-readable error message",
  "statusCode": 400
}
```

**Common Error Types:**
- `ValidationError`: Input validation failed
- `DomainError`: Business logic error
- `UnauthorizedError`: Invalid or missing authentication
- `ForbiddenError`: Access denied
- `NotFoundError`: Resource not found
- `InternalServerError`: Server error

---

## Rate Limiting

To prevent brute-force attacks, consider implementing rate limiting on:
- `/auth/login` - Max 5 attempts per minute per IP
- `/auth/register` - Max 3 registrations per minute per IP

---

## Security Notes

1. **JWT Secrets**: Always use strong, unique secrets in production. Update `.env` file with secure values.
2. **Password Hashing**: Passwords are hashed using bcrypt with salt rounds.
3. **Exam Tokens**: Time-limited tokens for exam access (password-based or student-authenticated).
4. **SQL Injection Prevention**: All database queries use parameterized statements.
