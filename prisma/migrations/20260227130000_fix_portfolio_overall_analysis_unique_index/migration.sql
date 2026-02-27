-- Drop old unique INDEX on userId only (created as unique index, not constraint)
DROP INDEX IF EXISTS "PortfolioOverallAnalysis_userId_key";

-- Ensure composite unique constraint exists
ALTER TABLE "PortfolioOverallAnalysis" DROP CONSTRAINT IF EXISTS "PortfolioOverallAnalysis_userId_session_key";
ALTER TABLE "PortfolioOverallAnalysis" ADD CONSTRAINT "PortfolioOverallAnalysis_userId_session_key" UNIQUE ("userId", "session");
