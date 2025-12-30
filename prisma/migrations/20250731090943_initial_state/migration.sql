/*
  Warnings:

  - Made the column `size` on table `Item` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Item" ALTER COLUMN "size" SET NOT NULL;
