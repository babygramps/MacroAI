'use client';

import { useEffect, useState, useCallback, ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import { getCurrentUser } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { ToastContainer } from './ui/Toast';
import { UnitProvider } from '@/lib/UnitContext';
import { SignIn } from './auth/SignIn';

interface AmplifyProviderProps {
  children: ReactNode;
}

/**
 * AmplifyProvider with custom SignIn supporting passkeys
 * 
 * Features:
 * - Custom SignIn component with "Sign in with passkey" button
 * - Listens to auth Hub events for sign-out
 * - Preserves MacroAI branding
 */
export function AmplifyProvider({ children }: AmplifyProviderProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [configError, setConfigError] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Check current auth state
  const checkAuthState = useCallback(async () => {
    try {
      await getCurrentUser();
      console.log('[AmplifyProvider] User is authenticated');
      setIsAuthenticated(true);
    } catch {
      console.log('[AmplifyProvider] User is not authenticated');
      setIsAuthenticated(false);
    }
  }, []);

  // Configure Amplify on mount
  useEffect(() => {
    async function configure() {
      try {
        const outputs = await import('@/amplify_outputs.json');
        Amplify.configure(outputs.default, { ssr: true });
        setIsConfigured(true);
        await checkAuthState();
      } catch {
        // amplify_outputs.json doesn't exist yet
        setConfigError(true);
        console.warn(
          'Amplify outputs not found. Run `npx ampx sandbox` to generate them.'
        );
      }
    }
    configure();
  }, [checkAuthState]);

  // Listen to auth events
  useEffect(() => {
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      console.log('[AmplifyProvider] Auth event:', payload.event);
      
      switch (payload.event) {
        case 'signedIn':
          setIsAuthenticated(true);
          break;
        case 'signedOut':
          setIsAuthenticated(false);
          break;
        case 'tokenRefresh_failure':
          console.warn('[AmplifyProvider] Token refresh failed, signing out');
          setIsAuthenticated(false);
          break;
      }
    });

    return () => unsubscribe();
  }, []);

  // Handle successful authentication from SignIn component
  const handleAuthenticated = useCallback(() => {
    console.log('[AmplifyProvider] User authenticated via SignIn');
    setIsAuthenticated(true);
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

  // Show loading while configuring or checking auth
  if (!isConfigured || isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-macro-calories border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show SignIn if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <SignIn onAuthenticated={handleAuthenticated} />
        <ToastContainer />
      </>
    );
  }

  // User is authenticated - show app
  return (
    <>
      <UnitProvider>
        {children}
      </UnitProvider>
      <ToastContainer />
    </>
  );
}
