"use server";

import { createHash, randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  dashboardForRole,
  getActiveMembership,
  getVerifiedUser,
  type AccountRole,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const SIGNUP_INVITE_COOKIE = "ravoge_signup_invite";
const SIGNUP_OWNER_TOKEN_COOKIE = "ravoge_signup_owner_token";
// Removed from the active flow, but cleared for accounts started before the
// durable Owner-intent migration.
const SIGNUP_ORGANIZATION_COOKIE = "ravoge_signup_organization";

export type ActionState = {
  invitationRole?: AccountRole;
  invitationUrl?: string;
  message?: string;
  recipientEmail?: string;
  status: "idle" | "error" | "success";
};

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function validatePassword(password: string) {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

async function getRequestOrigin() {
  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host");
  const host = forwardedHost ?? headerStore.get("host") ?? "ravoge.com";
  const isRavogeDeployPreview =
    /^[a-z0-9-]+--ravoge\.netlify\.app$/i.test(host);
  const allowed =
    host === "ravoge.com" ||
    host === "www.ravoge.com" ||
    host === "ravoge.netlify.app" ||
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    isRavogeDeployPreview;

  if (!allowed) return "https://ravoge.com";
  const protocol = host.startsWith("localhost:") || host.startsWith("127.0.0.1:")
    ? "http"
    : "https";
  return `${protocol}://${host}`;
}

async function setSignupCookie(name: string, value: string) {
  const cookieStore = await cookies();
  cookieStore.set(name, value, {
    httpOnly: true,
    maxAge: 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

async function clearSignupCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(SIGNUP_INVITE_COOKIE);
  cookieStore.delete(SIGNUP_OWNER_TOKEN_COOKIE);
  cookieStore.delete(SIGNUP_ORGANIZATION_COOKIE);
}

export async function completeSignupProvisioning(tokens: {
  invitationToken?: string;
  ownerSignupToken?: string;
} = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const existingMembership = await getActiveMembership(data.user.id);
  if (existingMembership) {
    await clearSignupCookies();
    return existingMembership.role;
  }

  const cookieStore = await cookies();
  const invitationToken = tokens.invitationToken
    ?? cookieStore.get(SIGNUP_INVITE_COOKIE)?.value;
  const ownerSignupToken = tokens.ownerSignupToken
    ?? cookieStore.get(SIGNUP_OWNER_TOKEN_COOKIE)?.value;

  if (invitationToken) {
    const { error: invitationError } = await supabase.rpc(
      "accept_organization_invitation",
      { invitation_token: invitationToken },
    );
    if (invitationError) return null;
  } else {
    const { error: ownerProvisioningError } = await supabase.rpc(
      "complete_owner_signup",
      { confirmed_gym_name: null, signup_token: ownerSignupToken || null },
    );
    if (ownerProvisioningError) return null;
  }

  const membership = await getActiveMembership(data.user.id);
  if (!membership) return null;
  await clearSignupCookies();
  return membership.role;
}

export async function loginAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = asString(formData.get("email")).toLowerCase();
  const password = asString(formData.get("password"));
  const invitationToken = asString(formData.get("invitationToken"));
  if (!email || !password) {
    return { message: "Enter your email and password.", status: "error" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return { message: "Email or password was not accepted.", status: "error" };
  }

  let membership = await getActiveMembership(data.user.id);
  if (!membership && invitationToken) {
    if (invitationToken.length < 32) {
      await supabase.auth.signOut();
      return { message: "That invitation is invalid or expired.", status: "error" };
    }
    const { error: invitationError } = await supabase.rpc(
      "accept_organization_invitation",
      { invitation_token: invitationToken },
    );
    if (invitationError) {
      await supabase.auth.signOut();
      return { message: "That invitation is invalid or expired.", status: "error" };
    }
    membership = await getActiveMembership(data.user.id);
  }
  if (!membership && !invitationToken) {
    const cookieStore = await cookies();
    const ownerSignupToken = cookieStore.get(SIGNUP_OWNER_TOKEN_COOKIE)?.value;
    if (ownerSignupToken) {
      const { error: ownerProvisioningError } = await supabase.rpc(
        "complete_owner_signup",
        { confirmed_gym_name: null, signup_token: ownerSignupToken },
      );
      if (!ownerProvisioningError) {
        membership = await getActiveMembership(data.user.id);
        if (membership) await clearSignupCookies();
      }
    }

    if (!membership) {
      const { data: canRecover } = await supabase.rpc(
        "has_pending_owner_signup",
      );
      if (canRecover) redirect("/signup/owner/recover");
    }
  }
  if (!membership) {
    await supabase.auth.signOut();
    return {
      message: "Your account is not linked to an active Ravoge gym.",
      status: "error",
    };
  }

  redirect(dashboardForRole(membership.role));
}

export async function signupAction(
  role: AccountRole,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const fullName = asString(formData.get("fullName"));
  const email = asString(formData.get("email")).toLowerCase();
  const password = asString(formData.get("password"));
  const confirmPassword = asString(formData.get("confirmPassword"));
  const organizationName = asString(formData.get("organizationName"));
  const invitationToken = asString(formData.get("invitationToken"));
  const hasInvitation = invitationToken.length > 0;

  if (fullName.length < 2 || fullName.length > 120) {
    return { message: "Enter your full name.", status: "error" };
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { message: "Enter a valid email address.", status: "error" };
  }
  if (!validatePassword(password)) {
    return {
      message: "Use at least 8 characters with a letter and a number.",
      status: "error",
    };
  }
  if (password !== confirmPassword) {
    return { message: "Passwords do not match.", status: "error" };
  }
  if (role === "owner" && !hasInvitation && organizationName.length < 2) {
    return { message: "Enter your gym name.", status: "error" };
  }
  if ((role !== "owner" || hasInvitation) && invitationToken.length < 32) {
    return {
      message: "A valid Ravoge invitation code is required.",
      status: "error",
    };
  }

  const supabase = await createClient();
  let ownerSignupToken = "";
  await clearSignupCookies();
  if (hasInvitation) {
    await setSignupCookie(SIGNUP_INVITE_COOKIE, invitationToken);
  } else if (role === "owner") {
    ownerSignupToken = randomBytes(32).toString("base64url");
    const { error: ownerIntentError } = await supabase.rpc(
      "begin_owner_signup",
      {
        gym_name: organizationName,
        owner_email: email,
        signup_token: ownerSignupToken,
      },
    );
    if (ownerIntentError) {
      return {
        message: "Owner signup could not be prepared. Sign in if this email already has an account.",
        status: "error",
      };
    }
    await setSignupCookie(SIGNUP_OWNER_TOKEN_COOKIE, ownerSignupToken);
  }

  const origin = await getRequestOrigin();
  const callbackToken = invitationToken
    ? `&invite=${encodeURIComponent(invitationToken)}`
    : ownerSignupToken
      ? `&owner=${encodeURIComponent(ownerSignupToken)}`
      : "";
  const { data, error } = await supabase.auth.signUp({
    email,
    options: {
      data: { full_name: fullName, signup_intent: role },
      emailRedirectTo: `${origin}/auth/confirm?next=/signup/complete${callbackToken}`,
    },
    password,
  });

  if (error) {
    await clearSignupCookies();
    return { message: error.message, status: "error" };
  }

  if (data.session) {
    const provisionedRole = await completeSignupProvisioning();
    if (!provisionedRole) {
      return {
        message: "Account created, but gym access could not be completed.",
        status: "error",
      };
    }
    redirect(dashboardForRole(provisionedRole));
  }

  return {
    message: "Check your email to confirm your account, then return to Ravoge.",
    status: "success",
  };
}

export async function recoverOwnerSignupAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const organizationName = asString(formData.get("organizationName"));
  if (organizationName.length < 2 || organizationName.length > 120) {
    return { message: "Enter the gym name used during signup.", status: "error" };
  }

  const { supabase, userId } = await getVerifiedUser();
  if (!userId) {
    return { message: "Sign in again to complete setup.", status: "error" };
  }

  const existingMembership = await getActiveMembership(userId);
  if (existingMembership) redirect(dashboardForRole(existingMembership.role));

  const { error } = await supabase.rpc("complete_owner_signup", {
    confirmed_gym_name: organizationName,
    signup_token: null,
  });
  if (error) {
    return {
      message: "That gym name did not match a pending Owner signup.",
      status: "error",
    };
  }

  const membership = await getActiveMembership(userId);
  if (!membership || membership.role !== "owner") {
    return { message: "Owner setup could not be completed.", status: "error" };
  }

  await clearSignupCookies();
  redirect("/owner");
}

export async function requestPasswordResetAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = asString(formData.get("email")).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { message: "Enter a valid email address.", status: "error" };
  }

  const supabase = await createClient();
  const origin = await getRequestOrigin();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password/update`,
  });

  return {
    message: "If that account exists, a recovery email is on its way.",
    status: "success",
  };
}

export async function updatePasswordAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = asString(formData.get("password"));
  const confirmPassword = asString(formData.get("confirmPassword"));
  if (!validatePassword(password)) {
    return {
      message: "Use at least 8 characters with a letter and a number.",
      status: "error",
    };
  }
  if (password !== confirmPassword) {
    return { message: "Passwords do not match.", status: "error" };
  }

  const { supabase, userId } = await getVerifiedUser();
  if (!userId) {
    return { message: "Your recovery session has expired.", status: "error" };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { message: error.message, status: "error" };
  return { message: "Password updated. You can continue to Ravoge.", status: "success" };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function createInvitation(
  role: AccountRole,
  formData: FormData,
): Promise<ActionState> {
  const email = asString(formData.get("email")).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { message: "Enter a valid email address.", status: "error" };
  }

  const { supabase, userId } = await getVerifiedUser();
  if (!userId) return { message: "Sign in again.", status: "error" };
  const membership = await getActiveMembership(userId);
  if (!membership) return { message: "Active gym access is required.", status: "error" };

  const isOwnerInvitation = role === "owner" || role === "coach";
  if (
    membership.role === "client"
    || (isOwnerInvitation && membership.role !== "owner")
    || (role === "client" && !["owner", "coach"].includes(membership.role))
  ) {
    return { message: "That invitation type is not permitted.", status: "error" };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("organization_invitations").insert({
    email,
    expires_at: expiresAt,
    invited_by: userId,
    organization_id: membership.organization_id,
    role,
    token_hash: tokenHash,
  });
  if (error) return { message: error.message, status: "error" };

  const origin = await getRequestOrigin();
  const path = role === "owner"
    ? `/signup/owner?invite=${encodeURIComponent(token)}`
    : `/${role}/install?invite=${encodeURIComponent(token)}`;
  return {
    invitationRole: role,
    invitationUrl: `${origin}${path}`,
    message: "Secure invitation created.",
    recipientEmail: email,
    status: "success",
  };
}

export async function createOwnerInvitationAction(
  _state: ActionState,
  formData: FormData,
) {
  return createInvitation("owner", formData);
}

export async function createCoachInvitationAction(
  _state: ActionState,
  formData: FormData,
) {
  return createInvitation("coach", formData);
}

export async function createClientInvitationAction(
  _state: ActionState,
  formData: FormData,
) {
  return createInvitation("client", formData);
}
