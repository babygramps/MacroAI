'use client';

import { useEffect, useState, ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { ToastContainer } from './ui/Toast';
import { UnitProvider } from '@/lib/UnitContext';

interface AmplifyProviderProps {
  children: ReactNode;
}

export function AmplifyProvider({ children }: AmplifyProviderProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [configError, setConfigError] = useState(false);

  useEffect(() => {
    async function configure() {
      try {
        const outputs = await import('@/amplify_outputs.json');
        Amplify.configure(outputs.default, { ssr: true });
        setIsConfigured(true);
      } catch {
        // amplify_outputs.json doesn't exist yet
        setConfigError(true);
        console.warn(
          'Amplify outputs not found. Run `npx ampx sandbox` to generate them.'
        );
      }
    }
    configure();
  }, []);

  // Show setup instructions if Amplify is not configured
  if (configError) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
        <div className="card max-w-md text-center">
          <h1 className="text-page-title mb-4">Setup Required</h1>
          <p className="text-body text-text-secondary mb-6">
            Amplify backend is not configured yet. Please run the sandbox to
            generate the configuration.
          </p>
          <div className="bg-bg-elevated rounded-xl p-4 text-left font-mono text-sm text-text-secondary">
            <p className="text-macro-calories">$ npx ampx sandbox</p>
          </div>
          <p className="text-caption mt-4">
            Then set your API secrets:
          </p>
          <div className="bg-bg-elevated rounded-xl p-4 text-left font-mono text-xs text-text-secondary mt-2 space-y-1">
            <p>$ npx ampx sandbox secret set USDA_API_KEY</p>
            <p>$ npx ampx sandbox secret set API_NINJAS_API_KEY</p>
            <p>$ npx ampx sandbox secret set GEMINI_API_KEY</p>
          </div>
        </div>
      </div>
    );
  }

  // Show loading while configuring
  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-macro-calories border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Authenticator
        components={{
          Header() {
            return (
              <div className="text-center py-8">
                <h1 className="text-page-title text-macro-calories">MacroAI</h1>
                <p className="text-body text-text-secondary mt-2">
                  Smart Calorie & Macro Tracker
                </p>
              </div>
            );
          },
        }}
      >
        <UnitProvider>
          {children}
        </UnitProvider>
      </Authenticator>
      <ToastContainer />
    </>
  );
}
