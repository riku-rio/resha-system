const prisma = require("../config/database");

/**
 * Gets all auto-replies for a specific guild.
 * @param {string} guildId
 * @returns {Promise<Array>}
 */
async function getGuildReplies(guildId) {
  return prisma.autoReply.findMany({
    where: { guildId: guildId || "global" },
    orderBy: { id: "asc" }
  });
}

/**
 * Gets a specific auto-reply by ID.
 * @param {string} guildId
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function getAutoReply(guildId, id) {
  return prisma.autoReply.findFirst({
    where: { id, guildId: guildId || "global" }
  });
}

/**
 * Creates a new auto-reply.
 * @param {string} guildId
 * @param {object} param1 - { triggerMessage, replyContent }
 * @returns {Promise<object>}
 */
async function createAutoReply(guildId, { triggerMessage, replyContent }) {
  return prisma.autoReply.create({
    data: {
      guildId: guildId || "global",
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
      replyToSender: false
    }
  });
}

/**
 * Updates an auto-reply's fields.
 * @param {string} guildId
 * @param {number} id
 * @param {object} fields
 * @returns {Promise<object|null>}
 */
async function updateAutoReply(guildId, id, fields) {
  try {
    return await prisma.autoReply.update({
      where: { id },
      data: fields
    });
  } catch {
    return null;
  }
}

/**
 * Deletes an auto-reply.
 * @param {string} guildId
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function deleteAutoReply(guildId, id) {
  try {
    return await prisma.autoReply.delete({ where: { id } });
  } catch {
    return null;
  }
}

module.exports = {
  getGuildReplies,
  getAutoReply,
  createAutoReply,
  updateAutoReply,
  deleteAutoReply
};
