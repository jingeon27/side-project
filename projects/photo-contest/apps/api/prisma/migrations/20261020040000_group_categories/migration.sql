CREATE TABLE "GroupCategory" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GroupCategory_name_check" CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 20),
  CONSTRAINT "GroupCategory_position_check" CHECK ("position" >= 0),
  CONSTRAINT "GroupCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GroupCategory_id_groupId_key" ON "GroupCategory"("id", "groupId");
CREATE INDEX "GroupCategory_groupId_archivedAt_position_idx" ON "GroupCategory"("groupId", "archivedAt", "position");
CREATE UNIQUE INDEX "GroupCategory_active_name_key" ON "GroupCategory"("groupId", lower("name")) WHERE "archivedAt" IS NULL;
ALTER TABLE "Post" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Post" ADD CONSTRAINT "Post_categoryId_groupId_fkey" FOREIGN KEY ("categoryId", "groupId") REFERENCES "GroupCategory"("id", "groupId") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE INDEX "Post_groupId_categoryId_createdAt_idx" ON "Post"("groupId", "categoryId", "createdAt");
