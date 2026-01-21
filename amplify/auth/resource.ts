import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 *
 * WebAuthn passkey configuration:
 * - relyingPartyId MUST match your production domain for passkeys to work
 * - userVerification: 'preferred' allows biometric or PIN
 * 
 * NOTE: This config works for production (macroai.rickrothbart.com).
 * For sandbox testing on localhost, passkeys will only work if you temporarily
 * change relyingPartyId to 'localhost' or use webAuthn: true instead.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    // Enable WebAuthn passkey authentication
    // relyingPartyId must match your custom domain for production
    webAuthn: {
      relyingPartyId: 'macroai.rickrothbart.com',
      userVerification: 'preferred',
    },
  },
  userAttributes: {
    email: {
      required: true,
      mutable: true,
    },
  },
});
