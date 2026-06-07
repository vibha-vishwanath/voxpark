/*
  Warnings:

  - You are about to drop the column `reading_passage` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `total_updrs` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `vowel` on the `Report` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Report" DROP COLUMN "reading_passage",
DROP COLUMN "total_updrs",
DROP COLUMN "vowel",
ADD COLUMN     "acoustic_vowel" TEXT,
ADD COLUMN     "naturalSpeech" TEXT,
ADD COLUMN     "readText" TEXT,
ADD COLUMN     "spontaneousDialogue" TEXT,
ADD COLUMN     "telemonitoring_classification" TEXT,
ADD COLUMN     "telemonitoring_regression" TEXT;
