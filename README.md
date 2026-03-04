# Trading Signals Project
## Analyse des Correlations Inter-Assets & Leaders/Suiveurs

Periode  : 2015-01-01 -> 2026-01-01
Actifs   : 39 (6 Bloomberg + 33 Yahoo Finance)
Frequence: Daily (2840 pts) + Weekly (574 pts)

## Structure
trading_signals_project/
├── data/
│   ├── raw/          -> Donnees brutes originales
│   ├── clean/        -> Daily nettoye (2840 x 39)
│   └── weekly/       -> Weekly nettoye (574 x 39)
├── figures/
│   ├── corr/         -> Heatmaps correlations
│   ├── rolling/      -> Correlations glissantes
│   ├── regimes/      -> Regimes de marche
│   ├── signals/      -> Signaux generes
│   └── backtest/     -> Resultats backtesting
├── results/
│   ├── stats/        -> Tests Granger, VAR
│   ├── backtest/     -> Sharpe, Drawdown, Win Rate
│   └── signals/      -> Signaux exportes
├── src/              -> Fonctions Python reutilisables
├── notebooks/        -> Notebooks Jupyter
└── reports/          -> Rapports finaux
