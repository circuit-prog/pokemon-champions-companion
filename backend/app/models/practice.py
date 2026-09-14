"""The user's own logged practice games - Phase 4 of the roadmap. Entered by
hand, live, while actually playing: pick a saved team, then log each turn as
it happens. Purely personal history, single-user, no auth needed (same as
every other table in this app).

Separate from Tournament/TournamentResult (tournament.py), which are public
competitive results scraped or admin-entered from real events - these are
the user's own private practice games and never touch that data.
"""
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class PracticeGame(Base):
    __tablename__ = "practice_games"

    id = Column(Integer, primary_key=True)
    date = Column(String, nullable=False)  # ISO date (YYYY-MM-DD)
    my_team_name = Column(String, nullable=False)
    # Snapshot of the saved team's species at logging time (JSON list of
    # pokemon-name strings) - saved teams live only in the browser's
    # localStorage (teamStorage.ts), not this DB, so a game must keep its
    # own copy or it would go stale/dangling if the team is later edited
    # or deleted.
    my_roster_json = Column(String, nullable=False)
    # "win" | "loss" | null while the game is still being logged live -
    # stats only ever count games with a result set.
    result = Column(String, nullable=True)
    replay_link = Column(String, nullable=True)
    notes = Column(String, nullable=True)

    turns = relationship(
        "PracticeTurn",
        back_populates="game",
        cascade="all, delete-orphan",
        order_by="PracticeTurn.turn_number",
    )


class PracticeTurn(Base):
    __tablename__ = "practice_turns"

    id = Column(Integer, primary_key=True)
    game_id = Column(Integer, ForeignKey("practice_games.id"), nullable=False)
    turn_number = Column(Integer, nullable=False)

    my_pokemon = Column(String, nullable=True)
    my_move = Column(String, nullable=True)
    my_damage = Column(String, nullable=True)  # "big" | "normal" | "weak" | "miss"
    my_fainted = Column(Boolean, nullable=False, default=False)
    my_switch_in = Column(String, nullable=True)

    opponent_pokemon = Column(String, nullable=True)
    opponent_move = Column(String, nullable=True)
    opponent_damage = Column(String, nullable=True)
    opponent_fainted = Column(Boolean, nullable=False, default=False)
    opponent_switch_in = Column(String, nullable=True)

    # Free text catch-all for anything not covered above - weather, terrain,
    # status conditions, whatever's worth noting that turn.
    field_notes = Column(String, nullable=True)

    game = relationship("PracticeGame", back_populates="turns")
