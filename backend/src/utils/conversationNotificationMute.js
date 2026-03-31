/**
 * Effective mute for per-channel notification prefs.
 * @param {{ muted?: boolean, mutedUntil?: Date|null }} pref
 * @param {Date} [now]
 * @returns {boolean}
 */
function isConversationNotificationMuted(pref, now = new Date()) {
  if (!pref || !pref.muted) return false;
  if (pref.mutedUntil) {
    const until = new Date(pref.mutedUntil);
    if (Number.isNaN(until.getTime())) return false;
    if (until.getTime() <= now.getTime()) return false;
    return true;
  }
  return true;
}

module.exports = {
  isConversationNotificationMuted,
};
