# Online Exam System

A web-based online examination platform built with Node.js, Express, and TypeScript. This application allows teachers to create and manage exams while students can take exams and view their results.

## Features

- **Authentication & Authorization**: Secure user authentication using JWT tokens
- **Role-based Access Control**: Separate routes and permissions for students and teachers
- **Exam Management**: Create, update, and manage exams
- **Submission Handling**: Track and manage exam submissions
- **Real-time Notifications**: Scheduled notification system
- **Persistent Storage**: SQLite database with durability features
- **Static File Serving**: Built-in static asset serving for frontend

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js v5
- **Database**: SQLite (via sql.js)
- **Authentication**: JSON Web Tokens (JWT)
- **Password Hashing**: bcryptjs

## Project Structure

```
online-exam/
├── src/
│   ├── config/          # Environment configuration
│   ├── database/        # Database connection and utilities
│   ├── middleware/      # Express middleware (auth, validation, etc.)
│   ├── modules/         # Business logic modules
│   │   ├── exam/        # Exam-related functionality
│   │   ├── submission/  # Submission handling
│   │   └── shared/      # Shared utilities across modules
│   ├── routes/          # API route handlers
│   │   ├── auth.ts      # Authentication routes
│   │   ├── student/     # Student-specific routes
│   │   └── teacher/     # Teacher-specific routes
│   ├── utils/           # Utility functions
│   ├── app.ts           # Express app configuration
│   ├── database.ts      # Database setup and initialization
│   └── index.ts         # Application entry point
├── public/              # Static assets (HTML, CSS, JS)
├── tests/               # Test files
├── storage/             # Database persistence (created at runtime)
├── dist/                # Compiled JavaScript output
├── package.json         # Project dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── liara.json           # Liara deployment configuration
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd online-exam
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (if needed):
   - Check `src/config/env.ts` for available configuration options

### Development

Run the development server with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000` by default.

### Production Build

1. Compile TypeScript to JavaScript:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with nodemon |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm test` | Run test suite |

## API Endpoints

### Authentication
- `/api/auth/*` - Login, register, and token management

### Student Routes
- `/api/student/*` - Student-specific operations (view exams, submit answers, etc.)

### Teacher Routes
- `/api/teacher/*` - Teacher-specific operations (create exams, view submissions, etc.)

### Health Check
- `GET /api/health` - Returns server status

### Exam Page
- `GET /exam/:id` - Serves the exam interface

## Deployment

### Liara Platform

This project is configured for deployment on [Liara](https://liara.ir). The `liara.json` file contains the deployment configuration:

- **App Name**: online-exam
- **Port**: 3000
- **Persistent Disk**: Configured for database storage at `/app/storage`

Deploy using the Liara CLI:
```bash
liara deploy
```

## Durability Testing

A durability test script is included to test server resilience under concurrent load:

```bash
./durability_test.sh http://localhost:3000/api/health
```

Options:
- First argument: Target URL (default: http://example.com)
- Default concurrent requests: 200
- Timeout per request: 20 seconds

## Database

The application uses SQLite with automatic persistence. The database file is stored in the `storage/` directory. A periodic job runs every 30 seconds to update notification statuses.

## License

ISC
