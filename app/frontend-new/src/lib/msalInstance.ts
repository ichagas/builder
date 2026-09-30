/**
 * MSAL Instance
 * 
 * Singleton instance of PublicClientApplication for MSAL authentication.
 * This should be created once and used throughout the application.
 */
import { PublicClientApplication, EventType, EventMessage, AuthenticationResult } from "@azure/msal-browser";
import { msalConfig } from "./msalConfig";
import { isLocalAuth } from "./authMode";

function createMsalInstance(): PublicClientApplication {
  // Create the MSAL instance
  const instance = new PublicClientApplication(msalConfig);

  // Register event callbacks
  instance.addEventCallback((event: EventMessage) => {
    if (event.eventType === EventType.LOGIN_SUCCESS) {
      console.log("[MSAL] Login successful");
      const result = event.payload as AuthenticationResult;
      if (result?.account) {
        // Set the active account
        instance.setActiveAccount(result.account);
      }
    }

    if (event.eventType === EventType.LOGOUT_SUCCESS) {
      console.log("[MSAL] Logout successful");
    }

    if (event.eventType === EventType.LOGIN_FAILURE) {
      console.error("[MSAL] Login failed:", event.error);
    }
  });

  // Handle redirect promise on page load
  instance.initialize().then(() => {
    // Handle redirect response if coming back from login
    instance.handleRedirectPromise()
      .then((response) => {
        if (response) {
          console.log("[MSAL] Redirect login completed");
          instance.setActiveAccount(response.account);
        } else {
          // Check if there's an active account
          const accounts = instance.getAllAccounts();
          if (accounts.length > 0) {
            instance.setActiveAccount(accounts[0]);
            console.log("[MSAL] Active account restored:", accounts[0].username);
          }
        }
      })
      .catch((error) => {
        console.error("[MSAL] Error handling redirect:", error);
      });
  }).catch((error) => {
    console.error("[MSAL] Initialization error:", error);
  });

  return instance;
}

/**
 * The MSAL singleton, or null when local dev sign-in is active
 * (VITE_AUTH_MODE=local in the Vite dev server, see authMode.ts): MSAL is then
 * never constructed or initialised. In every other mode it is created and
 * initialised at module load exactly as before.
 */
export const msalInstance: PublicClientApplication | null = isLocalAuth() ? null : createMsalInstance();

export default msalInstance;
