'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  associateWebAuthnCredential,
  listWebAuthnCredentials,
  deleteWebAuthnCredential,
} from 'aws-amplify/auth';
import { showToast } from './Toast';

interface PasskeyCredential {
  credentialId: string;
  friendlyCredentialName?: string;
  relyingPartyId?: string;
  createdAt?: Date;
}

interface PasskeyManagerProps {
  className?: string;
}

/**
 * PasskeyManager - Allows users to manage their WebAuthn passkeys
 * 
 * Features:
 * - List all registered passkeys
 * - Register a new passkey (triggers browser prompt)
 * - Delete existing passkeys
 * 
 * Note: User must be authenticated to use these APIs
 */
export function PasskeyManager({ className = '' }: PasskeyManagerProps) {
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if WebAuthn is supported in this browser
  const isWebAuthnSupported = typeof window !== 'undefined' && 
    window.PublicKeyCredential !== undefined;

  const fetchPasskeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[PasskeyManager] Fetching passkeys...');
      const result = await listWebAuthnCredentials();
      console.log('[PasskeyManager] Passkeys fetched:', result);
      const credentials: PasskeyCredential[] = result.credentials
        .filter((cred): cred is typeof cred & { credentialId: string } => 
          typeof cred.credentialId === 'string'
        )
        .map((cred) => ({
          credentialId: cred.credentialId,
          friendlyCredentialName: cred.friendlyCredentialName,
          relyingPartyId: cred.relyingPartyId,
          createdAt: cred.createdAt ? new Date(cred.createdAt) : undefined,
        }));
      setPasskeys(credentials);
    } catch (err) {
      console.error('[PasskeyManager] Error fetching passkeys:', err);
      const message = err instanceof Error ? err.message : 'Failed to load passkeys';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isWebAuthnSupported) {
      fetchPasskeys();
    } else {
      setIsLoading(false);
    }
  }, [fetchPasskeys, isWebAuthnSupported]);

  const handleRegisterPasskey = async () => {
    setIsRegistering(true);
    setError(null);
    
    try {
      console.log('[PasskeyManager] Starting passkey registration...');
      await associateWebAuthnCredential();
      console.log('[PasskeyManager] Passkey registered successfully');
      showToast('Passkey registered successfully!', 'success');
      await fetchPasskeys(); // Refresh the list
    } catch (err: unknown) {
      // Log full error details for debugging
      console.error('[PasskeyManager] Error registering passkey:', err);
      console.error('[PasskeyManager] Error type:', typeof err);
      console.error('[PasskeyManager] Error constructor:', err?.constructor?.name);
      
      // Extract error details - Cognito errors have specific structure
      let message = 'Failed to register passkey';
      let errorName = '';
      
      if (err instanceof Error) {
        message = err.message;
        errorName = err.name;
        console.error('[PasskeyManager] Error name:', err.name);
        console.error('[PasskeyManager] Error message:', err.message);
        console.error('[PasskeyManager] Error stack:', err.stack);
        
        // Check for nested cause
        if ('cause' in err && err.cause) {
          console.error('[PasskeyManager] Error cause:', err.cause);
        }
      }
      
      // Try to extract Cognito-specific error info
      if (err && typeof err === 'object') {
        const cognitoErr = err as Record<string, unknown>;
        if (cognitoErr.code) console.error('[PasskeyManager] Cognito error code:', cognitoErr.code);
        if (cognitoErr.$metadata) console.error('[PasskeyManager] AWS metadata:', cognitoErr.$metadata);
        if (cognitoErr.underlyingError) console.error('[PasskeyManager] Underlying error:', cognitoErr.underlyingError);
      }
      
      // Handle specific error cases
      if (message.includes('NotAllowedError') || message.includes('cancelled') || errorName === 'NotAllowedError') {
        showToast('Passkey registration was cancelled', 'error');
        setError('Passkey registration was cancelled by user or browser');
      } else if (message.includes('NotSupportedError') || errorName === 'NotSupportedError') {
        showToast('Your device does not support passkeys', 'error');
        setError('Your device or browser does not support passkeys');
      } else if (message.includes('SecurityError') || errorName === 'SecurityError') {
        showToast('Security error - passkeys require HTTPS', 'error');
        setError('Passkeys require a secure context (HTTPS). localhost should work, but check browser settings.');
      } else if (message.includes('WebAuthnNotEnabled') || message.includes('not enabled')) {
        showToast('WebAuthn is not enabled for this user pool', 'error');
        setError('WebAuthn passkeys are not enabled. The Cognito user pool may need to be updated.');
      } else if (message.includes('InvalidParameterException')) {
        showToast('Invalid configuration for passkeys', 'error');
        setError('WebAuthn configuration error. Check the relyingPartyId setting.');
      } else {
        showToast(`Passkey error: ${message}`, 'error');
        setError(`${errorName ? errorName + ': ' : ''}${message}`);
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeletePasskey = async (credentialId: string) => {
    setDeletingId(credentialId);
    setError(null);
    
    try {
      console.log('[PasskeyManager] Deleting passkey:', credentialId);
      await deleteWebAuthnCredential({ credentialId });
      console.log('[PasskeyManager] Passkey deleted successfully');
      showToast('Passkey removed', 'success');
      setPasskeys((prev) => prev.filter((p) => p.credentialId !== credentialId));
    } catch (err) {
      console.error('[PasskeyManager] Error deleting passkey:', err);
      const message = err instanceof Error ? err.message : 'Failed to delete passkey';
      showToast(message, 'error');
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  // Format date for display
  const formatDate = (date?: Date): string => {
    if (!date) return 'Unknown';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Generate a friendly name for the passkey
  const getPasskeyDisplayName = (passkey: PasskeyCredential, index: number): string => {
    if (passkey.friendlyCredentialName) {
      return passkey.friendlyCredentialName;
    }
    return `Passkey ${index + 1}`;
  };

  // If WebAuthn is not supported
  if (!isWebAuthnSupported) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-3 p-4 bg-bg-elevated rounded-xl">
          <div className="text-2xl">🔐</div>
          <div>
            <p className="text-body text-text-primary">Passkeys Not Supported</p>
            <p className="text-caption text-text-muted">
              Your browser does not support passkeys. Try using Chrome, Safari, or Edge.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Header with Add Button */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-body text-text-primary font-medium">Passkeys</h3>
          <p className="text-caption text-text-muted">
            Sign in faster with Face ID, Touch ID, or security keys
          </p>
        </div>
        <button
          onClick={handleRegisterPasskey}
          disabled={isRegistering}
          className="px-4 py-2 rounded-xl bg-macro-protein text-white text-sm font-medium
                     hover:bg-macro-protein/90 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all flex items-center gap-2"
        >
          {isRegistering ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Adding...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Passkey</span>
            </>
          )}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="p-4 bg-bg-elevated rounded-xl animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-bg-surface rounded-full" />
                <div className="flex-1">
                  <div className="h-4 w-24 bg-bg-surface rounded mb-2" />
                  <div className="h-3 w-32 bg-bg-surface rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : passkeys.length === 0 ? (
        /* Empty State */
        <div className="p-6 bg-bg-elevated rounded-xl text-center">
          <div className="text-4xl mb-3">🔑</div>
          <p className="text-body text-text-primary mb-1">No passkeys registered</p>
          <p className="text-caption text-text-muted">
            Add a passkey to sign in quickly and securely without a password
          </p>
        </div>
      ) : (
        /* Passkey List */
        <div className="space-y-3">
          {passkeys.map((passkey, index) => (
            <div
              key={passkey.credentialId}
              className="p-4 bg-bg-elevated rounded-xl flex items-center gap-3"
            >
              {/* Icon */}
              <div className="w-10 h-10 bg-macro-protein/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-macro-protein" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-body text-text-primary truncate">
                  {getPasskeyDisplayName(passkey, index)}
                </p>
                <p className="text-caption text-text-muted">
                  Added {formatDate(passkey.createdAt)}
                </p>
              </div>

              {/* Delete Button */}
              <button
                onClick={() => handleDeletePasskey(passkey.credentialId)}
                disabled={deletingId === passkey.credentialId}
                className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Remove passkey"
              >
                {deletingId === passkey.credentialId ? (
                  <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-4 p-3 bg-bg-surface rounded-xl">
        <p className="text-caption text-text-muted">
          💡 Passkeys use your device&apos;s biometrics (Face ID, fingerprint) or security keys 
          for fast, phishing-resistant sign-in.
        </p>
      </div>
    </div>
  );
}
