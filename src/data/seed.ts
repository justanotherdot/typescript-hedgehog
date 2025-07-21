// Re-export the adaptive implementation as the default
// This provides automatic WASM/BigInt optimization with transparent fallback
export { AdaptiveSeed as Seed } from '../seed/adaptive.js';
