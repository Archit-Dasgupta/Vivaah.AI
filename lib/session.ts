// lib/session.ts
import { supabaseAdmin } from "./supabase";

/**
 * Server-side session helper for convo_sessions table.
 * Exports: getSession, createSession, updateSession
 *
 * NOTE: This file assumes your table is named `convo_sessions`.
 */

export async function getSession(sessionKey: string) {
  if (!sessionKey) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("convo_sessions")
      .select("*")
      .eq("session_key", sessionKey)
      .limit(1)
      .maybeSingle();

    if (error) {
      // not found will surface as null in data; log and return null
      console.warn("[session] getSession warning:", error.message ?? error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[session] getSession throw:", err);
    return null;
  }
}

export async function createSession(sessionKey: string, initialState: any = {}) {
  if (!sessionKey) throw new Error("createSession requires sessionKey");

  try {
    const payload = {
      session_key: sessionKey,
      state: initialState,
    };

    const { data, error } = await supabaseAdmin
      .from("convo_sessions")
      .insert([payload])
      .select()
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[session] createSession error:", error.message ?? error);
      throw error;
    }

    return data;
  } catch (err) {
    console.error("[session] createSession throw:", err);
    throw err;
  }
}

export async function updateSession(sessionKey: string, newState: any) {
  if (!sessionKey) throw new Error("updateSession requires sessionKey");

  try {
    const { data, error } = await supabaseAdmin
      .from("convo_sessions")
      .update({ state: newState, last_updated: new Date().toISOString() })
      .eq("session_key", sessionKey)
      .select()
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[session] updateSession error:", error.message ?? error);
      throw error;
    }

    return data;
  } catch (err) {
    console.error("[session] updateSession throw:", err);
    throw err;
  }
}
