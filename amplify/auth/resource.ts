import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 *
 * WebAuthn passkey configuration:
 * - For sandbox: relyingPartyId defaults to 'localhost'
 * - For production: explicitly set to your custom domain
 * - userVerification: 'preferred' allows biometric or PIN
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    // Enable WebAuthn passkey authentication
    // In sandbox, Amplify auto-detects localhost as relyingPartyId
    // For production, uncomment and set your domain:
    // webAuthn: {
    //   relyingPartyId: 'macroai.rickrothbart.com',
    //   userVerification: 'preferred',
    // },
    webAuthn: true,
  },
  userAttributes: {
    email: {
      required: true,
      mutable: true,
    },
  },
});
