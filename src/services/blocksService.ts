import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";

/**
 * Returns every profile id that shares a block edge with `userId` in EITHER
 * direction — users that `userId` has blocked, and users who have blocked
 * `userId`.
 *
 * A block is mutual in effect: if either party blocked the other, the pair must
 * be invisible to each other across matching, dispatch, and chat. This helper is
 * the single source of truth for that set.
 *
 * It uses the service-role client on purpose: the user_blocks RLS SELECT policy
 * only exposes rows where the caller is the blocker, so an anon/user client
 * cannot see edges where `userId` is the blocked party. The service-role client
 * sees both directions.
 *
 * Fails safe: on any error it returns an empty set, so hot paths (matching,
 * dispatch, chat) degrade to pre-block behavior instead of throwing.
 */
export async function fetchBlockedCounterpartIds(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();

  const { data, error } = await supabaseAdmin
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  if (error) {
    logger(`block counterpart lookup warning: ${error.message}`);
    return new Set();
  }

  const counterparts = new Set<string>();
  for (const row of data ?? []) {
    const other = row.blocker_id === userId ? row.blocked_id : row.blocker_id;
    if (other) counterparts.add(other as string);
  }
  return counterparts;
}

/**
 * True when a block edge exists between the two users in either direction.
 *
 * Use this for pair checks (chat send, opening a conversation) where fetching the
 * full counterpart set would be wasteful. Fails safe: returns false on error.
 */
export async function isBlockedBetween(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;

  const { data, error } = await supabaseAdmin
    .from("user_blocks")
    .select("id")
    .or(
      `and(blocker_id.eq.${userA},blocked_id.eq.${userB}),` +
        `and(blocker_id.eq.${userB},blocked_id.eq.${userA})`,
    )
    .limit(1);

  if (error) {
    logger(`block pair lookup warning: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}
