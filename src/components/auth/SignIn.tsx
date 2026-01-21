'use client';

import { useState, useCallback } from 'react';
import {
  signIn,
  signUp,
  confirmSignUp,
  confirmSignIn,
  resetPassword,
  confirmResetPassword,
  autoSignIn,
  type SignInOutput,
} from 'aws-amplify/auth';
import { showToast } from '@/components/ui/Toast';

type AuthView = 
  | 'signIn' 
  | 'signUp' 
  | 'confirmSignUp' 
  | 'forgotPassword' 
  | 'confirmResetPassword'
  | 'selectChallenge';

interface SignInProps {
  onAuthenticated: () => void;
}

/**
 * Custom SignIn component with passkey support
 * 
 * Features:
 * - "Sign in with passkey" button (WebAuthn)
 * - Email/password sign-in fallback
 * - Sign up flow
 * - Forgot password flow
 * - MacroAI branding
 */
export function SignIn({ onAuthenticated }: SignInProps) {
  const [view, setView] = useState<AuthView>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableChallenges, setAvailableChallenges] = useState<string[]>([]);

  // Check if WebAuthn is supported
  const isWebAuthnSupported = typeof window !== 'undefined' && 
    window.PublicKeyCredential !== undefined;

  const clearError = useCallback(() => setError(null), []);

  // Handle passkey sign-in
  const handlePasskeySignIn = async () => {
    if (!email.trim()) {
      setError('Please enter your email first');
      return;
    }

    setIsLoading(true);
    clearError();

    try {
      console.log('[SignIn] Attempting passkey sign-in for:', email);
      
      const result: SignInOutput = await signIn({
        username: email.trim(),
        options: {
          authFlowType: 'USER_AUTH',
          preferredChallenge: 'WEB_AUTHN',
        },
      });

      console.log('[SignIn] Passkey sign-in result:', result.nextStep.signInStep);
      await handleSignInResult(result);
    } catch (err) {
      console.error('[SignIn] Passkey sign-in error:', err);
      handleAuthError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle email/password sign-in
  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password) {
      setError('Please enter email and password');
      return;
    }

    setIsLoading(true);
    clearError();

    try {
      console.log('[SignIn] Attempting password sign-in for:', email);
      
      const result: SignInOutput = await signIn({
        username: email.trim(),
        password,
      });

      console.log('[SignIn] Password sign-in result:', result.nextStep.signInStep);
      await handleSignInResult(result);
    } catch (err) {
      console.error('[SignIn] Password sign-in error:', err);
      handleAuthError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle sign-in result and navigate to next step
  const handleSignInResult = async (result: SignInOutput) => {
    const { signInStep } = result.nextStep;

    switch (signInStep) {
      case 'DONE':
        console.log('[SignIn] Authentication successful');
        showToast('Welcome back!', 'success');
        onAuthenticated();
        break;

      case 'CONFIRM_SIGN_UP':
        console.log('[SignIn] User needs to confirm sign-up');
        setView('confirmSignUp');
        break;

      case 'CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION':
        console.log('[SignIn] Multiple auth options available:', result.nextStep.availableChallenges);
        setAvailableChallenges(result.nextStep.availableChallenges || []);
        setView('selectChallenge');
        break;

      case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
        setError('You need to set a new password. Please use the forgot password flow.');
        break;

      default:
        console.log('[SignIn] Unhandled sign-in step:', signInStep);
        setError(`Unexpected authentication step: ${signInStep}`);
    }
  };

  // Handle challenge selection
  const handleSelectChallenge = async (challenge: string) => {
    setIsLoading(true);
    clearError();

    try {
      console.log('[SignIn] Confirming with challenge:', challenge);
      
      const result = await confirmSignIn({
        challengeResponse: challenge,
      });

      console.log('[SignIn] Challenge result:', result.nextStep.signInStep);
      await handleSignInResult(result);
    } catch (err) {
      console.error('[SignIn] Challenge error:', err);
      handleAuthError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle sign-up
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password) {
      setError('Please enter email and password');
      return;
    }

    setIsLoading(true);
    clearError();

    try {
      console.log('[SignIn] Signing up:', email);
      
      const result = await signUp({
        username: email.trim(),
        password,
        options: {
          userAttributes: {
            email: email.trim(),
          },
          autoSignIn: true,
        },
      });

      console.log('[SignIn] Sign-up result:', result.nextStep.signUpStep);

      if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        setView('confirmSignUp');
        showToast('Check your email for a verification code', 'success');
      } else if (result.nextStep.signUpStep === 'DONE') {
        // Auto sign-in
        await handleAutoSignIn();
      }
    } catch (err) {
      console.error('[SignIn] Sign-up error:', err);
      handleAuthError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle confirm sign-up
  const handleConfirmSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!confirmCode.trim()) {
      setError('Please enter the verification code');
      return;
    }

    setIsLoading(true);
    clearError();

    try {
      console.log('[SignIn] Confirming sign-up for:', email);
      
      await confirmSignUp({
        username: email.trim(),
        confirmationCode: confirmCode.trim(),
      });

      showToast('Email verified! Signing you in...', 'success');
      await handleAutoSignIn();
    } catch (err) {
      console.error('[SignIn] Confirm sign-up error:', err);
      handleAuthError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle auto sign-in after sign-up
  const handleAutoSignIn = async () => {
    try {
      const result = await autoSignIn();
      console.log('[SignIn] Auto sign-in result:', result.nextStep.signInStep);
      await handleSignInResult(result);
    } catch (err) {
      console.error('[SignIn] Auto sign-in failed, redirecting to sign-in:', err);
      setView('signIn');
      showToast('Please sign in with your new account', 'success');
    }
  };

  // Handle forgot password
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    setIsLoading(true);
    clearError();

    try {
      console.log('[SignIn] Requesting password reset for:', email);
      
      await resetPassword({ username: email.trim() });
      setView('confirmResetPassword');
      showToast('Check your email for a reset code', 'success');
    } catch (err) {
      console.error('[SignIn] Forgot password error:', err);
      handleAuthError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle confirm reset password
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!confirmCode.trim() || !newPassword) {
      setError('Please enter the code and new password');
      return;
    }

    setIsLoading(true);
    clearError();

    try {
      console.log('[SignIn] Confirming password reset for:', email);
      
      await confirmResetPassword({
        username: email.trim(),
        confirmationCode: confirmCode.trim(),
        newPassword,
      });

      showToast('Password reset! Please sign in', 'success');
      setPassword('');
      setConfirmCode('');
      setNewPassword('');
      setView('signIn');
    } catch (err) {
      console.error('[SignIn] Confirm reset password error:', err);
      handleAuthError(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle auth errors
  const handleAuthError = (err: unknown) => {
    const message = err instanceof Error ? err.message : 'An error occurred';
    
    // Map common Cognito errors to user-friendly messages
    if (message.includes('UserNotFoundException') || message.includes('User does not exist')) {
      setError('No account found with this email');
    } else if (message.includes('NotAuthorizedException') || message.includes('Incorrect username or password')) {
      setError('Incorrect email or password');
    } else if (message.includes('UsernameExistsException')) {
      setError('An account with this email already exists');
    } else if (message.includes('InvalidPasswordException')) {
      setError('Password must be at least 8 characters with uppercase, lowercase, and numbers');
    } else if (message.includes('CodeMismatchException')) {
      setError('Invalid verification code');
    } else if (message.includes('ExpiredCodeException')) {
      setError('Verification code has expired. Please request a new one');
    } else if (message.includes('LimitExceededException')) {
      setError('Too many attempts. Please try again later');
    } else if (message.includes('NotAllowedError') || message.includes('cancelled')) {
      setError('Passkey authentication was cancelled');
    } else {
      setError(message);
    }
  };

  // Get friendly name for challenge type
  const getChallengeLabel = (challenge: string): { label: string; icon: string } => {
    switch (challenge) {
      case 'WEB_AUTHN':
        return { label: 'Passkey', icon: '🔐' };
      case 'PASSWORD':
      case 'PASSWORD_SRP':
        return { label: 'Password', icon: '🔑' };
      case 'EMAIL_OTP':
        return { label: 'Email Code', icon: '📧' };
      case 'SMS_OTP':
        return { label: 'SMS Code', icon: '📱' };
      default:
        return { label: challenge, icon: '🔒' };
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-page-title text-macro-calories">MacroAI</h1>
          <p className="text-body text-text-secondary mt-2">
            Smart Calorie & Macro Tracker
          </p>
        </div>

        {/* Auth Card */}
        <div className="card p-6">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Sign In View */}
          {view === 'signIn' && (
            <>
              <h2 className="text-card-title text-text-primary mb-6">Sign In</h2>
              
              {/* Passkey Button */}
              {isWebAuthnSupported && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm text-text-secondary mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="input-field w-full"
                      autoComplete="email webauthn"
                    />
                  </div>
                  
                  <button
                    onClick={handlePasskeySignIn}
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-xl bg-macro-protein text-white font-medium
                               hover:bg-macro-protein/90 disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all flex items-center justify-center gap-2 mb-4"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span className="text-xl">🔐</span>
                        <span>Sign in with Passkey</span>
                      </>
                    )}
                  </button>

                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border-subtle" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-bg-surface text-text-muted">or use password</span>
                    </div>
                  </div>
                </>
              )}

              {/* Email/Password Form */}
              <form onSubmit={handlePasswordSignIn}>
                {!isWebAuthnSupported && (
                  <div className="mb-4">
                    <label className="block text-sm text-text-secondary mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="input-field w-full"
                      autoComplete="email"
                    />
                  </div>
                )}
                
                <div className="mb-4">
                  <label className="block text-sm text-text-secondary mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field w-full"
                    autoComplete="current-password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-macro-calories text-white font-medium
                             hover:bg-macro-calories/90 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              {/* Links */}
              <div className="mt-6 space-y-3 text-center">
                <button
                  onClick={() => { clearError(); setView('forgotPassword'); }}
                  className="text-sm text-text-muted hover:text-text-secondary transition-colors"
                >
                  Forgot password?
                </button>
                <p className="text-sm text-text-muted">
                  Don&apos;t have an account?{' '}
                  <button
                    onClick={() => { clearError(); setView('signUp'); }}
                    className="text-macro-calories hover:underline"
                  >
                    Sign up
                  </button>
                </p>
              </div>
            </>
          )}

          {/* Sign Up View */}
          {view === 'signUp' && (
            <>
              <h2 className="text-card-title text-text-primary mb-6">Create Account</h2>
              
              <form onSubmit={handleSignUp}>
                <div className="mb-4">
                  <label className="block text-sm text-text-secondary mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input-field w-full"
                    autoComplete="email"
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm text-text-secondary mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field w-full"
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-text-muted mt-1">
                    At least 8 characters with uppercase, lowercase, and numbers
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-macro-calories text-white font-medium
                             hover:bg-macro-calories/90 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Create Account'
                  )}
                </button>
              </form>

              <p className="mt-6 text-sm text-text-muted text-center">
                Already have an account?{' '}
                <button
                  onClick={() => { clearError(); setView('signIn'); }}
                  className="text-macro-calories hover:underline"
                >
                  Sign in
                </button>
              </p>
            </>
          )}

          {/* Confirm Sign Up View */}
          {view === 'confirmSignUp' && (
            <>
              <h2 className="text-card-title text-text-primary mb-2">Verify Email</h2>
              <p className="text-body text-text-secondary mb-6">
                We sent a code to {email}
              </p>
              
              <form onSubmit={handleConfirmSignUp}>
                <div className="mb-4">
                  <label className="block text-sm text-text-secondary mb-2">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    placeholder="123456"
                    className="input-field w-full text-center text-2xl tracking-widest"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-macro-calories text-white font-medium
                             hover:bg-macro-calories/90 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Verify'
                  )}
                </button>
              </form>

              <button
                onClick={() => { clearError(); setView('signIn'); }}
                className="w-full mt-4 text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                Back to sign in
              </button>
            </>
          )}

          {/* Forgot Password View */}
          {view === 'forgotPassword' && (
            <>
              <h2 className="text-card-title text-text-primary mb-2">Reset Password</h2>
              <p className="text-body text-text-secondary mb-6">
                Enter your email to receive a reset code
              </p>
              
              <form onSubmit={handleForgotPassword}>
                <div className="mb-4">
                  <label className="block text-sm text-text-secondary mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input-field w-full"
                    autoComplete="email"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-macro-calories text-white font-medium
                             hover:bg-macro-calories/90 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Send Reset Code'
                  )}
                </button>
              </form>

              <button
                onClick={() => { clearError(); setView('signIn'); }}
                className="w-full mt-4 text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                Back to sign in
              </button>
            </>
          )}

          {/* Confirm Reset Password View */}
          {view === 'confirmResetPassword' && (
            <>
              <h2 className="text-card-title text-text-primary mb-2">Set New Password</h2>
              <p className="text-body text-text-secondary mb-6">
                Enter the code sent to {email}
              </p>
              
              <form onSubmit={handleConfirmResetPassword}>
                <div className="mb-4">
                  <label className="block text-sm text-text-secondary mb-2">
                    Reset Code
                  </label>
                  <input
                    type="text"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    placeholder="123456"
                    className="input-field w-full text-center text-2xl tracking-widest"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm text-text-secondary mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field w-full"
                    autoComplete="new-password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-macro-calories text-white font-medium
                             hover:bg-macro-calories/90 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>

              <button
                onClick={() => { clearError(); setView('signIn'); }}
                className="w-full mt-4 text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                Back to sign in
              </button>
            </>
          )}

          {/* Select Challenge View */}
          {view === 'selectChallenge' && (
            <>
              <h2 className="text-card-title text-text-primary mb-2">Choose Sign-In Method</h2>
              <p className="text-body text-text-secondary mb-6">
                Select how you want to verify your identity
              </p>
              
              <div className="space-y-3">
                {availableChallenges.map((challenge) => {
                  const { label, icon } = getChallengeLabel(challenge);
                  return (
                    <button
                      key={challenge}
                      onClick={() => handleSelectChallenge(challenge)}
                      disabled={isLoading}
                      className="w-full py-4 px-4 rounded-xl bg-bg-elevated text-text-primary
                                 hover:bg-bg-surface disabled:opacity-50 disabled:cursor-not-allowed
                                 transition-all flex items-center gap-3"
                    >
                      <span className="text-2xl">{icon}</span>
                      <span className="font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => { clearError(); setView('signIn'); }}
                className="w-full mt-4 text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
