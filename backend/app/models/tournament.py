"""Admin-entered tournament results.

Separate from TopTeam (backend/scripts/load_pikalytics_data.py), which is a
scraped, name-only snapshot of Pikalytics' current top 10. These tables hold
manually entered results - full team sets, not just species - for events the
scrape doesn't cover in that depth, and are never touched by the scraper.
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

    results = relationship(
        "TournamentResult", back_populates="tournament", cascade="all, delete-orphan"
    )


class TournamentResult(Base):
    __tablename__ = "tournament_results"

    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    placement = Column(Integer, nullable=False)  # 1-32
    player = Column(String, nullable=True)
    # JSON list of up to 6 {pokemon_name, item, ability, nature, evs, moves} -
    # mirrors TeamMemberIn (schemas.py) minus battle-state fields, which don't
    # apply to a historical record.
    roster_json = Column(String, nullable=False)
    notes = Column(String, nullable=True)
    is_dark_horse = Column(Boolean, nullable=False, default=False)

    tournament = relationship("Tournament", back_populates="results")
