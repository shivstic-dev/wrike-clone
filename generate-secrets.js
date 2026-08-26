#!/usr/bin/env node

/**
 * Generate secure random secrets for JWT tokens
 * Run with: node generate-secrets.js
 */

const crypto = require('crypto');

console.log('\n=== JWT Secret Generator ===\n');
console.log('Copy these to your Railway environment variables:\n');
console.log(`JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`);
console.log(`JWT_REFRESH_SECRET=${crypto.randomBytes(32).toString('hex')}`);
console.log('\n');
