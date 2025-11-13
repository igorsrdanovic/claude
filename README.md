# Markdown Note-Taking App (Obsidian-lite)

A lightweight, web-based markdown note-taking application with backlinking support, inspired by Obsidian.

## Features

- **File Management**: Create, edit, delete, and organize notes in folders
- **Backlinking**: Support for `[[note name]]` and `[[note name|alias]]` syntax
- **Live Preview**: Real-time markdown preview with clickable backlinks
- **File Tree**: Navigate notes with collapsible folder structure
- **Auto-save**: Automatic saving with 1-second debounce
- **Backlinks Panel**: See all notes that link to the current note
- **Search**: Filter notes by name or path
- **File Watcher**: Automatically detects external changes to vault

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser to `http://localhost:3000`

## Configuration

Edit `config.json` to customize:

```json
{
  "vaultPath": "./vault",
  "port": 3000
}
```

## Usage

### Creating Notes

1. Click the "+ New" button in the sidebar
2. Enter a note name and optional folder path
3. Click "Create"

### Linking Notes

Use double brackets to link to other notes:

```markdown
[[Note Name]]
[[Note Name|Display Text]]
[[folder/Note Name]]
```

### Keyboard Shortcuts

- `Ctrl/Cmd + N`: Create new note
- `Ctrl/Cmd + S`: Manual save (auto-save is enabled)
- `Escape`: Close modal

### Obsidian Compatibility

This app is designed to work with existing Obsidian vaults. Simply point the `vaultPath` in `config.json` to your Obsidian vault directory.

## API Endpoints

- `GET /api/notes` - List all notes
- `GET /api/notes/:path` - Get note content and metadata
- `POST /api/notes` - Create new note
- `PUT /api/notes/:path` - Update note content
- `DELETE /api/notes/:path` - Delete note
- `POST /api/notes/:path/rename` - Rename note and update backlinks
- `GET /api/backlinks/:path` - Get backlinks for a note

## Tech Stack

- **Backend**: Node.js with Express
- **Frontend**: Vanilla JavaScript
- **Storage**: Plain markdown files
- **File Watching**: Chokidar

## License

MIT
