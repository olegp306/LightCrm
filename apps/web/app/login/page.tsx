import { LogIn } from "lucide-react";
import { headers } from "next/headers";
import { googleLoginConfig, originFromHeaders } from "../../auth/config";
import { allowedLoginEmails } from "../../auth/session";

type LoginPageProps = {
  searchParams?: {
    returnTo?: string;
    error?: string;
    email?: string;
  };
};

function safeReturnTo(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/today";
}

function errorMessage(error: string | undefined, email: string | undefined) {
  if (error === "not-allowed") {
    return `${email ?? "This Google account"} is not allowed to access LightCRM.`;
  }
  if (error === "unverified-email") {
    return "Google did not confirm this email address.";
  }
  if (error === "missing-code") {
    return "Google login was cancelled before LightCRM received access.";
  }
  return null;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const returnTo = safeReturnTo(searchParams?.returnTo);
  const message = errorMessage(searchParams?.error, searchParams?.email);
  const headerStore = headers();
  const config = googleLoginConfig(originFromHeaders(headerStore, "http://localhost:3004"));
  const authHref = `/api/auth/google/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <section className="loginPanel">
      <div className="loginCard">
        <div>
          <p className="loginEyebrow">Private LightCRM</p>
          <h1>Sign in with Google</h1>
          <p>Access is limited to the three approved Gmail accounts.</p>
        </div>
        {message ? <div className="loginError">{message}</div> : null}
        {config.configured ? (
          <a className="loginButton" href={authHref}>
            <LogIn size={18} strokeWidth={2} />
            <span>Continue with Google</span>
          </a>
        ) : (
          <div className="loginConfigWarning">
            <strong>Google login is not configured yet.</strong>
            <span>Missing: {config.missing.join(", ")}</span>
            <code>{config.callbackUrl}</code>
          </div>
        )}
        <ul className="loginAllowedList" aria-label="Allowed Gmail accounts">
          {allowedLoginEmails.map((email) => (
            <li key={email}>{email}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
