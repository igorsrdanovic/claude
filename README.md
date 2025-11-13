# Markdown Note-Taking App (Obsidian-lite)

A lightweight, web-based markdown note-taking application with backlinking support and multi-user authentication, inspired by Obsidian.

## Features

### Core Features
- **File Management**: Create, edit, delete, and organize notes in folders
- **Backlinking**: Support for `[[note name]]` and `[[note name|alias]]` syntax
- **Live Preview**: Real-time markdown preview with clickable backlinks
- **File Tree**: Navigate notes with collapsible folder structure
- **Auto-save**: Automatic saving with 1-second debounce
- **Backlinks Panel**: See all notes that link to the current note
- **Search**: Filter notes by name or path
- **File Watcher**: Automatically detects external changes to vault

### Authentication & Multi-User
- **Multi-User Support**: Each user has isolated vault storage
- **Google OAuth**: Sign in with your Google account
- **Magic Link**: Passwordless email login
- **Session Management**: Persistent sessions with 30-day expiration
- **Protected API**: All note operations require authentication

## Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment** (optional but recommended):

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Required for production
SESSION_SECRET=your-random-secret-key-here

# Optional: Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Optional: Email (for magic links)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

3. **Start the server:**
```bash
npm start
```

4. **Open your browser:**
Navigate to `http://localhost:3000` and sign in.

## Authentication Setup

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing one
3. Enable "Google+ API"
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
6. Copy Client ID and Client Secret to `.env` file

### Magic Link Email Setup (Gmail)

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Select "2-Step Verification"
   - Scroll to "App passwords"
   - Generate new app password for "Mail"
3. Add credentials to `.env` file

**Note:** If SMTP is not configured, magic link URLs will be printed to the console for development/testing.

## Migration from Single-User Version

If you're upgrading from the single-user version, run the migration script:

```bash
node migrate.js your-email@example.com
```

This will:
- Create a default user account
- Move `./vault` to `./vaults/user-1`
- Set up the database

## Configuration

Edit `config.json`:

```json
{
  "vaultsPath": "./vaults",
  "port": 3000,
  "sessionSecret": "change-me-in-production",
  "tokenExpiryMinutes": 15
}
```

**Production Note:** Always set `SESSION_SECRET` via environment variable in production!

## Usage

### Authentication

#### First-time Login

1. Navigate to `http://localhost:3000`
2. Choose authentication method:
   - **Google**: Click "Sign in with Google" button
   - **Magic Link**: Enter your email and click "Send magic link"
3. For magic link: Check your email and click the login link

#### Logout

Click the "Logout" button in the sidebar user info section.

### Managing Notes

#### Creating Notes

1. Click the "+ New" button in the sidebar
2. Enter a note name and optional folder path
3. Click "Create"

#### Linking Notes

Use double brackets to link to other notes:

```markdown
[[Note Name]]
[[Note Name|Display Text]]
[[folder/Note Name]]
```

#### Keyboard Shortcuts

- `Ctrl/Cmd + N`: Create new note
- `Ctrl/Cmd + S`: Manual save (auto-save is enabled)
- `Escape`: Close modal

### Vault Storage

Each user gets an isolated vault:
```
vaults/
  user-1/
    note1.md
    folder/note2.md
  user-2/
    note1.md
```

## API Endpoints

### Authentication Routes

- `GET /auth/google` - Initiate Google OAuth flow
- `GET /auth/google/callback` - Google OAuth callback
- `POST /auth/magic-link` - Request magic link (body: `{email}`)
- `GET /auth/verify?token=xxx` - Verify magic link token
- `GET /auth/me` - Get current user info
- `POST /auth/logout` - Logout current user

### Notes API (Protected)

All notes endpoints require authentication:

- `GET /api/notes` - List all notes
- `GET /api/notes/:path` - Get note content and metadata
- `POST /api/notes` - Create new note
- `PUT /api/notes/:path` - Update note content
- `DELETE /api/notes/:path` - Delete note
- `POST /api/notes/:path/rename` - Rename note and update backlinks
- `GET /api/backlinks/:path` - Get backlinks for a note

## Security Features

- **Path Sanitization**: Prevents directory traversal attacks
- **Session Security**: HTTP-only cookies, secure in production
- **Rate Limiting**: Magic link requests limited to 3 per hour per email
- **Token Expiration**: Magic links expire after 15 minutes
- **SQL Injection Protection**: Prepared statements for all queries
- **Per-User Isolation**: Users can only access their own notes

## Tech Stack

- **Backend**: Node.js with Express
- **Frontend**: Vanilla JavaScript
- **Authentication**: Passport.js (Google OAuth), custom magic link
- **Database**: SQLite (better-sqlite3)
- **Session Store**: connect-sqlite3
- **Storage**: Plain markdown files
- **File Watching**: Chokidar
- **Email**: Nodemailer

## Development

### Running Tests

```bash
npm test
```

### Environment Variables

See `.env.example` for all available configuration options.

### Database

The SQLite database (`notes.db`) stores:
- User accounts
- Magic link tokens
- Session data

**Note:** Database is automatically initialized on first run.

## Troubleshooting

### Magic Links Not Sending

- Check SMTP configuration in `.env`
- Ensure Gmail App Password is correct (not regular password)
- Check server console for printed magic link URLs (development mode)

### Google OAuth Not Working

- Verify redirect URI matches exactly in Google Console
- Check Client ID and Secret are correct
- Ensure Google+ API is enabled

### Session Expired

- Sessions last 30 days by default
- Clear browser cookies if having issues
- Check `SESSION_SECRET` is set

### Can't Access Notes

- Ensure you're logged in (`/auth/me` should return user info)
- Check browser console for 401 errors
- Try logging out and back in

## Production Deployment

1. Set strong `SESSION_SECRET` environment variable
2. Enable HTTPS (required for secure cookies)
3. Configure proper SMTP settings
4. Set up Google OAuth with production callback URL
5. Regular database backups recommended

## License

MIT
