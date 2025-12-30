/*
  Warnings:

  - You are about to drop the column `type` on the `Item` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Item" DROP COLUMN "type",
ALTER COLUMN "content" DROP NOT NULL;
