-- CreateTable
CREATE TABLE "AutoReply" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "triggerMessage" TEXT NOT NULL,
    "replyContent" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AutoReply_triggerMessage_key" ON "AutoReply"("triggerMessage");
