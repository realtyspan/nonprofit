-- DropForeignKey
ALTER TABLE "GolfCheckIn" DROP CONSTRAINT "GolfCheckIn_orgId_fkey";

-- DropForeignKey
ALTER TABLE "GolfCheckIn" DROP CONSTRAINT "GolfCheckIn_teamPlayerId_fkey";

-- DropForeignKey
ALTER TABLE "GolfCheckIn" DROP CONSTRAINT "GolfCheckIn_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "GolfEmailSuppression" DROP CONSTRAINT "GolfEmailSuppression_orgId_fkey";

-- DropForeignKey
ALTER TABLE "GolfInterestSignup" DROP CONSTRAINT "GolfInterestSignup_orgId_fkey";

-- DropForeignKey
ALTER TABLE "GolfLog" DROP CONSTRAINT "GolfLog_orgId_fkey";

-- DropForeignKey
ALTER TABLE "GolfLog" DROP CONSTRAINT "GolfLog_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "GolfPlayer" DROP CONSTRAINT "GolfPlayer_orgId_fkey";

-- DropForeignKey
ALTER TABLE "GolfSponsorContact" DROP CONSTRAINT "GolfSponsorContact_orgId_fkey";

-- DropForeignKey
ALTER TABLE "GolfSponsorship" DROP CONSTRAINT "GolfSponsorship_orgId_fkey";

-- DropForeignKey
ALTER TABLE "GolfSponsorship" DROP CONSTRAINT "GolfSponsorship_sponsorId_fkey";

-- DropForeignKey
ALTER TABLE "GolfSponsorship" DROP CONSTRAINT "GolfSponsorship_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "GolfTeam" DROP CONSTRAINT "GolfTeam_orgId_fkey";

-- DropForeignKey
ALTER TABLE "GolfTeam" DROP CONSTRAINT "GolfTeam_sponsorshipId_fkey";

-- DropForeignKey
ALTER TABLE "GolfTeam" DROP CONSTRAINT "GolfTeam_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "GolfTeamPlayer" DROP CONSTRAINT "GolfTeamPlayer_orgId_fkey";

-- DropForeignKey
ALTER TABLE "GolfTeamPlayer" DROP CONSTRAINT "GolfTeamPlayer_playerId_fkey";

-- DropForeignKey
ALTER TABLE "GolfTeamPlayer" DROP CONSTRAINT "GolfTeamPlayer_teamId_fkey";

-- DropForeignKey
ALTER TABLE "GolfTeamPlayer" DROP CONSTRAINT "GolfTeamPlayer_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "GolfTournament" DROP CONSTRAINT "GolfTournament_orgId_fkey";

-- DropForeignKey
ALTER TABLE "GolfTournament" DROP CONSTRAINT "GolfTournament_previousTournamentId_fkey";

-- DropTable
DROP TABLE "GolfCheckIn";

-- DropTable
DROP TABLE "GolfEmailSuppression";

-- DropTable
DROP TABLE "GolfInterestSignup";

-- DropTable
DROP TABLE "GolfLog";

-- DropTable
DROP TABLE "GolfPlayer";

-- DropTable
DROP TABLE "GolfSponsorContact";

-- DropTable
DROP TABLE "GolfSponsorship";

-- DropTable
DROP TABLE "GolfTeam";

-- DropTable
DROP TABLE "GolfTeamPlayer";

-- DropTable
DROP TABLE "GolfTournament";

