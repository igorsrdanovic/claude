const nodemailer = require('nodemailer');

// Create email transporter
function createTransporter() {
  // Check if SMTP is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('SMTP not configured. Email sending will be simulated.');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

const transporter = createTransporter();

// Send magic link email
async function sendMagicLink(email, token) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const verifyUrl = `${appUrl}/auth/verify?token=${token}`;

  const mailOptions = {
    from: process.env.SMTP_USER || 'noreply@notesapp.com',
    to: email,
    subject: 'Your login link',
    text: `Click here to log in:\n\n${verifyUrl}\n\nThis link expires in 15 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your Login Link</h2>
        <p>Click the button below to log in to your notes app:</p>
        <div style="margin: 30px 0;">
          <a href="${verifyUrl}"
             style="background-color: #4a90e2; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 4px; display: inline-block;">
            Log In
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br>
          <a href="${verifyUrl}">${verifyUrl}</a>
        </p>
        <p style="color: #999; font-size: 12px;">
          This link expires in 15 minutes.
        </p>
      </div>
    `
  };

  // If no transporter configured, just log the link
  if (!transporter) {
    console.log('\n=================================');
    console.log('MAGIC LINK (SMTP not configured):');
    console.log(`Email: ${email}`);
    console.log(`Link: ${verifyUrl}`);
    console.log('=================================\n');
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Magic link email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

// Verify transporter configuration
async function verifyEmailConfig() {
  if (!transporter) {
    return { configured: false, message: 'SMTP not configured' };
  }

  try {
    await transporter.verify();
    return { configured: true, message: 'Email configuration verified' };
  } catch (error) {
    return { configured: false, message: error.message };
  }
}

module.exports = {
  sendMagicLink,
  verifyEmailConfig
};
