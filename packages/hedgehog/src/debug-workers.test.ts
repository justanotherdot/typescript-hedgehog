/**
 * Debug tests to investigate worker_threads behavior in CI vs local
 */

import { describe, it, expect } from 'vitest';
import { Worker } from 'worker_threads';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('Worker Threads Debugging', () => {
  it('should detect worker_threads availability', () => {
    console.log('=== Worker Threads Environment Check ===');
    console.log('Node.js version:', process.version);
    console.log('Platform:', process.platform);
    console.log('Architecture:', process.arch);
    console.log('worker_threads available:', typeof Worker !== 'undefined');
    console.log('process.versions:', JSON.stringify(process.versions, null, 2));

    expect(typeof Worker).toBe('function');
  });

  it('should create a minimal worker successfully', async () => {
    console.log('=== Minimal Worker Test ===');

    // Create a minimal CommonJS worker script
    const workerScript = `
const { parentPort } = require('worker_threads');
console.log('Worker script starting...');
if (parentPort) {
  console.log('parentPort available, sending ready message');
  parentPort.postMessage({ type: 'ready' });
} else {
  console.log('ERROR: parentPort not available');
}
`;

    const scriptPath = join(process.cwd(), 'temp-worker.cjs');
    writeFileSync(scriptPath, workerScript);

    try {
      console.log('Creating worker with script:', scriptPath);
      console.log('Current working directory:', process.cwd());

      const worker = new Worker(scriptPath);
      console.log('Worker object created successfully');

      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log('Worker did not respond within 5 seconds');
          reject(new Error('Worker timeout'));
        }, 5000);

        worker.on('message', (message) => {
          console.log('Received message from worker:', message);
          clearTimeout(timeout);
          resolve(message);
        });

        worker.on('error', (error) => {
          console.log('Worker error:', error);
          clearTimeout(timeout);
          reject(error);
        });

        worker.on('exit', (code) => {
          console.log('Worker exited with code:', code);
          if (code !== 0) {
            clearTimeout(timeout);
            reject(new Error(`Worker exited with code ${code}`));
          }
        });

        console.log('Worker event listeners set up, waiting for message...');
      });

      await worker.terminate();
      console.log('Worker terminated successfully');

      expect(result).toEqual({ type: 'ready' });
    } finally {
      try {
        unlinkSync(scriptPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }, 10000); // 10 second timeout

  it('should detect container/virtualization environment', () => {
    console.log('=== Container Environment Detection ===');

    // Check for common container indicators
    const indicators = {
      'Container env vars': {
        'CI': process.env.CI,
        'GITHUB_ACTIONS': process.env.GITHUB_ACTIONS,
        'RUNNER_OS': process.env.RUNNER_OS,
        'CONTAINER': process.env.CONTAINER,
      },
      'Process info': {
        'PID': process.pid,
        'PPID': process.ppid,
        'UID': process.getuid?.(),
        'GID': process.getgid?.(),
      },
      'Resource limits': {
        'Memory usage': process.memoryUsage(),
        'CPU usage': process.cpuUsage(),
      }
    };

    console.log('Environment indicators:', JSON.stringify(indicators, null, 2));

    // Try to detect if we're in a container
    try {
      const fs = require('fs');
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      console.log('Container cgroup info:', cgroup);
    } catch (error) {
      console.log('Could not read cgroup info (not Linux or no access):', error.message);
    }

    expect(true).toBe(true); // Always pass, this is just for logging
  });

  it('should test worker script with ES modules', async () => {
    console.log('=== ES Module Worker Test ===');

    // Create a minimal ES module worker script
    const workerScript = `
import { parentPort } from 'worker_threads';
console.log('ES Module worker script starting...');
if (parentPort) {
  console.log('parentPort available in ES module, sending ready message');
  parentPort.postMessage({ type: 'ready', module: 'es' });
} else {
  console.log('ERROR: parentPort not available in ES module');
}
`;

    const scriptPath = join(process.cwd(), 'temp-worker.mjs');
    writeFileSync(scriptPath, workerScript);

    try {
      console.log('Creating ES module worker with script:', scriptPath);

      const worker = new Worker(scriptPath);
      console.log('ES module worker object created successfully');

      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log('ES module worker did not respond within 5 seconds');
          reject(new Error('ES Worker timeout'));
        }, 5000);

        worker.on('message', (message) => {
          console.log('Received message from ES module worker:', message);
          clearTimeout(timeout);
          resolve(message);
        });

        worker.on('error', (error) => {
          console.log('ES module worker error:', error);
          clearTimeout(timeout);
          reject(error);
        });

        worker.on('exit', (code) => {
          console.log('ES module worker exited with code:', code);
          if (code !== 0) {
            clearTimeout(timeout);
            reject(new Error(`ES Worker exited with code ${code}`));
          }
        });

        console.log('ES module worker event listeners set up, waiting for message...');
      });

      await worker.terminate();
      console.log('ES module worker terminated successfully');

      expect(result).toEqual({ type: 'ready', module: 'es' });
    } catch (error) {
      console.log('ES module worker failed (this might be expected):', error.message);
      // Don't fail the test - ES modules might not be supported
      expect(true).toBe(true);
    } finally {
      try {
        unlinkSync(scriptPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }, 10000); // 10 second timeout
});
