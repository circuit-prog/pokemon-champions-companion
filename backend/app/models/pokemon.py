"""SQLAlchemy models for Pokemon reference data (species, moves, items, abilities).

These mirror what PokeAPI gives us, trimmed to the fields the team builder
and damage calculator actually need.
"""
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Table
from sqlalchemy.orm import relationship

from app.database import Base

# Many-to-many: which moves a Pokemon can learn, and which abilities it can have.
pokemon_moves = Table(
    "pokemon_moves",
    Base.metadata,
    Column("pokemon_id", Integer, ForeignKey("pokemon.id"), primary_key=True),
    Column("move_id", Integer, ForeignKey("moves.id"), primary_key=True),
)

pokemon_abilities = Table(
    "pokemon_abilities",
    Base.metadata,
    Column("pokemon_id", Integer, ForeignKey("pokemon.id"), primary_key=True),
    Column("ability_id", Integer, ForeignKey("abilities.id"), primary_key=True),
)


class Pokemon(Base):
    __tablename__ = "pokemon"

    id = Column(Integer, primary_key=True)  # PokeAPI national dex id (or variant id)
    name = Column(String, unique=True, index=True, nullable=False)  # e.g. "garchomp"
    display_name = Column(String, nullable=False)  # e.g. "Garchomp"
    type1 = Column(String, nullable=False)
    type2 = Column(String, nullable=True)

    hp = Column(Integer, nullable=False)
    attack = Column(Integer, nullable=False)
    defense = Column(Integer, nullable=False)
    special_attack = Column(Integer, nullable=False)
    special_defense = Column(Integer, nullable=False)
    speed = Column(Integer, nullable=False)

    sprite_url = Column(String, nullable=True)

    moves = relationship("Move", secondary=pokemon_moves, back_populates="learned_by")
    abilities = relationship("Ability", secondary=pokemon_abilities, back_populates="pokemon")


class Move(Base):
    __tablename__ = "moves"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    category = Column(String, nullable=False)  # physical / special / status
    power = Column(Integer, nullable=True)
    accuracy = Column(Integer, nullable=True)
    pp = Column(Integer, nullable=True)
    effect = Column(String, nullable=True)

    learned_by = relationship("Pokemon", secondary=pokemon_moves, back_populates="moves")


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=False)
    sprite_url = Column(String, nullable=True)
    effect = Column(String, nullable=True)


class Ability(Base):
    __tablename__ = "abilities"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=False)
    effect = Column(String, nullable=True)

    pokemon = relationship("Pokemon", secondary=pokemon_abilities, back_populates="abilities")


class PokemonUsageStats(Base):
    """Real Pokemon Champions competitive usage data for Regulation M-B.

    Sourced from Smogon's published stats for gen9championsvgc2026regmb
    (~310 Pokemon, with real usage percentages and EV spreads). We previously
    used Pikalytics' AI API here, which publishes only the top 50 for this
    format, no usage percentages, and no spreads at all; Pikalytics is still
    the source for team cores and top tournament teams, which Smogon lacks.

    Only Pokemon actually seen in ranked play have a row - most of the
    `pokemon` table won't.
    """
    __tablename__ = "pokemon_usage_stats"

    id = Column(Integer, primary_key=True)
    pokemon_id = Column(Integer, ForeignKey("pokemon.id"), unique=True, nullable=False)
    format = Column(String, nullable=False)  # e.g. "battledataregmbs3"
    rank = Column(Integer, nullable=False)
    usage_percent = Column(Float, nullable=True)
    win_rate = Column(Float, nullable=True)
    record = Column(String, nullable=True)  # e.g. "10833-11714-41"

    # Stored as JSON text: [{"name": "...", "percent": 65.3}, ...], already usage-sorted.
    # `percent` may be null for teammates_json (Pikalytics doesn't always publish co-occurrence %).
    moves_json = Column(String, nullable=False, default="[]")
    items_json = Column(String, nullable=False, default="[]")
    abilities_json = Column(String, nullable=False, default="[]")
    teammates_json = Column(String, nullable=False, default="[]")

    # Real EV spreads: [{"nature": "adamant", "evs": {...}, "percent": 14.64}].
    # The single most-requested thing we couldn't previously get - Pikalytics
    # publishes no spreads. Champions uses a 66-point budget, 32 per stat.
    spreads_json = Column(String, nullable=False, default="[]")

    pokemon = relationship("Pokemon", backref="usage_stats", uselist=False)


class TeamCore(Base):
    """Pokemon combinations that appear together most often on real teams
    (2-, 3-, and 4-Pokemon cores), from Pikalytics' format index."""
    __tablename__ = "team_cores"

    id = Column(Integer, primary_key=True)
    format = Column(String, nullable=False)
    size = Column(Integer, nullable=False)  # 2, 3, or 4
    rank = Column(Integer, nullable=False)  # rank within its size group
    pokemon_json = Column(String, nullable=False)  # JSON list of display names
    teams = Column(Integer, nullable=True)  # how many sampled teams ran this core
    usage_percent = Column(Float, nullable=True)


class TopTeam(Base):
    """A high-performing team from a recent tracked tournament."""
    __tablename__ = "top_teams"

    id = Column(Integer, primary_key=True)
    format = Column(String, nullable=False)
    rank = Column(Integer, nullable=False)
    author = Column(String, nullable=True)
    record = Column(String, nullable=True)  # e.g. "13-2"
    tournament = Column(String, nullable=True)
    pokemon_json = Column(String, nullable=False)  # JSON list of display names


class UsageSnapshot(Base):
    """A point-in-time copy of one Pokemon's usage rank/win rate, written on
    every scrape run so we can chart trends over time later. Pikalytics only
    publishes current data, so history has to be accumulated going forward -
    it can't be backfilled."""
    __tablename__ = "usage_snapshots"

    id = Column(Integer, primary_key=True)
    format = Column(String, nullable=False)
    scraped_at = Column(String, nullable=False, index=True)  # ISO8601 UTC
    pokemon_name = Column(String, nullable=False, index=True)  # slug
    rank = Column(Integer, nullable=False)
    win_rate = Column(Float, nullable=True)
    record = Column(String, nullable=True)
