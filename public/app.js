// State
let allNotes = [];
let currentNote = null;
let saveTimeout = null;
let currentBacklinks = [];
let currentUser = null;

// DOM elements
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
const cancelBtn = document.getElementById('cancel-btn');
const userEmail = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

// Check authentication
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

// Handle logout
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

// Initialize app
async function init() {
  // Check authentication first
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;

  await loadNotes();
  setupEventListeners();

  // Load first note if available
  if (allNotes.length > 0) {
    await loadNote(allNotes[0].path);
  }
}

// Load all notes from API
async function loadNotes() {
  try {
    const response = await fetch('/api/notes');
    if (response.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    allNotes = await response.json();
    renderFileTree(allNotes);
  } catch (error) {
    console.error('Error loading notes:', error);
  }
}

// Render file tree
function renderFileTree(notes) {
  const filteredNotes = notes.filter(note => {
    const searchTerm = searchInput.value.toLowerCase();
    return note.name.toLowerCase().includes(searchTerm) ||
           note.path.toLowerCase().includes(searchTerm);
  });

  // Build folder structure
  const tree = {};

  filteredNotes.forEach(note => {
    const parts = note.path.split('/');
    let current = tree;

    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        // It's a file
        if (!current._files) current._files = [];
        current._files.push(note);
      } else {
        // It's a folder
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

// Render tree node recursively
function renderTreeNode(node, container, path) {
  // Render folders first
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

  // Render files
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

// Load note content
async function loadNote(notePath) {
  try {
    const response = await fetch(`/api/notes/${notePath}`);
    if (!response.ok) throw new Error('Note not found');

    currentNote = await response.json();

    // Update UI
    noteTitle.value = currentNote.name;
    editor.value = currentNote.content;
    currentBacklinks = currentNote.backlinks || [];

    // Update preview
    updatePreview();

    // Update backlinks
    renderBacklinks();

    // Update file tree active state
    document.querySelectorAll('.file-item').forEach(item => {
      item.classList.toggle('active', item.dataset.path === notePath);
    });

    // Update browser history
    history.pushState({ notePath }, '', `#${notePath}`);
  } catch (error) {
    console.error('Error loading note:', error);
    alert('Failed to load note');
  }
}

// Update preview with markdown rendering
function updatePreview() {
  if (!currentNote) return;

  let html = renderMarkdown(currentNote.content);

  // Convert [[backlinks]] to clickable links
  html = html.replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
    const parts = linkText.split('|');
    const noteName = parts[0].trim();
    const displayText = parts[1] ? parts[1].trim() : noteName;

    // Check if note exists
    const targetNote = allNotes.find(n =>
      n.name === noteName || n.path === noteName || n.path === `${noteName}.md`
    );

    if (targetNote) {
      return `<a href="#" class="backlink" data-note="${targetNote.path}">${displayText}</a>`;
    } else {
      return `<span class="backlink unresolved" title="Note not found">${displayText}</span>`;
    }
  });

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
}

// Simple markdown renderer
function renderMarkdown(text) {
  let html = text;

  // Escape HTML
  html = html.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;');

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Inline code
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Lists
  html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Paragraphs
  html = html.split('\n\n').map(para => {
    if (para.match(/^<[h|u|o|p|l]/)) return para;
    return `<p>${para}</p>`;
  }).join('\n');

  return html;
}

// Render backlinks panel
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

// Save note with debounce
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

      // Update current note content
      currentNote.content = editor.value;

      // Update preview
      updatePreview();

      // Reload notes to update backlinks
      await loadNotes();

      // Refresh backlinks for current note
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

// Create new note
async function createNote(name, folder) {
  try {
    const fileName = name.endsWith('.md') ? name : `${name}.md`;
    const notePath = folder ? `${folder}/${fileName}` : fileName;

    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: notePath,
        content: `# ${name}\n\n`
      })
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

// Delete note
async function deleteNote() {
  if (!currentNote) return;

  if (!confirm(`Delete "${currentNote.name}"?`)) return;

  try {
    const response = await fetch(`/api/notes/${currentNote.path}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Failed to delete');

    await loadNotes();

    // Load first available note or clear editor
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

// Modal functions
function openModal() {
  newNoteModal.classList.add('open');
  newNoteName.focus();
}

function closeModal() {
  newNoteModal.classList.remove('open');
  newNoteForm.reset();
}

// Setup event listeners
function setupEventListeners() {
  // Editor input
  editor.addEventListener('input', () => {
    saveNote();
  });

  // Search
  searchInput.addEventListener('input', () => {
    renderFileTree(allNotes);
  });

  // New note button
  newNoteBtn.addEventListener('click', openModal);

  // Delete note button
  deleteNoteBtn.addEventListener('click', deleteNote);

  // Logout button
  logoutBtn.addEventListener('click', handleLogout);

  // Modal
  cancelBtn.addEventListener('click', closeModal);

  newNoteModal.addEventListener('click', (e) => {
    if (e.target === newNoteModal) closeModal();
  });

  newNoteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = newNoteName.value.trim();
    const folder = newNoteFolder.value.trim();

    if (name) {
      createNote(name, folder);
    }
  });

  // Browser back/forward
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.notePath) {
      loadNote(e.state.notePath);
    }
  });

  // Handle initial URL hash
  if (window.location.hash) {
    const notePath = window.location.hash.substring(1);
    loadNote(notePath);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + N: New note
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openModal();
    }

    // Ctrl/Cmd + S: Manual save (already auto-saving)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveNote();
    }

    // Escape: Close modal
    if (e.key === 'Escape' && newNoteModal.classList.contains('open')) {
      closeModal();
    }
  });
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
