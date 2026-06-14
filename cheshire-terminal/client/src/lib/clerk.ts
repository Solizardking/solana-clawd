const clerkPublishableKey = (
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
  ""
);
const accountPortalUrl = (
  import.meta.env.VITE_CLERK_ACCOUNT_PORTAL_URL?.trim() ||
  import.meta.env.NEXT_PUBLIC_CLERK_ACCOUNT_PORTAL_URL?.trim() ||
  import.meta.env.CLERK_ACCOUNT_PORTAL_URL?.trim() ||
  "https://accounts.cheshireterminal.ai"
).replace(/\/$/, "");

export function getClerkPublishableKey() {
  return clerkPublishableKey;
}

export function hasClerk() {
  return clerkPublishableKey.length > 0;
}

export function getClerkSignInUrl() {
  return (
    import.meta.env.VITE_CLERK_SIGN_IN_URL?.trim() ||
    import.meta.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL?.trim() ||
    `${accountPortalUrl}/sign-in`
  );
}

export function getClerkSignUpUrl() {
  return (
    import.meta.env.VITE_CLERK_SIGN_UP_URL?.trim() ||
    import.meta.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL?.trim() ||
    `${accountPortalUrl}/sign-up`
  );
}

export function getClerkUserProfileUrl() {
  return (
    import.meta.env.VITE_CLERK_USER_PROFILE_URL?.trim() ||
    import.meta.env.NEXT_PUBLIC_CLERK_USER_PROFILE_URL?.trim() ||
    `${accountPortalUrl}/user`
  );
}

export const clerkAppearance = {
  variables: {
    colorPrimary: "#22d3ee",
    colorBackground: "#050816",
    colorInputBackground: "#0f172a",
    colorInputText: "#e2e8f0",
    colorText: "#e2e8f0",
    colorTextSecondary: "#94a3b8",
    borderRadius: "0.75rem",
  },
};
