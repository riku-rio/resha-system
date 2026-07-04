const fs = require("fs");
const path = require("path");

const dbPath = path.resolve(__dirname, "../../data/autoreply_db.json");

/**
 * Ensures the database file and its parent directories exist.
 */
function ensureDbExists() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({}, null, 2), "utf8");
  }
}

/**
 * Reads all data from the JSON database.
 * @returns {object} All guild databases.
 */
function readData() {
  ensureDbExists();
  try {
    const content = fs.readFileSync(dbPath, "utf8");
    return JSON.parse(content || "{}");
  } catch (error) {
    console.error("Failed to read autoreply database:", error);
    return {};
  }
}

/**
 * Writes all data to the JSON database.
 * @param {object} data The database object to save.
 */
function writeData(data) {
  ensureDbExists();
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to write to autoreply database:", error);
  }
}

/**
 * Gets all auto-replies for a specific guild.
 * @param {string} guildId The Discord Guild ID.
 * @returns {Array} The list of auto-replies.
 */
function getGuildReplies(guildId) {
  const data = readData();
  const guildKey = guildId || "global";
  if (!data[guildKey]) {
    data[guildKey] = {
      autoReplies: []
    };
    writeData(data);
  }
  return data[guildKey].autoReplies;
}

/**
 * Saves all auto-replies for a specific guild.
 * @param {string} guildId The Discord Guild ID.
 * @param {Array} replies The list of replies.
 */
function saveGuildReplies(guildId, replies) {
  const data = readData();
  const guildKey = guildId || "global";
  data[guildKey] = {
    autoReplies: replies
  };
  writeData(data);
}

/**
 * Gets a specific auto-reply by ID.
 * @param {string} guildId The Discord Guild ID.
 * @param {number} id The auto-reply ID.
 * @returns {object|null}
 */
function getAutoReply(guildId, id) {
  const replies = getGuildReplies(guildId);
  return replies.find((r) => r.id === id) || null;
}

/**
 * Creates a new auto-reply.
 * @param {string} guildId The Discord Guild ID.
 * @param {object} param1 The fields: triggerMessage, replyContent.
 * @returns {object}
 */
function createAutoReply(guildId, { triggerMessage, replyContent }) {
  const replies = getGuildReplies(guildId);
  const maxId = replies.reduce((max, r) => (r.id > max ? r.id : max), 0);

  const newReply = {
    id: maxId + 1,
    triggerMessage: triggerMessage.toLowerCase().trim(),
    replyContent: replyContent.trim(),
    matchType: "exact",
    replyType: "message",
    embedTitle: null,
    embedColor: null,
    enabled: true,
    allowedChannels: "",
    deniedChannels: "",
    allowedRoles: "",
    replyToSender: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  replies.push(newReply);
  saveGuildReplies(guildId, replies);
  return newReply;
}

/**
 * Updates an auto-reply fields.
 * @param {string} guildId The Discord Guild ID.
 * @param {number} id The auto-reply ID.
 * @param {object} fields The fields to update.
 * @returns {object|null}
 */
function updateAutoReply(guildId, id, fields) {
  const replies = getGuildReplies(guildId);
  const idx = replies.findIndex((r) => r.id === id);
  if (idx === -1) return null;

  replies[idx] = {
    ...replies[idx],
    ...fields,
    updatedAt: new Date().toISOString()
  };

  saveGuildReplies(guildId, replies);
  return replies[idx];
}

/**
 * Deletes an auto-reply.
 * @param {string} guildId The Discord Guild ID.
 * @param {number} id The auto-reply ID.
 * @returns {object|null}
 */
function deleteAutoReply(guildId, id) {
  const replies = getGuildReplies(guildId);
  const idx = replies.findIndex((r) => r.id === id);
  if (idx === -1) return null;

  const [deleted] = replies.splice(idx, 1);
  saveGuildReplies(guildId, replies);
  return deleted;
}

module.exports = {
  getGuildReplies,
  saveGuildReplies,
  getAutoReply,
  createAutoReply,
  updateAutoReply,
  deleteAutoReply
};
