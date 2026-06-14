/**
 * This file provides a polyfill for the Node.js Buffer class when running in the browser.
 * This helps with compatibility issues when using libraries that depend on Buffer.
 */

import { Buffer } from 'buffer';

// Define global for browser environment
if (typeof window !== 'undefined') {
  // Make Buffer available globally
  (window as any).Buffer = Buffer;
  
  // Define global as window for libraries that expect it
  (window as any).global = window;
  
  // Define process for libraries that expect it
  if (!(window as any).process) {
    (window as any).process = { env: {} };
  }
}

export default Buffer;