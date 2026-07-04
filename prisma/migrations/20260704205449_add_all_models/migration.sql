/*
  Warnings:

  - Added the required column `guildId` to the `AutoReply` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AutoReply` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "GuildTicketConfig" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "buttons" TEXT NOT NULL DEFAULT '[]',
    "ticketMessages" TEXT NOT NULL DEFAULT '{}',
    "embedSettings" TEXT NOT NULL DEFAULT '{}',
    "general" TEXT NOT NULL DEFAULT '{}',
    "activeTickets" TEXT NOT NULL DEFAULT '[]',
    "claimStats" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GuildReviewConfig" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "reviewsChannel" TEXT,
    "reviewRole" TEXT,
    "minDelaySeconds" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Review" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "ratedId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "ticketChannelName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GuildLogConfig" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoCreate" BOOLEAN NOT NULL DEFAULT false,
    "channelMessageDelete" TEXT,
    "channelMessageEdit" TEXT,
    "channelMemberJoin" TEXT,
    "channelMemberLeave" TEXT,
    "channelTicket" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutoReply" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guildId" TEXT NOT NULL,
    "triggerMessage" TEXT NOT NULL,
    "replyContent" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'exact',
    "replyType" TEXT NOT NULL DEFAULT 'message',
    "embedTitle" TEXT,
    "embedColor" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowedChannels" TEXT NOT NULL DEFAULT '',
    "deniedChannels" TEXT NOT NULL DEFAULT '',
    "allowedRoles" TEXT NOT NULL DEFAULT '',
    "replyToSender" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AutoReply" ("createdAt", "id", "replyContent", "triggerMessage") SELECT "createdAt", "id", "replyContent", "triggerMessage" FROM "AutoReply";
DROP TABLE "AutoReply";
ALTER TABLE "new_AutoReply" RENAME TO "AutoReply";
CREATE UNIQUE INDEX "AutoReply_guildId_triggerMessage_key" ON "AutoReply"("guildId", "triggerMessage");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
