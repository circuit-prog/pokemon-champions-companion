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
    """Real Pokemon Champions competitive usage data, scraped from Pikalytics'
    published AI data API (/ai/pokedex/battledataregmbs3) for Regulation M-B -
    the regulation actually current at time of writing, including Mega Pokemon.
    Only exists for Pokemon actually seen in tracked tournaments (~50 as of
    writing) - most Pokemon in the `pokemon` table won't have a row here.
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

    pokemon = relationship("Pokemon", backref="usage_stats", uselist=False)
