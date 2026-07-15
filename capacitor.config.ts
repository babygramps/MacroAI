import type { CapacitorConfig } from '@capacitor/cli';

// Android shell for the deployed MacroAI web app. The app relies on Next.js
// server actions (Gemini, USDA, server-side auth), so the WebView loads the
// production deployment rather than a static bundle.
const PRODUCTION_URL = 'https://macroai-gold.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.orbitalindustries.macroai',
  appName: 'MacroAI',
  webDir: 'capacitor-web',
  backgroundColor: '#0A0A0F',
  server: {
    url: PRODUCTION_URL,
    errorPath: 'error.html',
  },
  plugins: {
    // Light status/gesture-bar icons over the dark app background.
    SystemBars: {
      style: 'DARK',
    },
  },
};

export default config;
