// @ts-nocheck
/**
 * Authentication utilities for CLI
 */

export function getDirghaToken(): string | null {
  // Try environment variable first
  if (process.env.DIRGHA_TOKEN) {
    return process.env.DIRGHA_TOKEN;
  }
  
  // Try to read from config file
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const configPath = path.join(os.homedir(), '.dirgha', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.token || null;
    }
  } catch {
    // Ignore errors
  }
  
  return null;
}

export function saveDirghaToken(token: string): void {
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const dirghaDir = path.join(os.homedir(), '.dirgha');
    if (!fs.existsSync(dirghaDir)) {
      fs.mkdirSync(dirghaDir, { recursive: true });
    }
    
    const configPath = path.join(dirghaDir, 'config.json');
    let config = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    
    config.token = token;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Failed to save token:', err);
  }
}
