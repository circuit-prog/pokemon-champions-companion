"""Turning Pikalytics display names into Pokemon in our own dex.

Their data names Pokemon the way a person writes them ("Charizard-Mega-Y",
"Floette-Eternal", "Basculegion") while we store PokeAPI slugs
("charizard-mega-y", "floette-eternal", "basculegion-male"). Anywhere the
frontend needs to act on one of their names - add this teammate to my team,
import this tournament roster - it needs the slug, because a display name
alone can't be looked back up.

Lives in its own module because both the meta router (cores, top teams) and
the pokemon router (common teammates) need exactly the same lookup.
"""
from typing import Dict, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.models.pokemon import Pokemon


def resolve_names(db: Session, display_names: Set[str]) -> Dict[str, Tuple[Optional[str], Optional[str]]]:
    """Map display names to (slug, sprite_url), with (None, None) where a name
    doesn't match anything we hold."""
    slugs = {n: n.lower().replace(" ", "-") for n in display_names}
    found = db.query(Pokemon).filter(Pokemon.name.in_(list(slugs.values()))).all()
    by_slug = {p.name: p.sprite_url for p in found}

    result: Dict[str, Tuple[Optional[str], Optional[str]]] = {
        name: (slug, by_slug[slug]) if slug in by_slug else (None, None)
        for name, slug in slugs.items()
    }

    # Species with battle/gender/regional forms (Basculegion, Maushold,
    # Pyroar, ...) aren't in PokeAPI under their plain name - fall back to the
    # first variant, which is the one people mean.
    for name, slug in slugs.items():
        if result[name][0] is None:
            variant = (
                db.query(Pokemon)
                .filter(Pokemon.name.like(f"{slug}-%"))
                .order_by(Pokemon.id)
                .first()
            )
            if variant:
                result[name] = (variant.name, variant.sprite_url)
    return result


def resolve_slug(db: Session, display_name: str) -> Optional[str]:
    """The slug for a single display name, or None if we don't have it."""
    return resolve_names(db, {display_name})[display_name][0]
