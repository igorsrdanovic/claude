// ============================================
// STATE MANAGEMENT
// ============================================
let allNotes = [];
let currentNote = null;
let saveTimeout = null;
let currentBacklinks = [];
let currentUser = null;
let allTags = new Map(); // tag -> count
let recentNotes = []; // Array of {path, name, timestamp}
let isDarkMode = false;

// ============================================
// DOM ELEMENTS
// ============================================
const fileTree = document.getElementById('file-tree');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const noteTitle = document.getElementById('note-title');
const searchInput = document.getElementById('search-input');
const saveStatus = document.getElementById('save-status');
const backLinksList = document.getElementById('backlinks-list');
const backlinksCount = document.getElementById('backlinks-count');
const newNoteBtn = document.getElementById('new-note-btn');
const deleteNoteBtn = document.getElementById('delete-note-btn');
const newNoteModal = document.getElementById('new-note-modal');
const newNoteForm = document.getElementById('new-note-form');
const newNoteName = document.getElementById('new-note-name');
const newNoteFolder = document.getElementById('new-note-folder');
const newNoteTemplate = document.getElementById('new-note-template');
const cancelBtn = document.getElementById('cancel-btn');
const userEmail = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

// New feature elements
const themeToggle = document.getElementById('theme-toggle');
const dailyNoteBtn = document.getElementById('daily-note-btn');
const wordCount = document.getElementById('word-count');
const charCount = document.getElementById('char-count');
const exportBtn = document.getElementById('export-btn');
const exportModal = document.getElementById('export-modal');
const exportCancelBtn = document.getElementById('export-cancel-btn');
const graphBtn = document.getElementById('graph-btn');
const graphModal = document.getElementById('graph-modal');
const graphCanvas = document.getElementById('graph-canvas');
const graphClose = document.getElementById('graph-close');
const graphReset = document.getElementById('graph-reset');
const quickSwitcher = document.getElementById('quick-switcher');
const quickSwitcherInput = document.getElementById('quick-switcher-input');
const quickSwitcherResults = document.getElementById('quick-switcher-results');
const tagsList = document.getElementById('tags-list');
const recentNotesList = document.getElementById('recent-notes-list');

// Sidebar tabs
const sidebarTabs = document.querySelectorAll('.sidebar-tab');
const sidebarPanels = document.querySelectorAll('.sidebar-panel');

// ============================================
// TEMPLATES
// ============================================
const templates = {
  blank: '',
  daily: (date) => `# Daily Note - ${date}\n\n## Tasks\n- [ ] \n\n## Notes\n\n## Reflection\n\n`,
  meeting: () => `# Meeting Notes\n\n**Date:** ${new Date().toLocaleDateString()}\n**Attendees:**\n\n## Agenda\n1. \n\n## Discussion\n\n## Action Items\n- [ ] \n\n`,
  project: () => `# Project Title\n\n## Overview\n\n## Goals\n- \n\n## Tasks\n- [ ] \n\n## Resources\n- [[Related Note]]\n\n## Timeline\n\n`
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Format date for daily notes
function formatDate(date = new Date()) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Get template content
function getTemplateContent(templateName) {
  if (!templateName || templateName === 'blank') return '';
  const template = templates[templateName];
  return typeof template === 'function' ? template(formatDate()) : template;
}

// Parse tags from content
function parseTags(content) {
  const tagRegex = /#([a-zA-Z0-9_-]+)/g;
  const tags = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    tags.push(match[1]);
  }
  return [...new Set(tags)]; // Remove duplicates
}

// Build tags index from all notes
async function buildTagsIndex() {
  allTags.clear();
  for (const note of allNotes) {
    try {
      const response = await fetch(`/api/notes/${note.path}`);
      if (response.ok) {
        const data = await response.json();
        const tags = parseTags(data.content);
        tags.forEach(tag => {
          allTags.set(tag, (allTags.get(tag) || 0) + 1);
        });
      }
    } catch (error) {
      console.error(`Error reading ${note.path} for tags:`, error);
    }
  }
  renderTagsList();
}

// Render tags list
function renderTagsList() {
  if (allTags.size === 0) {
    tagsList.innerHTML = '<p class="empty-state">No tags found</p>';
    return;
  }

  const sortedTags = Array.from(allTags.entries())
    .sort((a, b) => b[1] - a[1]); // Sort by count descending

  tagsList.innerHTML = sortedTags.map(([tag, count]) => `
    <div class="tag-item" data-tag="${tag}">
      <span class="tag-name">#${tag}</span>
      <span class="tag-count">${count}</span>
    </div>
  `).join('');

  // Add click handlers
  tagsList.querySelectorAll('.tag-item').forEach(item => {
    item.addEventListener('click', () => {
      const tag = item.dataset.tag;
      searchInput.value = `#${tag}`;
      searchInput.dispatchEvent(new Event('input'));
      switchTab('files');
    });
  });
}

// Recent notes management
function addToRecentNotes(notePath, noteName) {
  // Remove if already exists
  recentNotes = recentNotes.filter(n => n.path !== notePath);

  // Add to beginning
  recentNotes.unshift({
    path: notePath,
    name: noteName,
    timestamp: Date.now()
  });

  // Keep only last 20
  recentNotes = recentNotes.slice(0, 20);

  // Save to localStorage
  localStorage.setItem('recentNotes', JSON.stringify(recentNotes));

  renderRecentNotes();
}

// Load recent notes from localStorage
function loadRecentNotes() {
  try {
    const stored = localStorage.getItem('recentNotes');
    if (stored) {
      recentNotes = JSON.parse(stored);
      // Filter out notes that no longer exist
      recentNotes = recentNotes.filter(rn =>
        allNotes.some(n => n.path === rn.path)
      );
    }
  } catch (error) {
    console.error('Error loading recent notes:', error);
    recentNotes = [];
  }
  renderRecentNotes();
}

// Render recent notes
function renderRecentNotes() {
  if (recentNotes.length === 0) {
    recentNotesList.innerHTML = '<p class="empty-state">No recent notes</p>';
    return;
  }

  recentNotesList.innerHTML = recentNotes.map(note => {
    const timeAgo = getTimeAgo(note.timestamp);
    return `
      <div class="recent-note-item" data-path="${note.path}">
        <div class="recent-note-name">${note.name}</div>
        <div class="recent-note-time">${timeAgo}</div>
      </div>
    `;
  }).join('');

  // Add click handlers
  recentNotesList.querySelectorAll('.recent-note-item').forEach(item => {
    item.addEventListener('click', () => {
      loadNote(item.dataset.path);
      switchTab('files');
    });
  });
}

// Get time ago string
function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Update word and character count
function updateWordCount() {
  const text = editor.value;
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const chars = text.length;

  wordCount.textContent = words;
  charCount.textContent = chars;
}

// ============================================
// DARK MODE
// ============================================
function initDarkMode() {
  const saved = localStorage.getItem('darkMode');
  isDarkMode = saved === 'true';
  applyDarkMode();
}

function toggleDarkMode() {
  isDarkMode = !isDarkMode;
  localStorage.setItem('darkMode', isDarkMode);
  applyDarkMode();
}

function applyDarkMode() {
  if (isDarkMode) {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = '☀️ Light Mode';
  } else {
    document.body.classList.remove('dark-mode');
    themeToggle.textContent = '🌙 Dark Mode';
  }
}

// ============================================
// SIDEBAR TABS
// ============================================
function switchTab(tabName) {
  sidebarTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  sidebarPanels.forEach(panel => {
    const panelId = panel.id.replace('-panel', '');
    panel.classList.toggle('active', panelId === tabName);
  });
}

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
  try {
    const response = await fetch('/auth/me');
    if (response.ok) {
      currentUser = await response.json();
      userEmail.textContent = currentUser.email;
      return true;
    } else {
      window.location.href = '/login.html';
      return false;
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/login.html';
    return false;
  }
}

async function handleLogout() {
  try {
    const response = await fetch('/auth/logout', { method: 'POST' });
    if (response.ok) {
      window.location.href = '/login.html';
    }
  } catch (error) {
    console.error('Logout failed:', error);
    alert('Logout failed. Please try again.');
  }
}

// ============================================
// NOTES API
// ============================================
async function loadNotes() {
  try {
    const response = await fetch('/api/notes');
    if (response.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    allNotes = await response.json();
    renderFileTree(allNotes);
    loadRecentNotes();
    await buildTagsIndex();
  } catch (error) {
    console.error('Error loading notes:', error);
  }
}

async function loadNote(notePath) {
  try {
    const response = await fetch(`/api/notes/${notePath}`);
    if (!response.ok) throw new Error('Note not found');

    currentNote = await response.json();

    noteTitle.value = currentNote.name;
    editor.value = currentNote.content;
    currentBacklinks = currentNote.backlinks || [];

    updatePreview();
    renderBacklinks();
    updateWordCount();

    document.querySelectorAll('.file-item').forEach(item => {
      item.classList.toggle('active', item.dataset.path === notePath);
    });

    addToRecentNotes(notePath, currentNote.name);

    history.pushState({ notePath }, '', `#${notePath}`);
  } catch (error) {
    console.error('Error loading note:', error);
    alert('Failed to load note');
  }
}

// ============================================
// FILE TREE RENDERING
// ============================================
function renderFileTree(notes) {
  const searchTerm = searchInput.value.toLowerCase();
  const filteredNotes = notes.filter(note => {
    if (searchTerm.startsWith('#')) {
      // Tag search
      const tag = searchTerm.substring(1);
      return note.name.toLowerCase().includes(tag);
    }
    return note.name.toLowerCase().includes(searchTerm) ||
           note.path.toLowerCase().includes(searchTerm);
  });

  const tree = {};

  filteredNotes.forEach(note => {
    const parts = note.path.split('/');
    let current = tree;

    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        if (!current._files) current._files = [];
        current._files.push(note);
      } else {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    });
  });

  fileTree.innerHTML = '';
  renderTreeNode(tree, fileTree, '');
}

function renderTreeNode(node, container, path) {
  Object.keys(node).forEach(key => {
    if (key === '_files') return;

    const folderPath = path ? `${path}/${key}` : key;
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder';

    const folderItem = document.createElement('div');
    folderItem.className = 'folder-item';
    folderItem.innerHTML = `<span class="folder-icon">📁</span> ${key}`;

    const folderContent = document.createElement('div');
    folderContent.className = 'folder-content';

    folderItem.addEventListener('click', () => {
      folderContent.classList.toggle('collapsed');
      folderItem.querySelector('.folder-icon').textContent =
        folderContent.classList.contains('collapsed') ? '📁' : '📂';
    });

    folderDiv.appendChild(folderItem);
    folderDiv.appendChild(folderContent);
    container.appendChild(folderDiv);

    renderTreeNode(node[key], folderContent, folderPath);
  });

  if (node._files) {
    node._files.forEach(note => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.innerHTML = `<span class="file-icon">📄</span> ${note.name}`;
      fileItem.dataset.path = note.path;

      if (currentNote && currentNote.path === note.path) {
        fileItem.classList.add('active');
      }

      fileItem.addEventListener('click', () => loadNote(note.path));
      container.appendChild(fileItem);
    });
  }
}

// ============================================
// MARKDOWN PREVIEW WITH ENHANCEMENTS
// ============================================
function updatePreview() {
  if (!currentNote) return;

  // Use marked.js if available, otherwise fallback to simple rendering
  let html;
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      highlight: function(code, lang) {
        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return code;
      },
      breaks: true,
      gfm: true
    });
    html = marked.parse(currentNote.content);
  } else {
    html = renderMarkdownSimple(currentNote.content);
  }

  // Convert [[backlinks]]
  html = html.replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
    const parts = linkText.split('|');
    const noteName = parts[0].trim();
    const displayText = parts[1] ? parts[1].trim() : noteName;

    const targetNote = allNotes.find(n =>
      n.name === noteName || n.path === noteName || n.path === `${noteName}.md`
    );

    if (targetNote) {
      return `<a href="#" class="backlink" data-note="${targetNote.path}">${displayText}</a>`;
    } else {
      return `<span class="backlink unresolved" title="Note not found">${displayText}</span>`;
    }
  });

  // Convert task lists
  html = html.replace(/<li>\[ \] (.+?)<\/li>/g, '<li class="task-list-item"><input type="checkbox"> $1</li>');
  html = html.replace(/<li>\[x\] (.+?)<\/li>/g, '<li class="task-list-item checked"><input type="checkbox" checked> $1</li>');

  // Convert tags to clickable
  html = html.replace(/#([a-zA-Z0-9_-]+)/g, '<span class="tag" data-tag="$1">#$1</span>');

  preview.innerHTML = html;

  // Add click handlers to backlinks
  preview.querySelectorAll('.backlink').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const notePath = link.dataset.note;
      if (notePath) {
        loadNote(notePath);
      }
    });
  });

  // Add click handlers to tags
  preview.querySelectorAll('.tag').forEach(tag => {
    tag.addEventListener('click', () => {
      searchInput.value = `#${tag.dataset.tag}`;
      searchInput.dispatchEvent(new Event('input'));
      switchTab('files');
    });
  });

  // Highlight code blocks if hljs is available
  if (typeof hljs !== 'undefined') {
    preview.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }
}

// Simple markdown renderer fallback
function renderMarkdownSimple(text) {
  let html = text;

  html = html.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;');

  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  html = html.split('\n\n').map(para => {
    if (para.match(/^<[h|u|o|p|l]/)) return para;
    return `<p>${para}</p>`;
  }).join('\n');

  return html;
}

function renderBacklinks() {
  backlinksCount.textContent = currentBacklinks.length;

  if (currentBacklinks.length === 0) {
    backLinksList.innerHTML = '<p class="empty-state">No backlinks</p>';
    return;
  }

  backLinksList.innerHTML = '';
  currentBacklinks.forEach(backlinkPath => {
    const note = allNotes.find(n => n.path === backlinkPath);
    if (!note) return;

    const item = document.createElement('div');
    item.className = 'backlink-item';
    item.textContent = note.name;
    item.addEventListener('click', () => loadNote(backlinkPath));
    backLinksList.appendChild(item);
  });
}

// ============================================
// AUTO-SAVE
// ============================================
function saveNote() {
  if (!currentNote) return;

  clearTimeout(saveTimeout);
  saveStatus.textContent = 'Saving...';
  saveStatus.className = 'save-status saving';

  saveTimeout = setTimeout(async () => {
    try {
      const response = await fetch(`/api/notes/${currentNote.path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editor.value })
      });

      if (!response.ok) throw new Error('Failed to save');

      saveStatus.textContent = 'Saved';
      saveStatus.className = 'save-status saved';

      currentNote.content = editor.value;
      updatePreview();

      await loadNotes();

      const updatedNote = await fetch(`/api/notes/${currentNote.path}`).then(r => r.json());
      currentBacklinks = updatedNote.backlinks || [];
      renderBacklinks();

    } catch (error) {
      console.error('Error saving note:', error);
      saveStatus.textContent = 'Error';
      saveStatus.className = 'save-status';
    }
  }, 1000);
}

// ============================================
// NOTE CREATION
// ============================================
async function createNote(name, folder, template) {
  try {
    const fileName = name.endsWith('.md') ? name : `${name}.md`;
    const notePath = folder ? `${folder}/${fileName}` : fileName;
    const templateContent = getTemplateContent(template);
    const content = templateContent || `# ${name}\n\n`;

    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: notePath, content })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    await loadNotes();
    await loadNote(notePath);
    closeModal();
  } catch (error) {
    console.error('Error creating note:', error);
    alert('Failed to create note: ' + error.message);
  }
}

// ============================================
// NOTE DELETION
// ============================================
async function deleteNote() {
  if (!currentNote) return;
  if (!confirm(`Delete "${currentNote.name}"?`)) return;

  try {
    const response = await fetch(`/api/notes/${currentNote.path}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Failed to delete');

    await loadNotes();

    if (allNotes.length > 0) {
      await loadNote(allNotes[0].path);
    } else {
      currentNote = null;
      editor.value = '';
      preview.innerHTML = '';
      noteTitle.value = '';
      currentBacklinks = [];
      renderBacklinks();
    }
  } catch (error) {
    console.error('Error deleting note:', error);
    alert('Failed to delete note');
  }
}

// ============================================
// DAILY NOTES
// ============================================
async function openDailyNote() {
  const today = formatDate();
  const dailyNotePath = `daily/${today}.md`;

  const existingNote = allNotes.find(n => n.path === dailyNotePath);

  if (existingNote) {
    await loadNote(dailyNotePath);
  } else {
    await createNote(today, 'daily', 'daily');
  }
}

// ============================================
// TOOLBAR ACTIONS
// ============================================
function insertAtCursor(before, after = '') {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selectedText = editor.value.substring(start, end);
  const replacement = before + selectedText + after;

  editor.value = editor.value.substring(0, start) + replacement + editor.value.substring(end);
  editor.selectionStart = editor.selectionEnd = start + before.length + selectedText.length;
  editor.focus();

  saveNote();
}

function handleToolbarAction(action) {
  switch (action) {
    case 'bold':
      insertAtCursor('**', '**');
      break;
    case 'italic':
      insertAtCursor('*', '*');
      break;
    case 'code':
      insertAtCursor('`', '`');
      break;
    case 'h1':
      insertAtCursor('# ');
      break;
    case 'h2':
      insertAtCursor('## ');
      break;
    case 'h3':
      insertAtCursor('### ');
      break;
    case 'ul':
      insertAtCursor('- ');
      break;
    case 'ol':
      insertAtCursor('1. ');
      break;
    case 'task':
      insertAtCursor('- [ ] ');
      break;
    case 'link':
      insertAtCursor('[', '](url)');
      break;
    case 'backlink':
      insertAtCursor('[[', ']]');
      break;
    case 'codeblock':
      insertAtCursor('```\n', '\n```');
      break;
  }
}

// ============================================
// EXPORT FUNCTIONALITY
// ============================================
function openExportModal() {
  exportModal.classList.add('open');
}

function closeExportModal() {
  exportModal.classList.remove('open');
}

async function exportNote(format) {
  if (!currentNote) return;

  try {
    switch (format) {
      case 'markdown':
        exportAsMarkdown();
        break;
      case 'html':
        exportAsHTML();
        break;
      case 'pdf':
        await exportAsPDF();
        break;
    }
    closeExportModal();
  } catch (error) {
    console.error('Export error:', error);
    alert('Failed to export: ' + error.message);
  }
}

function exportAsMarkdown() {
  const blob = new Blob([currentNote.content], { type: 'text/markdown' });
  downloadBlob(blob, `${currentNote.name}.md`);
}

function exportAsHTML() {
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${currentNote.name}</title>
  <style>
    body {
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.6;
      color: #333;
    }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
    }
    pre {
      background: #f4f4f4;
      padding: 16px;
      border-radius: 4px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  ${preview.innerHTML}
</body>
</html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  downloadBlob(blob, `${currentNote.name}.html`);
}

async function exportAsPDF() {
  if (typeof html2pdf === 'undefined') {
    alert('PDF export library not loaded. Please refresh the page.');
    return;
  }

  const element = preview.cloneNode(true);
  const opt = {
    margin: 1,
    filename: `${currentNote.name}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  await html2pdf().set(opt).from(element).save();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// GRAPH VIEW
// ============================================
function openGraphView() {
  graphModal.classList.add('open');
  setTimeout(() => renderGraph(), 100);
}

function closeGraphView() {
  graphModal.classList.remove('open');
}

function renderGraph() {
  const canvas = graphCanvas;
  const ctx = canvas.getContext('2d');

  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const width = canvas.width;
  const height = canvas.height;

  // Simple force-directed graph
  const nodes = allNotes.map((note, index) => ({
    id: note.path,
    name: note.name,
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
    isCurrent: currentNote && note.path === currentNote.path
  }));

  const links = [];
  allNotes.forEach(note => {
    const backlinks = currentNote?.backlinks || [];
    const outgoingLinks = currentNote?.outgoingLinks || [];

    if (backlinks.includes(note.path) || outgoingLinks.includes(note.path)) {
      links.push({
        source: currentNote.path,
        target: note.path
      });
    }
  });

  // Simple physics simulation
  function simulate() {
    ctx.clearRect(0, 0, width, height);

    // Draw links
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    links.forEach(link => {
      const source = nodes.find(n => n.id === link.source);
      const target = nodes.find(n => n.id === link.target);
      if (source && target) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    });

    // Draw nodes
    nodes.forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);

      if (node.isCurrent) {
        ctx.fillStyle = '#4a90e2';
      } else if (links.some(l => l.source === node.id || l.target === node.id)) {
        ctx.fillStyle = '#7c3aed';
      } else {
        ctx.fillStyle = '#999';
      }

      ctx.fill();

      // Draw label
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.fillText(node.name, node.x + 12, node.y + 4);
    });
  }

  simulate();
}

// ============================================
// QUICK SWITCHER (Cmd+P)
// ============================================
function openQuickSwitcher() {
  quickSwitcher.classList.add('open');
  quickSwitcherInput.value = '';
  quickSwitcherInput.focus();
  renderQuickSwitcherResults('');
}

function closeQuickSwitcher() {
  quickSwitcher.classList.remove('open');
}

function renderQuickSwitcherResults(query) {
  const lowerQuery = query.toLowerCase();

  const results = allNotes
    .filter(note => {
      return note.name.toLowerCase().includes(lowerQuery) ||
             note.path.toLowerCase().includes(lowerQuery);
    })
    .slice(0, 10);

  if (results.length === 0) {
    quickSwitcherResults.innerHTML = '<p class="empty-state">No results</p>';
    return;
  }

  quickSwitcherResults.innerHTML = results.map((note, index) => `
    <div class="quick-switcher-item ${index === 0 ? 'selected' : ''}" data-path="${note.path}">
      <div class="quick-switcher-item-icon">📄</div>
      <div class="quick-switcher-item-text">
        <div class="quick-switcher-item-name">${note.name}</div>
        <div class="quick-switcher-item-path">${note.path}</div>
      </div>
    </div>
  `).join('');

  quickSwitcherResults.querySelectorAll('.quick-switcher-item').forEach(item => {
    item.addEventListener('click', () => {
      loadNote(item.dataset.path);
      closeQuickSwitcher();
    });
  });
}

// ============================================
// MODAL FUNCTIONS
// ============================================
function openModal() {
  newNoteModal.classList.add('open');
  newNoteName.focus();
}

function closeModal() {
  newNoteModal.classList.remove('open');
  newNoteForm.reset();
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // Editor input
  editor.addEventListener('input', () => {
    saveNote();
    updateWordCount();
  });

  // Search
  searchInput.addEventListener('input', () => {
    renderFileTree(allNotes);
  });

  // Theme toggle
  themeToggle.addEventListener('click', toggleDarkMode);

  // Daily note
  dailyNoteBtn.addEventListener('click', openDailyNote);

  // New note button
  newNoteBtn.addEventListener('click', openModal);

  // Delete note button
  deleteNoteBtn.addEventListener('click', deleteNote);

  // Logout button
  logoutBtn.addEventListener('click', handleLogout);

  // Export button
  exportBtn.addEventListener('click', openExportModal);
  exportCancelBtn.addEventListener('click', closeExportModal);

  // Graph button
  graphBtn.addEventListener('click', openGraphView);
  graphClose.addEventListener('click', closeGraphView);
  graphReset.addEventListener('click', () => {
    closeGraphView();
    setTimeout(openGraphView, 100);
  });

  // Export options
  document.querySelectorAll('.export-option').forEach(option => {
    option.addEventListener('click', () => {
      exportNote(option.dataset.format);
    });
  });

  // Sidebar tabs
  sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Toolbar buttons
  document.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action) {
        handleToolbarAction(action);
      }
    });
  });

  // Modal
  cancelBtn.addEventListener('click', closeModal);

  newNoteModal.addEventListener('click', (e) => {
    if (e.target === newNoteModal) closeModal();
  });

  exportModal.addEventListener('click', (e) => {
    if (e.target === exportModal) closeExportModal();
  });

  graphModal.addEventListener('click', (e) => {
    if (e.target === graphModal) closeGraphView();
  });

  quickSwitcher.addEventListener('click', (e) => {
    if (e.target === quickSwitcher) closeQuickSwitcher();
  });

  newNoteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = newNoteName.value.trim();
    const folder = newNoteFolder.value.trim();
    const template = newNoteTemplate.value;

    if (name) {
      createNote(name, folder, template);
    }
  });

  // Quick switcher input
  quickSwitcherInput.addEventListener('input', (e) => {
    renderQuickSwitcherResults(e.target.value);
  });

  quickSwitcherInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeQuickSwitcher();
    } else if (e.key === 'Enter') {
      const selected = quickSwitcherResults.querySelector('.selected');
      if (selected) {
        loadNote(selected.dataset.path);
        closeQuickSwitcher();
      }
    }
  });

  // Browser back/forward
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.notePath) {
      loadNote(e.state.notePath);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + P: Quick switcher
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      openQuickSwitcher();
    }

    // Ctrl/Cmd + N: New note
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openModal();
    }

    // Ctrl/Cmd + S: Manual save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveNote();
    }

    // Ctrl/Cmd + B: Bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b' && document.activeElement === editor) {
      e.preventDefault();
      handleToolbarAction('bold');
    }

    // Ctrl/Cmd + I: Italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i' && document.activeElement === editor) {
      e.preventDefault();
      handleToolbarAction('italic');
    }

    // Escape: Close modals
    if (e.key === 'Escape') {
      if (newNoteModal.classList.contains('open')) {
        closeModal();
      }
      if (exportModal.classList.contains('open')) {
        closeExportModal();
      }
      if (graphModal.classList.contains('open')) {
        closeGraphView();
      }
      if (quickSwitcher.classList.contains('open')) {
        closeQuickSwitcher();
      }
    }
  });

  // Handle initial URL hash
  if (window.location.hash) {
    const notePath = window.location.hash.substring(1);
    loadNote(notePath);
  }
}

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;

  initDarkMode();

  await loadNotes();
  setupEventListeners();

  if (allNotes.length > 0) {
    await loadNote(allNotes[0].path);
  }
}

// Start the app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
