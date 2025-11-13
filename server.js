const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const config = require('./config.json');

const app = express();
const PORT = config.port || 3000;
const VAULT_PATH = path.resolve(config.vaultPath);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// In-memory cache for file list and backlinks
let fileCache = [];
let backlinkGraph = new Map(); // Map of note path -> array of paths that link to it

// Utility: Sanitize path to prevent directory traversal
function sanitizePath(userPath) {
  const normalized = path.normalize(userPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(VAULT_PATH, normalized);

  if (!fullPath.startsWith(VAULT_PATH)) {
    throw new Error('Invalid path');
  }

  return fullPath;
}

// Utility: Get relative path from vault root
function getRelativePath(fullPath) {
  return path.relative(VAULT_PATH, fullPath);
}

// Utility: Parse backlinks from markdown content
function parseBacklinks(content) {
  const backlinkRegex = /\[\[([^\]]+)\]\]/g;
  const links = [];
  let match;

  while ((match = backlinkRegex.exec(content)) !== null) {
    let linkText = match[1];
    // Handle alias syntax: [[note|alias]] -> extract "note"
    if (linkText.includes('|')) {
      linkText = linkText.split('|')[0];
    }
    links.push(linkText.trim());
  }

  return links;
}

// Utility: Find note path by name (supports folder/note syntax)
async function findNotePath(noteName) {
  // Normalize the note name
  const normalized = noteName.endsWith('.md') ? noteName : `${noteName}.md`;

  // Check if it's already a path-like reference
  if (normalized.includes('/') || normalized.includes('\\')) {
    const fullPath = sanitizePath(normalized);
    if (fsSync.existsSync(fullPath)) {
      return getRelativePath(fullPath);
    }
  }

  // Search through all files
  for (const file of fileCache) {
    const fileName = path.basename(file);
    if (fileName === normalized) {
      return file;
    }
  }

  return null;
}

// Utility: Recursively get all markdown files
async function getAllMarkdownFiles(dir = VAULT_PATH, fileList = []) {
  try {
    const files = await fs.readdir(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        await getAllMarkdownFiles(filePath, fileList);
      } else if (file.endsWith('.md')) {
        fileList.push(getRelativePath(filePath));
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }

  return fileList;
}

// Utility: Build backlink graph
async function buildBacklinkGraph() {
  backlinkGraph.clear();

  for (const filePath of fileCache) {
    const fullPath = sanitizePath(filePath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const links = parseBacklinks(content);

      for (const link of links) {
        const targetPath = await findNotePath(link);
        if (targetPath) {
          if (!backlinkGraph.has(targetPath)) {
            backlinkGraph.set(targetPath, []);
          }
          backlinkGraph.get(targetPath).push(filePath);
        }
      }
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error.message);
    }
  }
}

// Initialize cache
async function initializeCache() {
  console.log('Initializing file cache...');
  fileCache = await getAllMarkdownFiles();
  await buildBacklinkGraph();
  console.log(`Cached ${fileCache.length} files`);
}

// API: List all notes
app.get('/api/notes', async (req, res) => {
  try {
    const notes = fileCache.map(filePath => ({
      path: filePath,
      name: path.basename(filePath, '.md')
    }));
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get note content and metadata
app.get('/api/notes/*', async (req, res) => {
  try {
    const notePath = req.params[0];
    const fullPath = sanitizePath(notePath);

    const content = await fs.readFile(fullPath, 'utf-8');
    const outgoingLinks = parseBacklinks(content);
    const backlinks = backlinkGraph.get(notePath) || [];

    // Resolve outgoing links to paths
    const resolvedOutgoingLinks = [];
    for (const link of outgoingLinks) {
      const targetPath = await findNotePath(link);
      if (targetPath) {
        resolvedOutgoingLinks.push(targetPath);
      }
    }

    res.json({
      path: notePath,
      name: path.basename(notePath, '.md'),
      content,
      backlinks: [...new Set(backlinks)], // Remove duplicates
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

// API: Create new note
app.post('/api/notes', async (req, res) => {
  try {
    const { path: notePath, content = '' } = req.body;

    if (!notePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const fullPath = sanitizePath(notePath);

    // Check if file already exists
    if (fsSync.existsSync(fullPath)) {
      return res.status(409).json({ error: 'Note already exists' });
    }

    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Create the file
    await fs.writeFile(fullPath, content, 'utf-8');

    // Update cache
    fileCache.push(notePath);
    await buildBacklinkGraph();

    res.json({
      success: true,
      path: notePath,
      name: path.basename(notePath, '.md')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Update note content
app.put('/api/notes/*', async (req, res) => {
  try {
    const notePath = req.params[0];
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const fullPath = sanitizePath(notePath);
    await fs.writeFile(fullPath, content, 'utf-8');

    // Update backlink graph
    await buildBacklinkGraph();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Delete note
app.delete('/api/notes/*', async (req, res) => {
  try {
    const notePath = req.params[0];
    const fullPath = sanitizePath(notePath);

    await fs.unlink(fullPath);

    // Update cache
    fileCache = fileCache.filter(p => p !== notePath);
    await buildBacklinkGraph();

    res.json({ success: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Note not found' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// API: Rename note and update backlinks
app.post('/api/notes/*/rename', async (req, res) => {
  try {
    const oldPath = req.params[0];
    const { newPath } = req.body;

    if (!newPath) {
      return res.status(400).json({ error: 'New path is required' });
    }

    const oldFullPath = sanitizePath(oldPath);
    const newFullPath = sanitizePath(newPath);

    // Check if new path already exists
    if (fsSync.existsSync(newFullPath)) {
      return res.status(409).json({ error: 'Target path already exists' });
    }

    // Create directory for new path if needed
    const newDir = path.dirname(newFullPath);
    await fs.mkdir(newDir, { recursive: true });

    // Rename the file
    await fs.rename(oldFullPath, newFullPath);

    // Update backlinks in other files
    const oldName = path.basename(oldPath, '.md');
    const newName = path.basename(newPath, '.md');

    const backlinks = backlinkGraph.get(oldPath) || [];

    for (const backlinkPath of backlinks) {
      const fullPath = sanitizePath(backlinkPath);
      let content = await fs.readFile(fullPath, 'utf-8');

      // Replace [[oldName]] with [[newName]]
      const regex1 = new RegExp(`\\[\\[${oldName}\\]\\]`, 'g');
      const regex2 = new RegExp(`\\[\\[${oldName}\\|`, 'g');

      content = content.replace(regex1, `[[${newName}]]`);
      content = content.replace(regex2, `[[${newName}|`);

      await fs.writeFile(fullPath, content, 'utf-8');
    }

    // Update cache
    fileCache = fileCache.map(p => p === oldPath ? newPath : p);
    await buildBacklinkGraph();

    res.json({
      success: true,
      updatedBacklinks: backlinks.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get backlinks for a note
app.get('/api/backlinks/*', async (req, res) => {
  try {
    const notePath = req.params[0];
    const backlinks = backlinkGraph.get(notePath) || [];

    res.json({
      path: notePath,
      backlinks: [...new Set(backlinks)]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File watcher for external changes
function setupFileWatcher() {
  const watcher = chokidar.watch(VAULT_PATH, {
    ignored: /(^|[\/\\])\../, // Ignore dotfiles
    persistent: true,
    ignoreInitial: true
  });

  watcher
    .on('add', async (filePath) => {
      if (filePath.endsWith('.md')) {
        const relativePath = getRelativePath(filePath);
        if (!fileCache.includes(relativePath)) {
          fileCache.push(relativePath);
          await buildBacklinkGraph();
          console.log(`File added: ${relativePath}`);
        }
      }
    })
    .on('unlink', async (filePath) => {
      if (filePath.endsWith('.md')) {
        const relativePath = getRelativePath(filePath);
        fileCache = fileCache.filter(p => p !== relativePath);
        await buildBacklinkGraph();
        console.log(`File removed: ${relativePath}`);
      }
    })
    .on('change', async (filePath) => {
      if (filePath.endsWith('.md')) {
        await buildBacklinkGraph();
        console.log(`File changed: ${getRelativePath(filePath)}`);
      }
    });

  console.log('File watcher initialized');
}

// Initialize and start server
async function start() {
  try {
    // Ensure vault directory exists
    await fs.mkdir(VAULT_PATH, { recursive: true });

    // Initialize cache
    await initializeCache();

    // Setup file watcher
    setupFileWatcher();

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Vault path: ${VAULT_PATH}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
