"""Pokemon Champions EV rules, mirroring src/natures.ts on the frontend.

IVs are fixed at 31 for every stat on every Pokemon (no breeding/hyper
training). EVs are a 66-point budget shared across all six stats, with a
32-point cap on any single stat.
"""
MAX_EV_PER_STAT = 32
EV_TOTAL_BUDGET = 66
