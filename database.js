const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'notes.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      google_id TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Magic tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS magic_tokens (
      token TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Note: Sessions table is automatically created by connect-sqlite3

  console.log('Database initialized');
}

// User operations
const userOps = {
  // Find user by email
  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  // Find user by Google ID
  findByGoogleId(googleId) {
    return db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
  },

  // Find user by ID
  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  // Create new user
  create(email, name, googleId = null) {
    const stmt = db.prepare(
      'INSERT INTO users (email, name, google_id) VALUES (?, ?, ?)'
    );
    const result = stmt.run(email, name, googleId);
    return this.findById(result.lastInsertRowid);
  },

  // Update user
  update(id, data) {
    const fields = [];
    const values = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.google_id !== undefined) {
      fields.push('google_id = ?');
      values.push(data.google_id);
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    const stmt = db.prepare(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`
    );
    stmt.run(...values);
    return this.findById(id);
  }
};

// Magic token operations
const tokenOps = {
  // Create magic token
  create(token, email, expiresAt) {
    const stmt = db.prepare(
      'INSERT INTO magic_tokens (token, user_email, expires_at) VALUES (?, ?, ?)'
    );
    stmt.run(token, email, expiresAt);
  },

  // Find token
  find(token) {
    return db.prepare('SELECT * FROM magic_tokens WHERE token = ?').get(token);
  },

  // Delete token
  delete(token) {
    db.prepare('DELETE FROM magic_tokens WHERE token = ?').run(token);
  },

  // Clean up expired tokens
  cleanExpired() {
    const now = new Date().toISOString();
    const result = db.prepare('DELETE FROM magic_tokens WHERE expires_at < ?').run(now);
    return result.changes;
  },

  // Get tokens for email (for rate limiting)
  getRecentByEmail(email, minutesAgo) {
    const cutoff = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
    return db.prepare(
      'SELECT * FROM magic_tokens WHERE user_email = ? AND created_at > ?'
    ).all(email, cutoff);
  }
};

module.exports = {
  db,
  initializeDatabase,
  userOps,
  tokenOps
};
