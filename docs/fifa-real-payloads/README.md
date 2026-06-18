# FIFA per-match detail — REAL payload shapes (captured 2026-06-18, match 400021443 Mexico v South Africa)

The match-detail schema/mapper were built against synthetic fixtures with the WRONG shape, so zod rejects
the real payload and the panel renders empty. These captured samples are the ground truth for the fix.

## /timelines/{comp}/{season}/{stage}/{match}  -> 200
- top: IdStage, IdMatch, IdCompetition, IdSeason, IdGroup, Event, Properties, IsUpdateable
- Event[]: 80 events. Each: EventId, IdTeam, Timestamp, MatchMinute, Period, HomeGoals, AwayGoals, Type, Qualifiers, TypeLocalized, HomePenaltyGoals, AwayPenaltyGoals, EventDescription
- MatchMinute is a STRING like "4'" (parse to number). Period is a NUMBER.
- Label = TypeLocalized[].Description (array, pick a locale). IdPlayer optional. IdTeam -> home/away.
- distinct labels: Coin Toss, Start Time, Foul, Attempt at Goal, Goal Prevention, Corner, Assist, Goal!, Yellow card, Delay, Resume, Offside, End Time, Red card, Substitution, VAR, Match end

## /live/football/{comp}/{season}/{stage}/{match}  -> 200  (NOTE: needs the "football" segment)
- top: IdMatch, IdStage, IdGroup, IdSeason, CoverageLevel, IdCompetition, CompetitionName, SeasonName, SeasonShortName, Stadium, ResultType, MatchDay, MatchNumber, HomeTeamPenaltyScore, AwayTeamPenaltyScore, AggregateHomeTeamScore, AggregateAwayTeamScore, Weather, Attendance, Date, LocalDate, MatchTime, SecondHalfTime, FirstHalfTime, FirstHalfExtraTime, SecondHalfExtraTime, Winner, Period, HomeTeam, AwayTeam, BallPossession, TerritorialPossesion, TerritorialThirdPossesion, Officials, MatchStatus, GroupName, StageName, OfficialityStatus, TimeDefined, Properties, IsUpdateable
- Lineups are under HomeTeam.Players / AwayTeam.Players (NOT top-level Players, which is empty).
- HomeTeam keys: Score, Side, IdTeam, PictureUrl, IdCountry, TeamType, AgeType, Tactics, TeamName, Abbreviation, Coaches, Players, Bookings, Goals, Substitutions, Staffs, FootballType, Gender, IdAssociation, ShortClubName
- HomeTeam.Tactics = formation ("4-1-2-3"); per-team Goals/Bookings/Substitutions/Coaches.
- BallPossession top-level = null (may be null; consider TerritorialPossesion or omit).