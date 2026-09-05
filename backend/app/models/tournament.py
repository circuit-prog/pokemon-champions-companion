"""Tournament results - both hand-entered through the admin form and
auto-imported weekly by scrape_limitless_tournaments.py /
load_limitless_tournaments.py.

Separate from TopTeam (backend/scripts/load_pikalytics_data.py), which is a
scraped, name-only snapshot of Pikalytics' current top 10 and fully
replaced on every scrape run. These tables are historical record instead -
nothing here is ever deleted or overwritten by a scrape, so a hand-added
note or set correction on an auto-imported result survives future runs.
"""
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    date = Column(String, nullable=False)  # ISO date (YYYY-MM-DD)
    format = Column(String, nullable=False, default="gen9championsvgc2026regmb")
    player_count = Column(Integer, nullable=True)
    source_url = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    # The limitlessvgc.com tournament id, e.g. "437" - lets the weekly scraper
    # tell "already imported" from "new" without relying on name/date matching.
    # Null for tournaments entered by hand through the admin form.
    external_id = Column(String, unique=True, nullable=True)
    # Tournament-wide "most successful Pokemon" (name/count/share/points),
    # scraped from limitlessvgc.com's own /statistics page - a larger sample
    # than just the top-32 results this app stores, so kept separately
    # rather than derived from `results`. JSON list, null until scraped.
    stats_json = Column(String, nullable=True)

    results = relationship(
        "TournamentResult", back_populates="tournament", cascade="all, delete-orphan"
    )


class TournamentResult(Base):
    __tablename__ = "tournament_results"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    placement = Column(Integer, nullable=False)  # 1-128
    player = Column(String, nullable=True)
    # JSON list of up to 6 {pokemon_name, item, ability, nature, evs, moves} -
    # mirrors TeamMemberIn (schemas.py) minus battle-state fields, which don't
    # apply to a historical record.
    roster_json = Column(String, nullable=False)
    notes = Column(String, nullable=True)
    is_dark_horse = Column(Boolean, nullable=False, default=False)
    # limitlessvgc.com's own player id (e.g. "4965"), plus what THIS result
    # specifically paid out - null for admin-entered results, which have no
    # player page to look these up against.
    player_external_id = Column(String, nullable=True)
    prize_money = Column(String, nullable=True)
    points = Column(Integer, nullable=True)

    tournament = relationship("Tournament", back_populates="results")


class Player(Base):
    """A limitlessvgc.com player: career totals, refreshed every scrape run
    (unlike Tournament/TournamentResult, which are immutable history once
    written - a player's career total keeps growing, so it's meant to be
    overwritten). Only exists for players encountered through the scraper;
    admin-entered results never create one."""
    __tablename__ = "players"

    external_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    country = Column(String, nullable=True)
    money_won = Column(String, nullable=True)
    points_earned = Column(Integer, nullable=True)
    # {"international": {"1st","2nd","t4","t8","total"}, "regionals": {...}}
    top_cuts_json = Column(String, nullable=True)
