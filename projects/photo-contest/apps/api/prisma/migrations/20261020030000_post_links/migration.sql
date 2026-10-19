-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "linkUrl" TEXT,
ALTER COLUMN "uploadId" DROP NOT NULL;

-- A post must keep at least one attachment. Existing media posts already satisfy this.
ALTER TABLE "Post" ADD CONSTRAINT "Post_attachment_check" CHECK ("uploadId" IS NOT NULL OR "linkUrl" IS NOT NULL);
