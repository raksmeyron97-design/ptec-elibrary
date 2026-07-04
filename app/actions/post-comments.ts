"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Authentication required");
  return { supabase, user };
}

export async function createComment(
  postId: string,
  postSlug: string,
  body: string,
  parentId?: string | null,
): Promise<{ error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Comment cannot be empty" };
  if (trimmed.length > 2000) return { error: "Comment is too long (max 2000 characters)" };

  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase.from("post_comments").insert({
      post_id:   postId,
      user_id:   user.id,
      body:      trimmed,
      parent_id: parentId ?? null,
    });

    if (error) return { error: error.message };

    revalidatePath(`/posts/${postSlug}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to post comment" };
  }
}

export async function deleteComment(
  commentId: string,
  postSlug: string,
): Promise<{ error?: string }> {
  try {
    const { supabase, user } = await getAuthUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = ADMIN_PANEL_ROLES.includes((profile?.role ?? "reader") as AppRole);

    // Soft-delete: admins can delete any comment; users only their own
    let query = supabase
      .from("post_comments")
      .update({ is_deleted: true })
      .eq("id", commentId);

    if (!isAdmin) {
      query = query.eq("user_id", user.id);
    }

    const { error } = await query;
    if (error) return { error: error.message };

    revalidatePath(`/posts/${postSlug}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete comment" };
  }
}

export async function toggleCommentLike(
  commentId: string,
): Promise<{ liked?: boolean; error?: string }> {
  try {
    const { supabase } = await getAuthUser();

    const { data, error } = await supabase.rpc("toggle_comment_like", {
      p_comment_id: commentId,
    });

    if (error) return { error: error.message };

    return { liked: data as boolean };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to toggle like" };
  }
}

export async function getCommentLikes(
  commentId: string,
): Promise<{ likeCount: number; likedByMe: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_comment_likes", {
      p_comment_id: commentId,
    });

    if (error) return { likeCount: 0, likedByMe: false, error: error.message };

    const row = (data as { like_count: number; liked_by_me: boolean }[] | null)?.[0];
    return {
      likeCount: Number(row?.like_count ?? 0),
      likedByMe: row?.liked_by_me ?? false,
    };
  } catch (err) {
    return {
      likeCount: 0,
      likedByMe: false,
      error: err instanceof Error ? err.message : "Failed to load likes",
    };
  }
}

export async function updateComment(
  commentId: string,
  newBody: string,
  postSlug: string,
): Promise<{ error?: string }> {
  const trimmed = newBody.trim();
  if (!trimmed) return { error: "Comment cannot be empty" };
  if (trimmed.length > 2000) return { error: "Comment is too long (max 2000 characters)" };

  try {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase
      .from("post_comments")
      .update({
        body: trimmed,
        updated_at: new Date().toISOString(),
        is_edited: true,
      })
      .eq("id", commentId)
      .eq("user_id", user.id);

    if (error) return { error: error.message };

    revalidatePath(`/posts/${postSlug}`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update comment" };
  }
}
