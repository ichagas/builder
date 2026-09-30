import type { ReactNode } from "react";
import { MsalProvider } from "@azure/msal-react";
import type { IPublicClientApplication } from "@azure/msal-browser";
import { msalInstance } from "@/lib/msalInstance";

/**
 * MSAL provider, except in local dev sign-in mode (`msalInstance` is null; see
 * lib/msalInstance.ts) where the tree renders without it. `instance` is
 * injectable for tests.
 */
export function MsalBoundary({
  children,
  instance = msalInstance,
}: {
  children: ReactNode;
  instance?: IPublicClientApplication | null;
}) {
  return instance ? <MsalProvider instance={instance}>{children}</MsalProvider> : <>{children}</>;
}
