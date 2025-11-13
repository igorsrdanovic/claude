#!/usr/bin/env node

/**
 * Migration script for converting single-user vault to multi-user structure
 *
 * Usage: node migrate.js [email]
 *
 * This script will:
 * 1. Create a default user with the provided email
 * 2. Move ./vault to ./vaults/user-1
 * 3. Update the database
 */

const fs = require('fs');
const path = require('path');
const { initializeDatabase, userOps } = require('./database');

const SINGLE_VAULT_PATH = path.join(__dirname, 'vault');
const VAULTS_BASE_PATH = path.join(__dirname, 'vaults');

async function migrate() {
  console.log('🚀 Starting migration to multi-user structure...\n');

  // Get email from command line
  const email = process.argv[2];
  if (!email) {
    console.error('❌ Error: Email address is required');
    console.log('\nUsage: node migrate.js <email>');
    console.log('Example: node migrate.js user@example.com\n');
    process.exit(1);
  }

  // Validate email
  if (!email.includes('@')) {
    console.error('❌ Error: Invalid email address');
    process.exit(1);
  }

  try {
    // Initialize database
    console.log('📦 Initializing database...');
    initializeDatabase();

    // Check if user already exists
    let user = userOps.findByEmail(email);

    if (user) {
      console.log(`✓ User already exists: ${email} (ID: ${user.id})`);
    } else {
      // Create default user
      console.log(`Creating default user: ${email}`);
      const name = email.split('@')[0];
      user = userOps.create(email, name, null);
      console.log(`✓ User created with ID: ${user.id}`);
    }

    // Check if old vault exists
    if (!fs.existsSync(SINGLE_VAULT_PATH)) {
      console.log('\n⚠️  No ./vault directory found. Nothing to migrate.');
      console.log('Migration complete!');
      return;
    }

    // Create vaults directory
    if (!fs.existsSync(VAULTS_BASE_PATH)) {
      fs.mkdirSync(VAULTS_BASE_PATH, { recursive: true });
      console.log('✓ Created vaults directory');
    }

    // Determine target path
    const targetPath = path.join(VAULTS_BASE_PATH, `user-${user.id}`);

    // Check if target already exists
    if (fs.existsSync(targetPath)) {
      console.log(`\n⚠️  Warning: ${targetPath} already exists`);
      console.log('Do you want to merge ./vault into the existing user vault?');
      console.log('This will overwrite any files with the same name.');

      // For now, we'll just warn and skip
      console.log('\n❌ Skipping vault migration to prevent data loss.');
      console.log('Please manually merge the vaults if needed.');
      return;
    }

    // Move vault
    console.log(`\n📁 Moving ./vault to ${targetPath}...`);
    fs.renameSync(SINGLE_VAULT_PATH, targetPath);
    console.log('✓ Vault moved successfully');

    console.log('\n✅ Migration complete!');
    console.log('\nNext steps:');
    console.log('1. Start the server: npm start');
    console.log('2. Login with magic link using:', email);
    console.log('   or set up Google OAuth in .env file');
    console.log('3. Your notes are now at:', targetPath);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run migration
migrate();
