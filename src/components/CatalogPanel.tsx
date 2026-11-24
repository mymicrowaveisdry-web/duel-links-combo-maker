import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { emptyFilters, filterCards, indexCards } from "../data/catalog";
import type { CardDefinition, Catalog, CardFilters } from "../data/catalog";
import { monsterKinds } from "../data/catalog-schema.mjs";
import { CatalogRow } from "./cards";

const pageSize = 30;
const categories = ["Monster", "Spell", "Trap", "Token"] as const;
export type CatalogState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; value: Catalog };
const noCards: CardDefinition[] = [];

export function CatalogPanel({
  data,
  selectedId,
  onSelect,
  onRetry,
  active,
}: {
  data: CatalogState;
  selectedId?: number;
  onSelect: (card: CardDefinition) => void;
  onRetry: () => void;
  active: boolean;
}) {
  const [filters, setFilters] = useState(emptyFilters);
  const [filtersOpen, toggleFilters] = useState(false);
  const [page, setPage] = useState(0);
  const cards = data.status === "ready" ? data.value.cards : noCards;
  const index = useMemo(() => indexCards(cards), [cards]);
  const deferredFilters = useDeferredValue(filters);
  const results = useMemo(
    () => filterCards(index, deferredFilters),
    [index, deferredFilters],
  );
  const attributes = useMemo(
    () =>
      [
        ...new Set(
          cards.flatMap((card) => (card.attribute ? [card.attribute] : [])),
        ),
      ].sort(),
    [cards],
  );
  const archetypes = useMemo(
    () =>
      [
        ...new Set(
          cards.flatMap((card) => (card.archetype ? [card.archetype] : [])),
        ),
      ].sort(),
    [cards],
  );
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const current = Math.min(page, totalPages - 1);
  const pageRows = results.slice(current * pageSize, (current + 1) * pageSize);

  function update<Key extends keyof CardFilters>(
    key: Key,
    value: CardFilters[Key],
  ) {
    setFilters((existing) => ({ ...existing, [key]: value }));
    setPage(0);
  }

  return (
    <section
      className={`panel catalog-panel ${active ? "mobile-active" : ""}`}
      aria-labelledby="catalog-title"
    >
      <div className="panel-heading">
        <h2 id="catalog-title" tabIndex={-1}>
          Card Browser
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Card filters"
          aria-expanded={filtersOpen}
          onClick={() => toggleFilters(!filtersOpen)}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="catalog-controls">
        <label className="search-box">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search cards</span>
          <input
            type="search"
            name="card-search"
            autoComplete="off"
            placeholder="Search cards…"
            value={filters.query}
            onChange={(event) => update("query", event.target.value)}
          />
        </label>
        <div
          className="category-filters"
          role="group"
          aria-label="Card category"
        >
          <button
            type="button"
            aria-pressed={!filters.category}
            onClick={() => update("category", "")}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              type="button"
              key={category}
              aria-pressed={filters.category === category}
              onClick={() => update("category", category)}
            >
              {category}
            </button>
          ))}
        </div>
        {filtersOpen && (
          <div className="filter-grid">
            <label>
              Monster type
              <select
                name="monster-kind"
                value={filters.kind}
                onChange={(event) => update("kind", event.target.value)}
              >
                <option value="">Any type</option>
                {monsterKinds.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <label>
              Attribute
              <select
                name="card-attribute"
                value={filters.attribute}
                onChange={(event) => update("attribute", event.target.value)}
              >
                <option value="">Any attribute</option>
                {attributes.map((attribute) => (
                  <option key={attribute}>{attribute}</option>
                ))}
              </select>
            </label>
            <label className="wide-field">
              Archetype
              <select
                name="card-archetype"
                value={filters.archetype}
                onChange={(event) => update("archetype", event.target.value)}
              >
                <option value="">Any archetype</option>
                {archetypes.map((archetype) => (
                  <option key={archetype}>{archetype}</option>
                ))}
              </select>
            </label>
            <label>
              Level / Rank / Link
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="13"
                name="card-rating"
                value={filters.rating}
                onChange={(event) => update("rating", event.target.value)}
              />
            </label>
            <label>
              Minimum ATK
              <input
                type="number"
                inputMode="numeric"
                min="0"
                name="minimum-atk"
                value={filters.minimumAttack}
                onChange={(event) =>
                  update("minimumAttack", event.target.value)
                }
              />
            </label>
            <label>
              Minimum DEF
              <input
                type="number"
                inputMode="numeric"
                min="0"
                name="minimum-def"
                value={filters.minimumDefense}
                onChange={(event) =>
                  update("minimumDefense", event.target.value)
                }
              />
            </label>
            <button
              type="button"
              className="subtle-button"
              onClick={() => {
                setFilters(emptyFilters);
                setPage(0);
              }}
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>
      {data.status === "loading" && (
        <p className="panel-message" role="status">
          Loading card catalog…
        </p>
      )}
      {data.status === "error" && (
        <div className="panel-message" role="alert">
          <p>The local catalog couldn’t load.</p>
          <button type="button" onClick={onRetry}>
            Retry Catalog
          </button>
        </div>
      )}
      {data.status === "ready" && (
        <>
          <p className="results-count" role="status">
            {results.length.toLocaleString("en")} cards
          </p>
          <div className="card-results" key={current}>
            {pageRows.map((card) => (
              <CatalogRow
                key={card.id}
                card={card}
                selected={selectedId === card.id}
                onSelect={() => onSelect(card)}
              />
            ))}
            {!results.length && (
              <p className="panel-message">
                No cards match. Adjust your search or filters.
              </p>
            )}
          </div>
          {totalPages > 1 && (
            <div
              className="pagination"
              role="group"
              aria-label="Catalog pagination"
            >
              <button
                type="button"
                className="icon-button"
                aria-label="Previous page"
                disabled={!current}
                onClick={() => setPage(current - 1)}
              >
                <ChevronLeft size={17} aria-hidden="true" />
              </button>
              <span aria-live="polite">
                {current + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Next page"
                disabled={current + 1 >= totalPages}
                onClick={() => setPage(current + 1)}
              >
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
