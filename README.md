# EvoLens

EvoLens is a small, responsive website that helps answer one question: **Should I evolve this Pokemon?**

It reads the supplied `pokemon.csv` directly in the browser and turns its evolution links and base stats into a clear recommendation. No framework, build process, API key, or backend is required, so the project can be hosted directly with GitHub Pages.

## Features

- Search across 721 standard species and 90 alternate forms.
- Clear evolve, final-stage, and special-form verdicts.
- Side-by-side comparison of all six base stats.
- Complete clickable evolution chains, including branching paths.
- Branch rankings for balanced, offense, defense, or speed priorities.
- Corresponding Pokemon artwork with resilient image fallbacks.
- Responsive layout, keyboard-friendly search, and reduced-motion support.
- Shareable URLs such as `?pokemon=eevee`.

## Recommendation method

The website uses only information available in the supplied dataset:

1. A standard Pokemon can evolve when another standard row lists its `species_id` in `evolves_from_species_id`.
2. If there is one direct evolution, the website recommends evolving and shows the stat change.
3. If there are multiple direct evolutions, the selected priority ranks the alternatives:
   - **Balanced:** total of all six base stats.
   - **Offense:** Attack + Special Attack.
   - **Defense:** HP + Defense + Special Defense.
   - **Speed:** Speed.
   - Ties are broken by total base stats and then name.
4. Rows where `id` differs from `species_id` are treated as alternate forms and are not assigned a standard next evolution.

The dataset does not contain levels, stones, held items, moves, friendship, time-of-day rules, or game-specific restrictions. The interface states this limitation instead of inventing requirements.

## Run locally

From the project folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly will not work because browsers block local CSV requests.

## Test

```bash
npm test
```

The test checks the row count, standard-form handling, parent references, single and branching evolution links, stat totals, a complete three-stage chain, and all local page assets.

## Publish with GitHub Pages

1. Create a public GitHub repository and add these files to its root.
2. Push the default branch to GitHub.
3. Open **Settings → Pages** in the repository.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the default branch and `/ (root)`, then save.
6. Add the resulting website and repository URLs to `SUBMISSION.md`.

## Data and artwork

- Pokemon attributes and evolution links: supplied `pokemon.csv`.
- Artwork: [PokeAPI sprites repository](https://github.com/PokeAPI/sprites), loaded by Pokemon/form ID with lower-resolution and base-species fallbacks.

Pokemon names and artwork belong to their respective rights holders. This project is an educational case solution.
