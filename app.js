const DATA_URL = "./pokemon.csv";
const SPRITE_ROOT = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

export const STAT_FIELDS = [
  ["hp", "HP"],
  ["attack", "Attack"],
  ["defense", "Defense"],
  ["special_attack", "Sp. Atk"],
  ["special_defense", "Sp. Def"],
  ["speed", "Speed"],
];

const NUMERIC_FIELDS = new Set([
  "id",
  "species_id",
  "height",
  "weight",
  "base_experience",
  "attack",
  "defense",
  "hp",
  "special_attack",
  "special_defense",
  "speed",
  "generation_id",
  "evolves_from_species_id",
  "evolution_chain_id",
  "shape_id",
]);

const TYPE_COLORS = {
  normal: "#A8A878",
  fire: "#F08030",
  water: "#6890F0",
  electric: "#F8D030",
  grass: "#78C850",
  ice: "#98D8D8",
  fighting: "#C03028",
  poison: "#A040A0",
  ground: "#E0C068",
  flying: "#A890F0",
  psychic: "#F85888",
  bug: "#A8B820",
  rock: "#B8A038",
  ghost: "#705898",
  dragon: "#7038F8",
  dark: "#705848",
  steel: "#B8B8D0",
  fairy: "#EE99AC",
};

const PRIORITY_LABELS = {
  balanced: "balanced",
  offense: "offense-first",
  defense: "defensive",
  speed: "speed-first",
};

const state = {
  rows: [],
  index: null,
  current: null,
  priority: "balanced",
  selectedEvolutionId: null,
  searchMatches: [],
  activeSearchIndex: -1,
};

/** Parse an RFC 4180-style CSV string without external dependencies. */
export function parseCsv(text) {
  const matrix = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some((cell) => cell !== "")) matrix.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value !== "" || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    matrix.push(row);
  }

  const [headers = [], ...dataRows] = matrix;
  return dataRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
}

export function normalisePokemon(raw) {
  const pokemon = {};
  for (const [key, rawValue] of Object.entries(raw)) {
    const value = rawValue === "NA" || rawValue === "" ? null : rawValue;
    pokemon[key] = NUMERIC_FIELDS.has(key) && value !== null ? Number(value) : value;
  }
  return pokemon;
}

export function buildEvolutionIndex(rows) {
  const standardRows = rows.filter((pokemon) => pokemon.id === pokemon.species_id);
  const byId = new Map(rows.map((pokemon) => [pokemon.id, pokemon]));
  const byName = new Map(rows.map((pokemon) => [pokemon.pokemon.toLowerCase(), pokemon]));
  const bySpecies = new Map(standardRows.map((pokemon) => [pokemon.species_id, pokemon]));
  const children = new Map();
  const parent = new Map();

  for (const pokemon of standardRows) {
    const parentId = pokemon.evolves_from_species_id;
    if (parentId === null || !bySpecies.has(parentId)) continue;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(pokemon);
    parent.set(pokemon.species_id, bySpecies.get(parentId));
  }

  for (const evolutions of children.values()) {
    evolutions.sort((a, b) => formatPokemonName(a.pokemon).localeCompare(formatPokemonName(b.pokemon)));
  }

  return { byId, byName, bySpecies, children, parent, standardRows };
}

export function getDirectEvolutions(pokemon, evolutionIndex) {
  if (!pokemon || pokemon.id !== pokemon.species_id) return [];
  return evolutionIndex.children.get(pokemon.species_id) ?? [];
}

export function totalStats(pokemon) {
  return STAT_FIELDS.reduce((sum, [field]) => sum + (pokemon?.[field] ?? 0), 0);
}

export function scorePokemon(pokemon, priority = "balanced") {
  if (priority === "offense") return pokemon.attack + pokemon.special_attack;
  if (priority === "defense") return pokemon.hp + pokemon.defense + pokemon.special_defense;
  if (priority === "speed") return pokemon.speed;
  return totalStats(pokemon);
}

export function chooseBestEvolution(evolutions, priority = "balanced") {
  return [...evolutions].sort((a, b) => {
    const scoreDifference = scorePokemon(b, priority) - scorePokemon(a, priority);
    if (scoreDifference !== 0) return scoreDifference;
    const totalDifference = totalStats(b) - totalStats(a);
    if (totalDifference !== 0) return totalDifference;
    return formatPokemonName(a.pokemon).localeCompare(formatPokemonName(b.pokemon));
  })[0] ?? null;
}

export function getEvolutionLevels(pokemon, evolutionIndex) {
  const standardPokemon = evolutionIndex.bySpecies.get(pokemon.species_id) ?? pokemon;
  if (standardPokemon.evolution_chain_id === null) return [[standardPokemon]];

  const members = evolutionIndex.standardRows.filter(
    (candidate) => candidate.evolution_chain_id === standardPokemon.evolution_chain_id,
  );
  const levels = new Map();

  for (const member of members) {
    let depth = 0;
    let cursor = member;
    const visited = new Set();
    while (evolutionIndex.parent.has(cursor.species_id) && !visited.has(cursor.species_id)) {
      visited.add(cursor.species_id);
      cursor = evolutionIndex.parent.get(cursor.species_id);
      depth += 1;
    }
    if (!levels.has(depth)) levels.set(depth, []);
    levels.get(depth).push(member);
  }

  return [...levels.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, level]) =>
      level.sort((a, b) => formatPokemonName(a.pokemon).localeCompare(formatPokemonName(b.pokemon))),
    );
}

export function formatPokemonName(name) {
  if (!name) return "Unknown";
  if (name === "nidoran-f") return "Nidoran ♀";
  if (name === "nidoran-m") return "Nidoran ♂";
  if (name === "mr-mime") return "Mr. Mime";
  if (name === "mime-jr") return "Mime Jr.";
  if (name === "farfetchd") return "Farfetch'd";
  if (name === "ho-oh") return "Ho-Oh";
  if (name === "porygon-z") return "Porygon-Z";
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAbility(name) {
  return formatPokemonName(name).replace("Mr. ", "Mr ");
}

function generationLabel(generation) {
  const numerals = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  return generation ? `Generation ${numerals[generation] ?? generation}` : "Generation unknown";
}

function paddedDexNumber(pokemon) {
  return `#${String(pokemon.species_id).padStart(3, "0")}`;
}

function typeBadges(pokemon) {
  return [pokemon.type_1, pokemon.type_2]
    .filter(Boolean)
    .map(
      (type) =>
        `<span class="type-badge" style="--type-color:${TYPE_COLORS[type] ?? "#64748B"}">${escapeHtml(type)}</span>`,
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function imageCandidates(pokemon) {
  const candidates = [
    `${SPRITE_ROOT}/other/official-artwork/${pokemon.id}.png`,
    `${SPRITE_ROOT}/other/home/${pokemon.id}.png`,
    `${SPRITE_ROOT}/${pokemon.id}.png`,
  ];

  if (pokemon.id !== pokemon.species_id) {
    candidates.push(
      `${SPRITE_ROOT}/other/official-artwork/${pokemon.species_id}.png`,
      `${SPRITE_ROOT}/${pokemon.species_id}.png`,
    );
  }
  candidates.push("./placeholder.svg");
  return [...new Set(candidates)];
}

function setPokemonImage(image, pokemon, altText = `${formatPokemonName(pokemon.pokemon)} artwork`) {
  image.alt = altText;
  image.dataset.fallbackIndex = "0";
  image.__fallbacks = imageCandidates(pokemon);
  image.onerror = () => {
    const nextIndex = Number(image.dataset.fallbackIndex) + 1;
    image.dataset.fallbackIndex = String(nextIndex);
    image.src = image.__fallbacks[nextIndex] ?? "./placeholder.svg";
  };
  image.src = image.__fallbacks[0];
}

function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex ?? "");
  return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : [120, 200, 80];
}

function applyTheme(pokemon) {
  const primary = pokemon.color_1 ?? TYPE_COLORS[pokemon.type_1] ?? "#78C850";
  const secondary = pokemon.color_2 ?? TYPE_COLORS[pokemon.type_2] ?? primary;
  document.documentElement.style.setProperty("--accent", primary);
  document.documentElement.style.setProperty("--accent-2", secondary);
  document.documentElement.style.setProperty("--accent-rgb", hexToRgb(primary).join(", "));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", primary);
}

function statDifferences(current, next) {
  return STAT_FIELDS.map(([field, label]) => ({
    field,
    label,
    current: current[field],
    next: next ? next[field] : null,
    difference: next ? next[field] - current[field] : null,
  }));
}

function recommendationFor(pokemon, evolutionIndex, priority, selectedId = null) {
  const standardForm = pokemon.id === pokemon.species_id;
  const baseForm = evolutionIndex.bySpecies.get(pokemon.species_id) ?? null;

  if (!standardForm) {
    return {
      status: "special",
      badge: "Special form",
      icon: "◇",
      title: "Treat this form as-is.",
      copy: `${formatPokemonName(pokemon.pokemon)} is stored as an alternate form, not a standard step in its species' evolution chain. Its stats can still be inspected, but a normal next evolution is not inferred.`,
      note: "Alternate and Mega forms are separated from standard evolution links to avoid recommending an invalid evolution.",
      evolutions: [],
      selected: null,
      baseForm,
    };
  }

  const evolutions = getDirectEvolutions(pokemon, evolutionIndex);
  if (evolutions.length === 0) {
    return {
      status: "final",
      badge: "Keep it",
      icon: "—",
      title: "No further evolution.",
      copy: `${formatPokemonName(pokemon.pokemon)} is the final standard stage recorded in this dataset. There is no next evolution to compare, so keep training this form.`,
      note: "Regional, temporary, Mega, and game-specific transformations are not treated as standard evolutions.",
      evolutions,
      selected: null,
      baseForm,
    };
  }

  const preferred = chooseBestEvolution(evolutions, priority);
  const selected = evolutions.find((candidate) => candidate.id === selectedId) ?? preferred;
  const currentTotal = totalStats(pokemon);
  const selectedTotal = totalStats(selected);
  const gain = selectedTotal - currentTotal;
  const improvements = statDifferences(pokemon, selected)
    .filter((stat) => stat.difference > 0)
    .sort((a, b) => b.difference - a.difference);
  const topGain = improvements
    .slice(0, 2)
    .map((stat) => `${stat.label} +${stat.difference}`)
    .join(" and ");
  const branchText =
    evolutions.length > 1
      ? `${formatPokemonName(selected.pokemon)} is the strongest ${PRIORITY_LABELS[priority]} match among ${evolutions.length} paths. `
      : "";

  return {
    status: evolutions.length > 1 ? "branch" : "evolve",
    badge: evolutions.length > 1 ? "Choose & evolve" : "Evolve",
    icon: "↑",
    title:
      evolutions.length > 1
        ? `Yes — ${formatPokemonName(selected.pokemon)} fits your plan.`
        : `Yes — evolve into ${formatPokemonName(selected.pokemon)}.`,
    copy: `${branchText}Total base stats move from ${currentTotal} to ${selectedTotal} (${gain >= 0 ? "+" : ""}${gain}).${topGain ? ` The biggest gains are ${topGain}.` : ""}`,
    note: "This recommendation compares base stats and evolution links only. Check your game's level, item, move, friendship, and timing requirements before evolving.",
    evolutions,
    selected,
    preferred,
    baseForm,
  };
}

function renderCurrent(pokemon) {
  document.getElementById("current-number").textContent = paddedDexNumber(pokemon);
  document.getElementById("current-name").textContent = formatPokemonName(pokemon.pokemon);
  document.getElementById("current-subtitle").textContent = `${generationLabel(pokemon.generation_id)} · ${pokemon.shape ?? "unknown shape"}`;
  document.getElementById("current-types").innerHTML = typeBadges(pokemon);
  setPokemonImage(document.getElementById("current-image"), pokemon);

  const facts = [
    ["Height", pokemon.height !== null ? `${(pokemon.height / 10).toFixed(1)} m` : "—"],
    ["Weight", pokemon.weight !== null ? `${(pokemon.weight / 10).toFixed(1)} kg` : "—"],
    ["Base XP", pokemon.base_experience ?? "—"],
  ];
  document.getElementById("current-facts").innerHTML = facts
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");

  const abilities = [pokemon.ability_1, pokemon.ability_2].filter(Boolean);
  const hiddenAbility = pokemon.ability_hidden;
  document.getElementById("current-abilities").innerHTML = `
    <span>Abilities</span>
    <div class="ability-list">
      ${abilities.map((ability) => `<span class="ability-chip">${escapeHtml(formatAbility(ability))}</span>`).join("")}
      ${hiddenAbility ? `<span class="ability-chip hidden-ability" title="Hidden ability">${escapeHtml(formatAbility(hiddenAbility))}</span>` : ""}
    </div>`;
}

function renderRecommendation(pokemon, model) {
  const badge = document.getElementById("verdict-badge");
  badge.textContent = model.badge;
  badge.className = `verdict-badge is-${model.status}`;
  document.getElementById("verdict-icon").textContent = model.icon;
  document.getElementById("recommendation-title").textContent = model.title;
  document.getElementById("recommendation-copy").textContent = model.copy;
  document.getElementById("method-note").textContent = model.note;

  let metrics;
  if (model.selected) {
    const currentTotal = totalStats(pokemon);
    const nextTotal = totalStats(model.selected);
    metrics = [
      ["Current BST", currentTotal, ""],
      ["Next BST", nextTotal, ""],
      ["Total gain", `${nextTotal - currentTotal >= 0 ? "+" : ""}${nextTotal - currentTotal}`, "is-positive"],
    ];
  } else {
    metrics = [
      ["Base stat total", totalStats(pokemon), ""],
      ["Stage", model.status === "special" ? "Alternate" : "Final", ""],
      ["Generation", generationLabel(pokemon.generation_id).replace("Generation ", "Gen "), ""],
    ];
  }
  document.getElementById("metric-grid").innerHTML = metrics
    .map(
      ([label, value, className]) => `
        <div class="metric">
          <span class="metric-label">${escapeHtml(label)}</span>
          <strong class="metric-value ${className}">${escapeHtml(value)}</strong>
        </div>`,
    )
    .join("");
}

function renderEvolutionOptions(pokemon, model) {
  const options = document.getElementById("evolution-options");
  const count = document.getElementById("option-count");
  const intro = document.getElementById("option-intro");

  if (model.evolutions.length > 0) {
    count.textContent = `${model.evolutions.length} ${model.evolutions.length === 1 ? "path" : "paths"}`;
    intro.textContent =
      model.evolutions.length === 1
        ? "One direct evolution is recorded."
        : `Ranked for your ${PRIORITY_LABELS[state.priority]} preference. Select a path to compare.`;
    options.innerHTML = model.evolutions
      .map((candidate) => {
        const selected = model.selected?.id === candidate.id;
        const preferred = model.preferred?.id === candidate.id;
        const gain = totalStats(candidate) - totalStats(pokemon);
        return `
          <button class="evolution-option ${selected ? "is-selected" : ""}" type="button" data-evolution-id="${candidate.id}" aria-pressed="${selected}">
            <span class="option-art"><img data-pokemon-id="${candidate.id}" alt="" width="64" height="64" /></span>
            <span class="option-info">
              <span class="option-name">${escapeHtml(formatPokemonName(candidate.pokemon))}</span>
              <span class="option-types">${typeBadges(candidate)}</span>
              ${preferred && model.evolutions.length > 1 ? '<span class="best-match">Best match</span>' : ""}
            </span>
            <span class="option-score"><strong>${totalStats(candidate)}</strong><span>${gain >= 0 ? "+" : ""}${gain} BST</span></span>
          </button>`;
      })
      .join("");

    options.querySelectorAll("img[data-pokemon-id]").forEach((image) => {
      const candidate = state.index.byId.get(Number(image.dataset.pokemonId));
      setPokemonImage(image, candidate, "");
    });
    options.querySelectorAll("[data-evolution-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedEvolutionId = Number(button.dataset.evolutionId);
        renderAll();
      });
    });
    return;
  }

  count.textContent = "0 paths";
  if (model.status === "special") {
    intro.textContent = "Alternate forms are analysed outside the standard chain.";
    const baseName = model.baseForm ? formatPokemonName(model.baseForm.pokemon) : "base species";
    options.innerHTML = `
      <div class="empty-option">
        <div>
          <span class="empty-symbol">◇</span>
          <h3>Special form</h3>
          <p>This form has no standard next-stage link in the supplied data.</p>
          ${model.baseForm ? `<button class="secondary-button" type="button" data-view-base="${model.baseForm.id}">View ${escapeHtml(baseName)}</button>` : ""}
        </div>
      </div>`;
    options.querySelector("[data-view-base]")?.addEventListener("click", (event) => {
      selectPokemon(state.index.byId.get(Number(event.currentTarget.dataset.viewBase)));
    });
  } else {
    intro.textContent = "This is the end of the standard evolution chain.";
    options.innerHTML = `
      <div class="empty-option">
        <div>
          <span class="empty-symbol">✓</span>
          <h3>Final form reached</h3>
          <p>There is no direct evolution after ${escapeHtml(formatPokemonName(pokemon.pokemon))} in this dataset.</p>
        </div>
      </div>`;
  }
}

function renderStats(pokemon, nextPokemon) {
  const legend = document.getElementById("chart-legend");
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch"></span>${escapeHtml(formatPokemonName(pokemon.pokemon))}</span>
    ${nextPokemon ? `<span class="legend-item"><span class="legend-swatch is-next"></span>${escapeHtml(formatPokemonName(nextPokemon.pokemon))}</span>` : ""}`;

  document.getElementById("stats-chart").innerHTML = statDifferences(pokemon, nextPokemon)
    .map((stat) => {
      const differenceClass = stat.difference > 0 ? "is-up" : stat.difference < 0 ? "is-down" : "";
      return `
        <div class="stat-row">
          <span class="stat-label">${stat.label}</span>
          <div class="bar-pair" aria-label="${stat.label}: ${stat.current}${nextPokemon ? ` compared with ${stat.next}` : ""}">
            <div class="bar-track"><span class="bar-fill" style="--bar-width:${Math.min(100, (stat.current / 255) * 100)}%"></span></div>
            ${nextPokemon ? `<div class="bar-track"><span class="bar-fill is-next" style="--bar-width:${Math.min(100, (stat.next / 255) * 100)}%"></span></div>` : ""}
          </div>
          <div class="stat-values">
            <span>${stat.current}</span>
            ${nextPokemon ? `<span class="next-value">${stat.next}</span><span class="stat-delta ${differenceClass}">${stat.difference > 0 ? "+" : ""}${stat.difference}</span>` : ""}
          </div>
        </div>`;
    })
    .join("");
}

function renderChanges(pokemon, nextPokemon, model) {
  const list = document.getElementById("change-list");
  if (!nextPokemon) {
    const items = [
      ["Σ", "Base stat total", "Combined value across all six base stats", totalStats(pokemon)],
      ["◆", "Primary type", "The Pokemon's first listed type", formatPokemonName(pokemon.type_1)],
      ["◎", "Evolution status", "Standard evolution position", model.status === "special" ? "Special form" : "Final stage"],
      ["↗", "Strongest stat", "Highest base-stat category", strongestStat(pokemon)],
    ];
    list.innerHTML = items
      .map(
        ([icon, title, detail, value]) => `
          <div class="change-item">
            <span class="change-icon">${icon}</span>
            <span class="change-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></span>
            <span class="change-value is-neutral">${escapeHtml(value)}</span>
          </div>`,
      )
      .join("");
    return;
  }

  const differences = statDifferences(pokemon, nextPokemon).sort(
    (a, b) => Math.abs(b.difference) - Math.abs(a.difference),
  );
  const typeChanges = [nextPokemon.type_1, nextPokemon.type_2]
    .filter(Boolean)
    .filter((type) => ![pokemon.type_1, pokemon.type_2].includes(type));
  const items = [
    ["Σ", "Total power", "Change in base stat total", totalStats(nextPokemon) - totalStats(pokemon)],
    ["↑", differences[0].label, "Largest absolute stat change", differences[0].difference],
    ["◇", "Type profile", "New type added after evolution", typeChanges.length ? formatPokemonName(typeChanges.join(" / ")) : "Unchanged"],
    ["↗", "Strongest stat", `Highest stat as ${formatPokemonName(nextPokemon.pokemon)}`, strongestStat(nextPokemon)],
  ];

  list.innerHTML = items
    .map(([icon, title, detail, value], index) => {
      const numeric = typeof value === "number";
      const className = numeric ? (value > 0 ? "" : value < 0 ? "is-down" : "is-neutral") : "is-neutral";
      const shownValue = numeric && value > 0 ? `+${value}` : value;
      return `
        <div class="change-item">
          <span class="change-icon">${icon}</span>
          <span class="change-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></span>
          <span class="change-value ${className}">${escapeHtml(shownValue)}</span>
        </div>`;
    })
    .join("");
}

function strongestStat(pokemon) {
  const [field, label] = [...STAT_FIELDS].sort((a, b) => pokemon[b[0]] - pokemon[a[0]])[0];
  return `${label} ${pokemon[field]}`;
}

function renderEvolutionChain(pokemon) {
  const levels = getEvolutionLevels(pokemon, state.index);
  const chain = document.getElementById("evolution-chain");
  chain.innerHTML = levels
    .map(
      (level, levelIndex) => `${levelIndex > 0 ? '<span class="chain-arrow" aria-hidden="true">→</span>' : ""}
        <div class="chain-level">
          ${level
            .map(
              (member) => `
                <button class="chain-node ${member.species_id === pokemon.species_id ? "is-current" : ""}" type="button" data-chain-id="${member.id}" aria-label="Analyse ${escapeHtml(formatPokemonName(member.pokemon))}">
                  <img data-pokemon-id="${member.id}" alt="" width="44" height="44" />
                  <span><strong>${escapeHtml(formatPokemonName(member.pokemon))}</strong><span>${paddedDexNumber(member)} · BST ${totalStats(member)}</span></span>
                </button>`,
            )
            .join("")}
        </div>`,
    )
    .join("");

  chain.querySelectorAll("img[data-pokemon-id]").forEach((image) => {
    setPokemonImage(image, state.index.byId.get(Number(image.dataset.pokemonId)), "");
  });
  chain.querySelectorAll("[data-chain-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectPokemon(state.index.byId.get(Number(button.dataset.chainId)));
      document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderAll() {
  const pokemon = state.current;
  if (!pokemon) return;
  applyTheme(pokemon);
  const model = recommendationFor(
    pokemon,
    state.index,
    state.priority,
    state.selectedEvolutionId,
  );
  if (model.selected) state.selectedEvolutionId = model.selected.id;

  renderCurrent(pokemon);
  renderRecommendation(pokemon, model);
  renderEvolutionOptions(pokemon, model);
  renderStats(pokemon, model.selected);
  renderChanges(pokemon, model.selected, model);
  renderEvolutionChain(pokemon);
  document.title = `${formatPokemonName(pokemon.pokemon)} evolution advice — EvoLens`;
}

function selectPokemon(pokemon, { updateUrl = true } = {}) {
  if (!pokemon) return;
  state.current = pokemon;
  state.selectedEvolutionId = null;
  state.activeSearchIndex = -1;
  const input = document.getElementById("pokemon-search");
  input.value = formatPokemonName(pokemon.pokemon);
  closeSearchResults();
  renderAll();

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("pokemon", pokemon.pokemon);
    window.history.replaceState({}, "", url);
  }
}

function findPokemon(query) {
  const cleaned = query.trim().toLowerCase().replace(/^#/, "");
  if (!cleaned) return [];
  const nameQuery = cleaned.replaceAll(" ", "-");
  return [...state.rows]
    .map((pokemon) => {
      const name = pokemon.pokemon.toLowerCase();
      let rank = 4;
      if (name === nameQuery || String(pokemon.id) === cleaned || String(pokemon.species_id) === cleaned) rank = 0;
      else if (name.startsWith(nameQuery)) rank = 1;
      else if (name.includes(nameQuery)) rank = 2;
      else if (formatPokemonName(name).toLowerCase().includes(cleaned)) rank = 3;
      return { pokemon, rank };
    })
    .filter((match) => match.rank < 4)
    .sort((a, b) => a.rank - b.rank || a.pokemon.species_id - b.pokemon.species_id || a.pokemon.id - b.pokemon.id)
    .slice(0, 8)
    .map((match) => match.pokemon);
}

function renderSearchResults(matches) {
  const list = document.getElementById("search-results");
  const input = document.getElementById("pokemon-search");
  state.searchMatches = matches;
  state.activeSearchIndex = Math.min(state.activeSearchIndex, matches.length - 1);

  if (matches.length === 0) {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    return;
  }

  list.innerHTML = matches
    .map(
      (pokemon, index) => `
        <li id="search-option-${index}" role="option" data-result-id="${pokemon.id}" aria-selected="${state.activeSearchIndex === index}" class="${state.activeSearchIndex === index ? "is-active" : ""}">
          <img class="result-thumb" data-pokemon-id="${pokemon.id}" alt="" width="40" height="40" />
          <span class="result-name">${escapeHtml(formatPokemonName(pokemon.pokemon))}<span class="result-meta">${escapeHtml([pokemon.type_1, pokemon.type_2].filter(Boolean).join(" / "))}</span></span>
          <span class="result-dex">${paddedDexNumber(pokemon)}</span>
        </li>`,
    )
    .join("");
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  if (state.activeSearchIndex >= 0) {
    input.setAttribute("aria-activedescendant", `search-option-${state.activeSearchIndex}`);
  } else {
    input.removeAttribute("aria-activedescendant");
  }

  list.querySelectorAll("img[data-pokemon-id]").forEach((image) => {
    setPokemonImage(image, state.index.byId.get(Number(image.dataset.pokemonId)), "");
  });
}

function closeSearchResults() {
  const list = document.getElementById("search-results");
  const input = document.getElementById("pokemon-search");
  list.hidden = true;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
}

function setupInteractions() {
  const input = document.getElementById("pokemon-search");
  const list = document.getElementById("search-results");
  const form = document.getElementById("search-form");

  input.addEventListener("input", () => {
    state.activeSearchIndex = -1;
    renderSearchResults(findPokemon(input.value));
  });

  input.addEventListener("focus", () => {
    if (input.value.trim()) renderSearchResults(findPokemon(input.value));
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const count = state.searchMatches.length;
      if (!count) return;
      state.activeSearchIndex = (state.activeSearchIndex + direction + count) % count;
      renderSearchResults(state.searchMatches);
      document.getElementById(`search-option-${state.activeSearchIndex}`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Escape") {
      closeSearchResults();
    } else if (event.key === "Enter" && state.activeSearchIndex >= 0) {
      event.preventDefault();
      selectPokemon(state.searchMatches[state.activeSearchIndex]);
    }
  });

  list.addEventListener("mousedown", (event) => {
    const option = event.target.closest("[data-result-id]");
    if (!option) return;
    event.preventDefault();
    selectPokemon(state.index.byId.get(Number(option.dataset.resultId)));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const [match] = findPokemon(input.value);
    if (match) selectPokemon(match);
    else {
      input.setCustomValidity("Choose a Pokemon from the search results.");
      input.reportValidity();
      window.setTimeout(() => input.setCustomValidity(""), 1500);
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-form")) closeSearchResults();
  });

  document.getElementById("random-button").addEventListener("click", () => {
    const choices = state.index.standardRows;
    selectPokemon(choices[Math.floor(Math.random() * choices.length)]);
  });

  document.querySelectorAll('input[name="priority"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.priority = radio.value;
      state.selectedEvolutionId = null;
      renderAll();
    });
  });
}

async function initialise() {
  setupInteractions();
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Pokemon CSV request failed with ${response.status}`);
    const csv = await response.text();
    state.rows = parseCsv(csv).map(normalisePokemon);
    state.index = buildEvolutionIndex(state.rows);

    document.getElementById("loading-state").hidden = true;
    document.getElementById("results").hidden = false;
    const dataPill = document.getElementById("data-pill");
    dataPill.classList.add("is-ready");
    dataPill.lastChild.textContent = ` ${state.index.standardRows.length} species · ${state.rows.length} forms`;

    const requested = new URL(window.location.href).searchParams.get("pokemon")?.toLowerCase();
    const initialPokemon = state.index.byName.get(requested) ?? state.index.byName.get("bulbasaur");
    selectPokemon(initialPokemon, { updateUrl: Boolean(requested) });
  } catch (error) {
    console.error(error);
    document.getElementById("loading-state").hidden = true;
    document.getElementById("error-state").hidden = false;
    document.getElementById("data-pill").lastChild.textContent = " Data unavailable";
  }
}

if (typeof document !== "undefined") {
  initialise();
}
