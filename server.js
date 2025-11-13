require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { v4: uuidv4 } = require('uuid');
const SQLiteStore = require('connect-sqlite3')(session);

const config = require('./config.json');
const { initializeDatabase, userOps, tokenOps } = require('./database');
const { requireAuth, attachUser, getUserVaultPath, checkMagicLinkRateLimit } = require('./auth.middleware');
const { sendMagicLink, verifyEmailConfig } = require('./email');

const app = express();
const PORT = process.env.PORT || config.port || 3000;
const VAULTS_BASE_PATH = path.resolve(config.vaultsPath);
const SESSION_SECRET = process.env.SESSION_SECRET || config.sessionSecret;

// Initialize database
initializeDatabase();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  store: new SQLiteStore({
    db: 'notes.db',
    table: 'sessions'
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = userOps.findById(id);
  done(null, user);
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const name = profile.displayName;
      const googleId = profile.id;

      let user = userOps.findByGoogleId(googleId);

      if (!user) {
        user = userOps.findByEmail(email);
        if (user) {
          // Link Google account to existing user
          user = userOps.update(user.id, { google_id: googleId, name });
        } else {
          // Create new user
          user = userOps.create(email, name, googleId);
          // Create user vault directory
          const userVaultPath = getUserVaultPath(user.id, VAULTS_BASE_PATH);
          await fs.mkdir(userVaultPath, { recursive: true });
          console.log(`Created vault for new user: ${email}`);
        }
      }

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));
}

// Attach user middleware
app.use(attachUser);

// Per-user cache for file lists and backlinks
const userCaches = new Map();

// Get or create cache for user
function getUserCache(userId) {
  if (!userCaches.has(userId)) {
    userCaches.set(userId, {
      fileCache: [],
      backlinkGraph: new Map()
    });
  }
  return userCaches.get(userId);
}

// Utility: Sanitize path to prevent directory traversal
function sanitizePath(userPath, vaultPath) {
  const normalized = path.normalize(userPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(vaultPath, normalized);

  if (!fullPath.startsWith(vaultPath)) {
    throw new Error('Invalid path');
  }

  return fullPath;
}

// Utility: Get relative path from vault root
function getRelativePath(fullPath, vaultPath) {
  return path.relative(vaultPath, fullPath);
}

// Utility: Parse backlinks from markdown content
function parseBacklinks(content) {
  const backlinkRegex = /\[\[([^\]]+)\]\]/g;
  const links = [];
  let match;

  while ((match = backlinkRegex.exec(content)) !== null) {
    let linkText = match[1];
    if (linkText.includes('|')) {
      linkText = linkText.split('|')[0];
    }
    links.push(linkText.trim());
  }

  return links;
}

// Utility: Find note path by name
async function findNotePath(noteName, fileCache) {
  const normalized = noteName.endsWith('.md') ? noteName : `${noteName}.md`;

  if (normalized.includes('/') || normalized.includes('\\')) {
    if (fileCache.includes(normalized)) {
      return normalized;
    }
  }

  for (const file of fileCache) {
    const fileName = path.basename(file);
    if (fileName === normalized) {
      return file;
    }
  }

  return null;
}

// Utility: Recursively get all markdown files
async function getAllMarkdownFiles(dir, baseDir, fileList = []) {
  try {
    if (!fsSync.existsSync(dir)) {
      return fileList;
    }

    const files = await fs.readdir(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        await getAllMarkdownFiles(filePath, baseDir, fileList);
      } else if (file.endsWith('.md')) {
        fileList.push(getRelativePath(filePath, baseDir));
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }

  return fileList;
}

// Utility: Build backlink graph
async function buildBacklinkGraph(userId, vaultPath, fileCache) {
  const cache = getUserCache(userId);
  cache.backlinkGraph.clear();

  for (const filePath of fileCache) {
    const fullPath = sanitizePath(filePath, vaultPath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const links = parseBacklinks(content);

      for (const link of links) {
        const targetPath = await findNotePath(link, fileCache);
        if (targetPath) {
          if (!cache.backlinkGraph.has(targetPath)) {
            cache.backlinkGraph.set(targetPath, []);
          }
          cache.backlinkGraph.get(targetPath).push(filePath);
        }
      }
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error.message);
    }
  }
}

// Initialize cache for user
async function initializeUserCache(userId) {
  const vaultPath = getUserVaultPath(userId, VAULTS_BASE_PATH);
  await fs.mkdir(vaultPath, { recursive: true });

  const cache = getUserCache(userId);
  cache.fileCache = await getAllMarkdownFiles(vaultPath, vaultPath);
  await buildBacklinkGraph(userId, vaultPath, cache.fileCache);

  console.log(`Cached ${cache.fileCache.length} files for user ${userId}`);
}

// Setup file watcher for user
const userWatchers = new Map();

function setupUserFileWatcher(userId) {
  if (userWatchers.has(userId)) {
    return; // Already watching
  }

  const vaultPath = getUserVaultPath(userId, VAULTS_BASE_PATH);
  const cache = getUserCache(userId);

  const watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true
  });

  watcher
    .on('add', async (filePath) => {
      if (filePath.endsWith('.md')) {
        const relativePath = getRelativePath(filePath, vaultPath);
        if (!cache.fileCache.includes(relativePath)) {
          cache.fileCache.push(relativePath);
          await buildBacklinkGraph(userId, vaultPath, cache.fileCache);
        }
      }
    })
    .on('unlink', async (filePath) => {
      if (filePath.endsWith('.md')) {
        const relativePath = getRelativePath(filePath, vaultPath);
        cache.fileCache = cache.fileCache.filter(p => p !== relativePath);
        await buildBacklinkGraph(userId, vaultPath, cache.fileCache);
      }
    })
    .on('change', async () => {
      await buildBacklinkGraph(userId, vaultPath, cache.fileCache);
    });

  userWatchers.set(userId, watcher);
}

// ============ AUTHENTICATION ROUTES ============

// Google OAuth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (req, res) => {
    // Set session data
    req.session.userId = req.user.id;
    req.session.email = req.user.email;
    req.session.name = req.user.name;

    // Initialize user cache and watcher
    initializeUserCache(req.user.id).then(() => {
      setupUserFileWatcher(req.user.id);
    });

    res.redirect('/');
  }
);

// Magic link request
app.post('/auth/magic-link', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Check rate limit
    if (!checkMagicLinkRateLimit(email)) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.'
      });
    }

    // Clean expired tokens
    tokenOps.cleanExpired();

    // Generate token
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + config.tokenExpiryMinutes * 60 * 1000);

    // Save token
    tokenOps.create(token, email.toLowerCase(), expiresAt.toISOString());

    // Send email
    try {
      const result = await sendMagicLink(email, token);
      res.json({
        success: true,
        message: 'Magic link sent to your email',
        simulated: result.simulated || false
      });
    } catch (emailError) {
      console.error('Email error:', emailError);
      res.status(500).json({ error: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Magic link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Magic link verification
app.get('/auth/verify', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect('/login.html?error=invalid_token');
    }

    // Find token
    const magicToken = tokenOps.find(token);

    if (!magicToken) {
      return res.redirect('/login.html?error=invalid_token');
    }

    // Check expiration
    if (new Date(magicToken.expires_at) < new Date()) {
      tokenOps.delete(token);
      return res.redirect('/login.html?error=expired_token');
    }

    const email = magicToken.user_email;

    // Find or create user
    let user = userOps.findByEmail(email);
    if (!user) {
      user = userOps.create(email, email.split('@')[0], null);
      const userVaultPath = getUserVaultPath(user.id, VAULTS_BASE_PATH);
      await fs.mkdir(userVaultPath, { recursive: true });
      console.log(`Created vault for new user: ${email}`);
    }

    // Delete token
    tokenOps.delete(token);

    // Create session
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.name = user.name;

    // Initialize user cache and watcher
    await initializeUserCache(user.id);
    setupUserFileWatcher(user.id);

    res.redirect('/');
  } catch (error) {
    console.error('Verify error:', error);
    res.redirect('/login.html?error=server_error');
  }
});

// Get current user
app.get('/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    id: req.session.userId,
    email: req.session.email,
    name: req.session.name
  });
});

// Logout
app.post('/auth/logout', (req, res) => {
  const userId = req.session.userId;

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }

    // Clean up user watcher
    if (userWatchers.has(userId)) {
      userWatchers.get(userId).close();
      userWatchers.delete(userId);
    }

    res.json({ success: true });
  });
});

// ============ PROTECTED NOTES API ROUTES ============

// List all notes (protected)
app.get('/api/notes', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const cache = getUserCache(userId);

    // Initialize cache if empty
    if (cache.fileCache.length === 0) {
      await initializeUserCache(userId);
    }

    const notes = cache.fileCache.map(filePath => ({
      path: filePath,
      name: path.basename(filePath, '.md')
    }));

    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get note content and metadata (protected)
app.get('/api/notes/*', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const vaultPath = getUserVaultPath(userId, VAULTS_BASE_PATH);
    const cache = getUserCache(userId);
    const notePath = req.params[0];

    const fullPath = sanitizePath(notePath, vaultPath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const outgoingLinks = parseBacklinks(content);
    const backlinks = cache.backlinkGraph.get(notePath) || [];

    const resolvedOutgoingLinks = [];
    for (const link of outgoingLinks) {
      const targetPath = await findNotePath(link, cache.fileCache);
      if (targetPath) {
        resolvedOutgoingLinks.push(targetPath);
      }
    }

    res.json({
      path: notePath,
      name: path.basename(notePath, '.md'),
      content,
      backlinks: [...new Set(backlinks)],
      outgoingLinks: [...new Set(resolvedOutgoingLinks)]
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Note not found' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Create new note (protected)
app.post('/api/notes', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const vaultPath = getUserVaultPath(userId, VAULTS_BASE_PATH);
    const cache = getUserCache(userId);
    const { path: notePath, content = '' } = req.body;

    if (!notePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const fullPath = sanitizePath(notePath, vaultPath);

    if (fsSync.existsSync(fullPath)) {
      return res.status(409).json({ error: 'Note already exists' });
    }

    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');

    cache.fileCache.push(notePath);
    await buildBacklinkGraph(userId, vaultPath, cache.fileCache);

    res.json({
      success: true,
      path: notePath,
      name: path.basename(notePath, '.md')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update note content (protected)
app.put('/api/notes/*', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const vaultPath = getUserVaultPath(userId, VAULTS_BASE_PATH);
    const cache = getUserCache(userId);
    const notePath = req.params[0];
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const fullPath = sanitizePath(notePath, vaultPath);
    await fs.writeFile(fullPath, content, 'utf-8');
    await buildBacklinkGraph(userId, vaultPath, cache.fileCache);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete note (protected)
app.delete('/api/notes/*', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const vaultPath = getUserVaultPath(userId, VAULTS_BASE_PATH);
    const cache = getUserCache(userId);
    const notePath = req.params[0];

    const fullPath = sanitizePath(notePath, vaultPath);
    await fs.unlink(fullPath);

    cache.fileCache = cache.fileCache.filter(p => p !== notePath);
    await buildBacklinkGraph(userId, vaultPath, cache.fileCache);

    res.json({ success: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Note not found' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Rename note and update backlinks (protected)
app.post('/api/notes/*/rename', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const vaultPath = getUserVaultPath(userId, VAULTS_BASE_PATH);
    const cache = getUserCache(userId);
    const oldPath = req.params[0];
    const { newPath } = req.body;

    if (!newPath) {
      return res.status(400).json({ error: 'New path is required' });
    }

    const oldFullPath = sanitizePath(oldPath, vaultPath);
    const newFullPath = sanitizePath(newPath, vaultPath);

    if (fsSync.existsSync(newFullPath)) {
      return res.status(409).json({ error: 'Target path already exists' });
    }

    const newDir = path.dirname(newFullPath);
    await fs.mkdir(newDir, { recursive: true });
    await fs.rename(oldFullPath, newFullPath);

    const oldName = path.basename(oldPath, '.md');
    const newName = path.basename(newPath, '.md');
    const backlinks = cache.backlinkGraph.get(oldPath) || [];

    for (const backlinkPath of backlinks) {
      const fullPath = sanitizePath(backlinkPath, vaultPath);
      let content = await fs.readFile(fullPath, 'utf-8');

      const regex1 = new RegExp(`\\[\\[${oldName}\\]\\]`, 'g');
      const regex2 = new RegExp(`\\[\\[${oldName}\\|`, 'g');

      content = content.replace(regex1, `[[${newName}]]`);
      content = content.replace(regex2, `[[${newName}|`);

      await fs.writeFile(fullPath, content, 'utf-8');
    }

    cache.fileCache = cache.fileCache.map(p => p === oldPath ? newPath : p);
    await buildBacklinkGraph(userId, vaultPath, cache.fileCache);

    res.json({
      success: true,
      updatedBacklinks: backlinks.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get backlinks for a note (protected)
app.get('/api/backlinks/*', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const cache = getUserCache(userId);
    const notePath = req.params[0];
    const backlinks = cache.backlinkGraph.get(notePath) || [];

    res.json({
      path: notePath,
      backlinks: [...new Set(backlinks)]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static files (public folder)
app.use(express.static('public'));

// Redirect root to app or login
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.redirect('/login.html');
  }
});

// Start server
async function start() {
  try {
    await fs.mkdir(VAULTS_BASE_PATH, { recursive: true });

    // Verify email configuration
    const emailStatus = await verifyEmailConfig();
    console.log('Email status:', emailStatus.message);

    // Clean up expired tokens on startup
    const cleaned = tokenOps.cleanExpired();
    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} expired tokens`);
    }

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Vaults base path: ${VAULTS_BASE_PATH}`);
      console.log(`Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 'Enabled' : 'Disabled'}`);
      console.log(`SMTP: ${process.env.SMTP_HOST ? 'Configured' : 'Not configured (using console output)'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
