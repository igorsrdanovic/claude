// DOM elements
const magicLinkForm = document.getElementById('magic-link-form');
const emailInput = document.getElementById('email');
const magicLinkBtn = document.getElementById('magic-link-btn');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  successMessage.style.display = 'none';
}

// Show success message
function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.style.display = 'block';
  errorMessage.style.display = 'none';
}

// Hide messages
function hideMessages() {
  errorMessage.style.display = 'none';
  successMessage.style.display = 'none';
}

// Handle URL parameters (error messages from server)
const urlParams = new URLSearchParams(window.location.search);
const error = urlParams.get('error');

if (error) {
  const errorMessages = {
    'invalid_token': 'Invalid or expired login link. Please request a new one.',
    'expired_token': 'Your login link has expired. Please request a new one.',
    'server_error': 'An error occurred. Please try again.'
  };

  showError(errorMessages[error] || 'An error occurred. Please try again.');

  // Clean URL
  window.history.replaceState({}, document.title, window.location.pathname);
}

// Handle magic link form submission
magicLinkForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessages();

  const email = emailInput.value.trim();

  if (!email) {
    showError('Please enter your email address.');
    return;
  }

  // Disable button and show loading state
  magicLinkBtn.disabled = true;
  const originalText = magicLinkBtn.textContent;
  magicLinkBtn.innerHTML = '<span class="spinner"></span> Sending...';

  try {
    const response = await fetch('/auth/magic-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (response.ok) {
      emailInput.value = '';

      if (data.simulated) {
        showSuccess(
          '✓ Magic link generated! Check the server console for the login link (SMTP not configured).'
        );
      } else {
        showSuccess(
          '✓ Magic link sent! Check your email and click the link to log in.'
        );
      }
    } else {
      if (response.status === 429) {
        showError('Too many login attempts. Please wait an hour and try again.');
      } else {
        showError(data.error || 'Failed to send magic link. Please try again.');
      }
    }
  } catch (error) {
    console.error('Magic link error:', error);
    showError('Network error. Please check your connection and try again.');
  } finally {
    // Re-enable button
    magicLinkBtn.disabled = false;
    magicLinkBtn.textContent = originalText;
  }
});

// Check if user is already logged in
async function checkAuth() {
  try {
    const response = await fetch('/auth/me');
    if (response.ok) {
      // User is already logged in, redirect to app
      window.location.href = '/';
    }
  } catch (error) {
    // Not logged in, stay on login page
  }
}

checkAuth();
