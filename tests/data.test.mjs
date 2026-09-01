import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  buildEvolutionIndex,
  chooseBestEvolution,
  getDirectEvolutions,
  getEvolutionLevels,
  normalisePokemon,
  parseCsv,
  totalStats,
} from "../app.js";

const csv = await fs.readFile(new URL("../pokemon.csv", import.meta.url), "utf8");
const rows = parseCsv(csv).map(normalisePokemon);
const index = buildEvolutionIndex(rows);
const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");

assert.equal(rows.length, 811, "all CSV rows should load");
assert.equal(index.standardRows.length, 721, "alternate forms should be separated from standard species");
assert.ok(
  rows.every((pokemon) => Number.isFinite(totalStats(pokemon))),
  "every Pokemon should have a valid base-stat total",
);
assert.ok(
  index.standardRows.every(
    (pokemon) =>
      pokemon.evolves_from_species_id === null || index.bySpecies.has(pokemon.evolves_from_species_id),
  ),
  "every standard evolution should reference a species in the dataset",
);

const bulbasaur = index.byName.get("bulbasaur");
const bulbasaurOptions = getDirectEvolutions(bulbasaur, index);
assert.deepEqual(bulbasaurOptions.map((pokemon) => pokemon.pokemon), ["ivysaur"]);
assert.equal(totalStats(bulbasaur), 318);
assert.equal(totalStats(bulbasaurOptions[0]), 405);

const eeveeOptions = getDirectEvolutions(index.byName.get("eevee"), index);
assert.equal(eeveeOptions.length, 8, "Eevee should expose all eight branches in this dataset");
assert.equal(chooseBestEvolution(eeveeOptions, "speed").pokemon, "jolteon");

assert.equal(getDirectEvolutions(index.byName.get("charizard"), index).length, 0);
assert.equal(
  getDirectEvolutions(index.byName.get("pikachu-rock-star"), index).length,
  0,
  "alternate forms must not inherit a base species evolution",
);

const bulbasaurLevels = getEvolutionLevels(bulbasaur, index);
assert.deepEqual(
  bulbasaurLevels.map((level) => level.map((pokemon) => pokemon.pokemon)),
  [["bulbasaur"], ["ivysaur"], ["venusaur"]],
);

const localAssets = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((source) => !source.startsWith("http") && !source.startsWith("#") && source !== "./");
for (const asset of localAssets) {
  await fs.access(new URL(`../${asset.replace(/^\.\//, "")}`, import.meta.url));
}

console.log("All project tests passed.");
