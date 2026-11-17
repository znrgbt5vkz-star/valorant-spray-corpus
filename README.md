# Spraying Meaning

A bilingual static corpus-explorer website for the 2026R1 *Translation Technology in the Age of AI* final project.

**Topic:** English → Simplified Chinese localisation of VALORANT spray names.

## What is included

- 939-entry full census of eligible English–Simplified Chinese spray-name pairs after filtering and deduplication.
- Source: VALORANT-API `release-13.10`, retrieved 17 November 2026.
- Annotation labels are keyed by UUID in `scripts/strategy_map.json`.
- The fixed 50-item human audit uses seed `20261117`.
- Six translation-strategy categories: literal translation, semantic paraphrase, transcreation, explicitation, cultural substitution, and retention/phonetic transfer.
- Search, category/source-form/human-check filters, sortable data grid and CSV export.
- Four linked visualisations: Sankey diagram, heatmap, treemap and scatter plot.
- URL-synced search and filter state.
- English/Simplified Chinese interface.
- Learning report, codebook, AI use declaration and a 50-item audit page.
- Reproducible collection/validation scripts.

## Local preview

Run a local web server from this folder:

```powershell
python -m http.server 8765
```

Then open <http://127.0.0.1:8765/>.

A local server is required because the explorer loads `data/corpus.json` with `fetch()`.

## Rebuild the corpus

```powershell
python scripts/build_corpus.py
python scripts/validate_project.py
```

The build uses the current API snapshot and rewrites:

- `data/corpus.json`
- `data/corpus.csv`
- `data/manual-check-50.csv`

## Human audit

The required 50-item audit is complete: all 50 sampled entries are marked `human_checked=yes`, while the remaining 889 entries remain `no`. The workflow below is retained so the check can be repeated or audited later.

1. Open `review.html` or run the local site and visit `/review.html`.
2. Open both source links for each audit entry.
3. Tick the entry only after checking the UUID-matched pair.
4. Export the checked file as `manual-check-results.csv`.
5. Place the exported file in `data/` and run:

```powershell
python scripts/apply_manual_checks.py
python scripts/validate_project.py
```

The update script changes `human_checked` to `yes` for the reviewed IDs in both JSON and CSV.

## Deploy to GitHub Pages

1. Create a public GitHub repository.
2. Push all files in this folder.
3. In the repository, open **Settings → Pages**.
4. Set the source to the `main` branch and the repository root.
5. The site will be available at `https://<username>.github.io/<repository-name>/`.

## Data and ethical notes

- VALORANT-API is a community-maintained API derived from game data. It is not an official Riot Games API.
- The site publishes only short names, source URLs and small reference thumbnails for manual verification.
- VALORANT and related names/assets belong to Riot Games. This site is an educational project and is not endorsed by Riot Games.
- Before final submission, re-check the current API terms, Riot fan-content policy and the course requirements.
## Design QA

- Premium visual layer: `assets/premium.css`.
- Rendered evidence and screenshots: `evidence/`.
- Validate the evidence record with the installed `frontend-design-direction` checker if needed.
