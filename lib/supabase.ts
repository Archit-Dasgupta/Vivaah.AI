// lib/session.ts
import { supabaseAdmin } from "@/lib/supabase"; // adjust import path if needed

export async function getSession(sessionKey) {
  if (!sessionKey) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("convo_sessions")
      .select("*")
      .eq("session_key", sessionKey)
      .limit(1)
      .single();
    if (error) {
      // Not found is expected sometimes; return null to let caller create
      console.warn("[session] getSession warning:", error.message ?? error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[session] getSession throw:", err);
    return null;
  }
}

export async function createSession(sessionKey, initialState = {}) {
  if (!sessionKey) throw new Error("createSession requires sessionKey");
  try {
    const { data, error } = await supabaseAdmin
      .from("convo_sessions")
      .insert([{ session_key: sessionKey, state: initialState }])
      .select()
      .limit(1)
      .single();
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

export async function updateSession(sessionKey, newState) {
  if (!sessionKey) throw new Error("updateSession requires sessionKey");
  try {
    const { data, error } = await supabaseAdmin
      .from("convo_sessions")
      .update({ state: newState, last_updated: new Date().toISOString() })
      .eq("session_key", sessionKey)
      .select()
      .limit(1)
      .single();
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
