import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const validEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-value",
};

describe("getSupabaseEnvironment", () => {
  it("returns trimmed public connection values", () => {
    assert.deepEqual(
      getSupabaseEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: ` ${validEnvironment.NEXT_PUBLIC_SUPABASE_URL} `,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          ` ${validEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY} `,
      }),
      {
        url: validEnvironment.NEXT_PUBLIC_SUPABASE_URL,
        publishableKey: validEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      },
    );
  });

  it("reports every missing required value without printing a secret", () => {
    assert.throws(
      () => getSupabaseEnvironment({}),
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("rejects malformed URLs and URLs containing credentials", () => {
    assert.throws(
      () =>
        getSupabaseEnvironment({
          ...validEnvironment,
          NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        }),
      /must be a valid URL/,
    );

    assert.throws(
      () =>
        getSupabaseEnvironment({
          ...validEnvironment,
          NEXT_PUBLIC_SUPABASE_URL: "https://user:password@example.supabase.co",
        }),
      /must not contain credentials/,
    );
  });

  it("rejects secret and legacy keys in the public variable", () => {
    for (const key of ["sb_secret_test-value", "service_role_test-value", "anon-key"]) {
      assert.throws(
        () =>
          getSupabaseEnvironment({
            ...validEnvironment,
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
          }),
        /must be a Supabase publishable key/,
      );
    }
  });
});
