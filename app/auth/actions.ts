"use server";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  dashboardForRole,
  getAccountType,
  getActiveMembership,
  getVerifiedUser,
  onboardingForRole,
  type AccountRole,
} from "@/lib/auth";
import { sendInvitationEmail } from "@/lib/invitation-email";
import { createClient } from "@/lib/supabase/server";

const SIGNUP_INVITE_COOKIE = "ravoge_signup_invite";
const SIGNUP_OWNER_TOKEN_COOKIE = "ravoge_signup_owner_token";
const SIGNUP_ORGANIZATION_COOKIE = "ravoge_signup_organization";

export type ActionState = {
  invitationId?: string;
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
  return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

function logAuthError(scope: string, error: { code?: string; status?: number } | null) {
  console.error(`[Ravoge auth] ${scope}`, {
    code: error?.code ?? "unknown",
    status: error?.status ?? "unknown",
  });
}

function signupErrorMessage(error: { code?: string } | null) {
  if (error?.code === "user_already_exists" || error?.code === "email_exists") {
    return "This email already has a Ravoge account. Sign in instead.";
  }
  return "Ravoge could not create the account right now. Please try again.";
}

async function getRequestOrigin() {
  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host");
  const host = forwardedHost ?? headerStore.get("host") ?? "ravoge.com";
  const isPreview = /^[a-z0-9-]+--ravoge\.netlify\.app$/i.test(host);
  const allowed = host === "ravoge.com" || host === "www.ravoge.com"
    || host === "ravoge.netlify.app" || host.startsWith("localhost:")
    || host.startsWith("127.0.0.1:") || isPreview;
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
    maxAge: 7 * 24 * 60 * 60,
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

async function destinationForAuthenticatedUser(userId: string, supabase: SupabaseClient) {
  const membership = await getActiveMembership(userId, supabase);
  if (membership) return dashboardForRole(membership.role);
  const accountType = await getAccountType(userId, supabase);
  if (accountType === "coach" || accountType === "client") {
    return onboardingForRole(accountType);
  }
  return null;
}

export async function completeSignupProvisioning(
  tokens: { invitationToken?: string; ownerSignupToken?: string } = {},
  authenticatedClient?: SupabaseClient,
) {
  const supabase = authenticatedClient ?? await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const existingMembership = await getActiveMembership(data.user.id, supabase);
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
    if (invitationError) {
      logAuthError("invitation acceptance", invitationError);
      return null;
    }
  } else if (ownerSignupToken) {
    const { error: ownerError } = await supabase.rpc("complete_owner_signup", {
      confirmed_gym_name: null,
      signup_token: ownerSignupToken,
    });
    if (ownerError) {
      logAuthError("owner provisioning", ownerError);
      return null;
    }
  } else {
    return null;
  }

  const membership = await getActiveMembership(data.user.id, supabase);
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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error) logAuthError("password sign in", error);
    return { message: "Email or password was not accepted.", status: "error" };
  }

  let membership = await getActiveMembership(data.user.id, supabase);
  if (!membership && invitationToken) {
    const { error: invitationError } = await supabase.rpc(
      "accept_organization_invitation",
      { invitation_token: invitationToken },
    );
    if (invitationError) {
      logAuthError("existing-user invitation acceptance", invitationError);
      return { message: "This invitation is invalid, expired, or belongs to another email.", status: "error" };
    }
    membership = await getActiveMembership(data.user.id, supabase);
  }
  if (membership) redirect(dashboardForRole(membership.role));

  const identityDestination = await destinationForAuthenticatedUser(data.user.id, supabase);
  if (identityDestination) redirect(identityDestination);

  const cookieStore = await cookies();
  const ownerSignupToken = cookieStore.get(SIGNUP_OWNER_TOKEN_COOKIE)?.value;
  if (ownerSignupToken) {
    const { error: ownerError } = await supabase.rpc("complete_owner_signup", {
      confirmed_gym_name: null,
      signup_token: ownerSignupToken,
    });
    if (!ownerError) {
      membership = await getActiveMembership(data.user.id, supabase);
      if (membership) {
        await clearSignupCookies();
        redirect(dashboardForRole(membership.role));
      }
    } else {
      logAuthError("owner signup recovery token", ownerError);
    }
  }

  const { data: canRecover, error: recoveryError } = await supabase.rpc("has_pending_owner_signup");
  if (recoveryError) logAuthError("owner recovery lookup", recoveryError);
  if (canRecover) redirect("/signup/owner/recover");

  redirect("/signup/identity");
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
    return { message: "Use at least 8 characters with a letter and a number.", status: "error" };
  }
  if (password !== confirmPassword) {
    return { message: "Passwords do not match.", status: "error" };
  }
  if (role === "owner" && !hasInvitation && organizationName.length < 2) {
    return { message: "Enter your gym name.", status: "error" };
  }

  const supabase = await createClient();
  let ownerSignupToken = "";
  await clearSignupCookies();

  if (hasInvitation) {
    const { data: invitationRows, error: contextError } = await supabase.rpc(
      "get_organization_invitation_context",
      { invitation_token: invitationToken },
    );
    const invitation = (invitationRows as Array<{ email: string; role: AccountRole }> | null)?.[0];
    if (contextError || !invitation) {
      if (contextError) logAuthError("invitation lookup", contextError);
      return { message: "This invitation is invalid or has expired.", status: "error" };
    }
    if (invitation.role !== role || invitation.email !== email) {
      return { message: "This invitation does not match this account type and email.", status: "error" };
    }
    await setSignupCookie(SIGNUP_INVITE_COOKIE, invitationToken);
  } else if (role === "owner") {
    ownerSignupToken = randomBytes(32).toString("base64url");
    const { error: ownerIntentError } = await supabase.rpc("begin_owner_signup", {
      gym_name: organizationName,
      owner_email: email,
      signup_token: ownerSignupToken,
    });
    if (ownerIntentError) {
      logAuthError("owner signup intent", ownerIntentError);
      return {
        message: "Owner setup could not be prepared. If this email already has an account, sign in instead.",
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
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/confirm?next=/signup/complete${callbackToken}`,
    },
    password,
  });

  if (error) {
    logAuthError("account signup", error);
    return { message: signupErrorMessage(error), status: "error" };
  }
  if (!data.session || !data.user) {
    return {
      message: "Ravoge could not start your session. Sign in if this account already exists.",
      status: "error",
    };
  }

  if (hasInvitation || role === "owner") {
    const provisionedRole = await completeSignupProvisioning({
      invitationToken: invitationToken || undefined,
      ownerSignupToken: ownerSignupToken || undefined,
    }, supabase);
    if (!provisionedRole) {
      return {
        message: hasInvitation
          ? "Your account is ready, but this invitation could not be accepted."
          : "Your account is ready, but gym setup needs to be completed.",
        status: "error",
      };
    }
    redirect(dashboardForRole(provisionedRole));
  }

  const { error: identityError } = await supabase.rpc(
    "register_unaffiliated_account_type",
    { intended_type: role },
  );
  if (identityError) {
    logAuthError("unaffiliated account registration", identityError);
    return {
      message: "Your account was created, but profile setup could not be completed. Sign in to retry.",
      status: "error",
    };
  }
  redirect(onboardingForRole(role as "coach" | "client"));
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
  if (!userId) return { message: "Sign in again to complete setup.", status: "error" };
  const existingMembership = await getActiveMembership(userId, supabase);
  if (existingMembership) redirect(dashboardForRole(existingMembership.role));

  const { error } = await supabase.rpc("complete_owner_signup", {
    confirmed_gym_name: organizationName,
    signup_token: null,
  });
  if (error) {
    logAuthError("manual owner recovery", error);
    return { message: "That gym name did not match a pending Owner signup.", status: "error" };
  }

  const membership = await getActiveMembership(userId, supabase);
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
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password/update`,
  });
  if (error) logAuthError("password reset request", error);
  return { message: "If that account exists, recovery instructions are on the way.", status: "success" };
}

export async function updatePasswordAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = asString(formData.get("password"));
  const confirmPassword = asString(formData.get("confirmPassword"));
  if (!validatePassword(password)) {
    return { message: "Use at least 8 characters with a letter and a number.", status: "error" };
  }
  if (password !== confirmPassword) {
    return { message: "Passwords do not match.", status: "error" };
  }
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) return { message: "Your recovery session has expired.", status: "error" };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    logAuthError("password update", error);
    return { message: "Ravoge could not update the password right now.", status: "error" };
  }
  return { message: "Password updated. You can continue to Ravoge.", status: "success" };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function completeIdentitySetupAction(
  role: "coach" | "client",
) {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect("/login");
  const membership = await getActiveMembership(userId, supabase);
  if (membership) redirect(dashboardForRole(membership.role));
  const { error } = await supabase.rpc("register_unaffiliated_account_type", {
    intended_type: role,
  });
  if (error) {
    logAuthError("identity recovery setup", error);
    redirect("/signup?status=identity-setup-failed");
  }
  redirect(onboardingForRole(role));
}

async function createInvitation(role: AccountRole, formData: FormData): Promise<ActionState> {
  const email = asString(formData.get("email")).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { message: "Enter a valid email address.", status: "error" };
  }

  const { supabase, userId } = await getVerifiedUser();
  if (!userId) return { message: "Sign in again.", status: "error" };
  const membership = await getActiveMembership(userId, supabase);
  if (!membership) return { message: "Active gym access is required.", status: "error" };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("create_organization_invitation", {
    invitation_expires_at: expiresAt,
    invitation_token_hash: tokenHash,
    invited_email: email,
    invited_role: role,
  });
  const invitation = (data as Array<{
    email: string;
    invitation_id: string;
    organization_name: string;
    role: AccountRole;
  }> | null)?.[0];
  if (error || !invitation) {
    if (error) logAuthError("invitation creation", error);
    return {
      message: "The invitation could not be created. Confirm this person is not already a member.",
      status: "error",
    };
  }

  const origin = await getRequestOrigin();
  const path = role === "owner"
    ? `/signup/owner?invite=${encodeURIComponent(token)}`
    : `/${role}/install?invite=${encodeURIComponent(token)}`;
  const invitationUrl = `${origin}${path}`;
  const emailResult = await sendInvitationEmail({
    invitationUrl,
    organizationName: invitation.organization_name,
    recipientEmail: invitation.email,
    role: invitation.role,
  });
  const { error: deliveryError } = await supabase.rpc(
    "record_organization_invitation_delivery",
    {
      new_delivery_error: emailResult.error,
      new_delivery_status: emailResult.status,
      new_provider_message_id: emailResult.id,
      target_invitation_id: invitation.invitation_id,
    },
  );
  if (deliveryError) logAuthError("invitation delivery status", deliveryError);

  revalidatePath("/owner/team");
  return {
    invitationId: invitation.invitation_id,
    invitationRole: role,
    invitationUrl,
    message: emailResult.status === "sent"
      ? "Invite created and email sent."
      : "Secure invitation created. Copy or email the link below.",
    recipientEmail: invitation.email,
    status: "success",
  };
}

export async function createOwnerInvitationAction(_state: ActionState, formData: FormData) {
  return createInvitation("owner", formData);
}
export async function createCoachInvitationAction(_state: ActionState, formData: FormData) {
  return createInvitation("coach", formData);
}
export async function createClientInvitationAction(_state: ActionState, formData: FormData) {
  return createInvitation("client", formData);
}
