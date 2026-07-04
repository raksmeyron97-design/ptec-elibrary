"use server";

import { createClient } from "@/lib/supabase/server";

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Authentication required");
  return { supabase, user };
}

export async function togglePostLike(
  postId: string,
): Promise<{ liked?: boolean; error?: string }> {
  try {
    const { supabase } = await getAuthUser();

    const { data, error } = await supabase.rpc("toggle_post_like", {
      p_post_id: postId,
    });

    if (error) return { error: error.message };

    return { liked: data as boolean };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to toggle like" };
  }
}

export async function togglePostSave(
  postId: string,
): Promise<{ saved?: boolean; error?: string }> {
  try {
    const { supabase } = await getAuthUser();

    const { data, error } = await supabase.rpc("toggle_post_save", {
      p_post_id: postId,
    });

    if (error) return { error: error.message };

    return { saved: data as boolean };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to toggle save" };
  }
}
