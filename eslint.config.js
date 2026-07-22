// Root re-export so ESLint's flat-config auto-discovery (and IDE integrations) find
// the config without an explicit --config flag. The actual config lives in config/.
export { default } from './config/eslint.config.js';
