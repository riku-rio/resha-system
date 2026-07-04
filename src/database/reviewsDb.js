const prisma = require("../config/database");

/**
 * Gets (or creates) the review configuration for a guild.
 * Returns an object matching the old JSON shape:
 *   { config: { reviewsChannel, reviewRole, minDelaySeconds }, reviews: [...] }
 */
async function getGuildConfig(guildId) {
  const key = guildId || "global";

  let configRow = await prisma.guildReviewConfig.findUnique({ where: { guildId: key } });
  if (!configRow) {
    configRow = await prisma.guildReviewConfig.create({
      data: { guildId: key }
    });
  }

  const reviews = await prisma.review.findMany({
    where: { guildId: key },
    orderBy: { id: "asc" }
  });

  return {
    config: {
      reviewsChannel:  configRow.reviewsChannel  || null,
      reviewRole:      configRow.reviewRole      || null,
      minDelaySeconds: configRow.minDelaySeconds || 0
    },
    reviews
  };
}

/**
 * Saves the guild-level config (channel, role, minDelay).
 * NOTE: reviews are saved individually via createReview/deleteReview.
 * This function also accepts the old shape and handles review bulk-replace
 * when config.reviews is explicitly set (for reset operations).
 */
async function saveGuildConfig(guildId, guildConfig) {
  const key = guildId || "global";
  const cfg = guildConfig.config || {};

  await prisma.guildReviewConfig.upsert({
    where: { guildId: key },
    update: {
      reviewsChannel:  cfg.reviewsChannel  || null,
      reviewRole:      cfg.reviewRole      || null,
      minDelaySeconds: cfg.minDelaySeconds || 0
    },
    create: {
      guildId: key,
      reviewsChannel:  cfg.reviewsChannel  || null,
      reviewRole:      cfg.reviewRole      || null,
      minDelaySeconds: cfg.minDelaySeconds || 0
    }
  });

  // Support bulk review replacement used by reset operations
  if (Array.isArray(guildConfig.reviews)) {
    // Get existing IDs and remove any that aren't in the new list
    const existingIds = (await prisma.review.findMany({
      where: { guildId: key },
      select: { id: true }
    })).map((r) => r.id);

    const keepIds = guildConfig.reviews.map((r) => r.id).filter(Boolean);
    const toDelete = existingIds.filter((id) => !keepIds.includes(id));

    if (toDelete.length > 0) {
      await prisma.review.deleteMany({ where: { id: { in: toDelete } } });
    }
  }
}

/**
 * Gets all reviews for a guild.
 */
async function getGuildReviews(guildId) {
  return prisma.review.findMany({
    where: { guildId: guildId || "global" },
    orderBy: { id: "asc" }
  });
}

/**
 * Gets a single review by ID.
 */
async function getReview(guildId, id) {
  return prisma.review.findFirst({
    where: { id, guildId: guildId || "global" }
  });
}

/**
 * Creates a new review.
 */
async function createReview(guildId, { raterId, ratedId, stars, comment, ticketChannelName, source }) {
  return prisma.review.create({
    data: {
      guildId:          guildId || "global",
      raterId,
      ratedId,
      stars:            parseInt(stars, 10),
      comment:          (comment || "").trim(),
      ticketChannelName: ticketChannelName || null,
      source:           source || "auto"
    }
  });
}

/**
 * Deletes a review by ID.
 */
async function deleteReview(guildId, id) {
  try {
    return await prisma.review.delete({ where: { id } });
  } catch {
    return null;
  }
}

/**
 * Gets average stats for a specific staff member.
 */
async function getAverage(guildId, ratedId) {
  const reviews = await prisma.review.findMany({
    where: { guildId: guildId || "global", ratedId }
  });

  if (reviews.length === 0) return { average: 0, count: 0 };

  const sum = reviews.reduce((acc, r) => acc + r.stars, 0);
  return {
    average: parseFloat((sum / reviews.length).toFixed(2)),
    count: reviews.length
  };
}

module.exports = {
  getGuildConfig,
  saveGuildConfig,
  getGuildReviews,
  getReview,
  createReview,
  deleteReview,
  getAverage
};
