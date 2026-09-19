/**
 * Favorite Models Extension
 *
 * Cycle through a configurable list of "favorite" models with hotkeys.
 * This is useful when you have many `enabledModels` but want quick access
 * to a small hand-picked subset.
 *
 * Config files (merged, project takes precedence over global):
 * - ~/.pi/agent/favorite-models.json   (global)
 * - <cwd>/.pi/favorite-models.json     (project-local)
 *
 * Example config:
 * ```json
 * {
 *   "favorites": [
 *     "opencode-go/deepseek-v4-pro",
 *     { "provider": "openrouter", "model": "anthropic/claude-fable-5" }
 *   ],
 *   "cycleForwardKey": "ctrl+shift+m",
 *   "cycleBackwardKey": "ctrl+alt+m"
 * }
 * ```
 *
 * Each favorite can be a string "provider/modelId" (split on the FIRST slash,
 * so model ids that themselves contain slashes work too) or an explicit
 * { "provider": ..., "model": ... } object.
 *
 * Hotkeys:
 * - cycleForwardKey  (default ctrl+p)      -> next favorite
 * - cycleBackwardKey (default ctrl+alt+m)  -> previous favorite
 *
 * Command:
 * - /favorite-models -> select any available model; press f to toggle favorite
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, DynamicBorder, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Container, Key, SelectList, Text, matchesKey, type SelectItem } from "@earendil-works/pi-tui";

interface FavoriteEntry {
  provider: string;
  model: string;
}

interface FavoritesConfig {
  favorites?: Array<string | FavoriteEntry>;
  cycleForwardKey?: string;
  cycleBackwardKey?: string;
}

const DEFAULT_FORWARD_KEY = "ctrl+shift+m";
const DEFAULT_BACKWARD_KEY = "ctrl+alt+m";

/**
 * Parse a favorite entry (string "provider/modelId" or { provider, model } object).
 * Splits the string on the FIRST slash so model ids like "openai/gpt-5.6-sol"
 * keep their slash.
 */
function parseFavorite(entry: string | FavoriteEntry): FavoriteEntry | null {
  if (typeof entry === "string") {
    const idx = entry.indexOf("/");
    if (idx <= 0 || idx === entry.length - 1) return null;
    return { provider: entry.slice(0, idx), model: entry.slice(idx + 1) };
  }
  if (entry && typeof entry === "object" && typeof entry.provider === "string" && typeof entry.model === "string") {
    if (!entry.provider || !entry.model) return null;
    return { provider: entry.provider, model: entry.model };
  }
  return null;
}

function configPathFor(cwd: string): { globalPath: string; projectPath: string } {
  return {
    globalPath: join(getAgentDir(), "favorite-models.json"),
    projectPath: join(cwd, CONFIG_DIR_NAME, "favorite-models.json"),
  };
}

function loadConfig(cwd: string): FavoritesConfig {
  const { globalPath, projectPath } = configPathFor(cwd);
  let config: FavoritesConfig = {};

  for (const path of [globalPath, projectPath]) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8"));
      if (parsed && typeof parsed === "object") {
        config = { ...config, ...parsed };
      }
    } catch (err) {
      console.error(`[favorite-models] Failed to load ${path}: ${err}`);
    }
  }

  return config;
}

function describeFavorite(f: FavoriteEntry): string {
  return `${f.provider}/${f.model}`;
}

export default function favoriteModels(pi: ExtensionAPI) {
  let config: FavoritesConfig = loadConfig(process.cwd());
  let favorites: FavoriteEntry[] = (config.favorites ?? [])
    .map(parseFavorite)
    .filter((f): f is FavoriteEntry => f !== null);

  function reloadConfig(cwd: string): void {
    config = loadConfig(cwd);
    favorites = (config.favorites ?? [])
      .map(parseFavorite)
      .filter((f): f is FavoriteEntry => f !== null);
  }

  function saveFavorites(): void {
    const path = join(getAgentDir(), "favorite-models.json");
    const next = {
      ...config,
      favorites: favorites.map((favorite) => ({ ...favorite })),
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(next, null, 2)}\\n`, "utf-8");
    config = next;
  }

  /** Index of the active model within favorites, or -1 if it is not a favorite. */
  function currentIndex(ctx: ExtensionContext): number {
    if (!ctx.model) return -1;
    return favorites.findIndex(
      (f) => f.provider === ctx.model!.provider && f.model === ctx.model!.id,
    );
  }

  /** Show the favorite position in the status bar (e.g. "★ 2/3"). */
  function updateStatus(ctx: ExtensionContext): void {
    const idx = currentIndex(ctx);
    if (idx === -1) {
      ctx.ui.setStatus("favorites", undefined);
    } else {
      ctx.ui.setStatus("favorites", `★ ${idx + 1}/${favorites.length}`);
    }
  }

  function emptyMessage(ctx: ExtensionContext): string {
    const { globalPath, projectPath } = configPathFor(ctx.cwd);
    return `No favorites defined. Add ${globalPath} or ${projectPath}`;
  }

  /**
   * Cycle through favorites in the given direction.
   * Skips favorites that cannot be resolved or have no auth, so pressing the
   * hotkey always lands on a usable model when one exists.
   */
  async function cycle(ctx: ExtensionContext, direction: 1 | -1): Promise<void> {
    if (favorites.length === 0) {
      ctx.ui.notify(emptyMessage(ctx), "warning");
      return;
    }

    const idx = currentIndex(ctx);
    let target = idx === -1 ? (direction === 1 ? 0 : favorites.length - 1) : idx + direction;
    target = ((target % favorites.length) + favorites.length) % favorites.length;

    for (let attempts = 0; attempts < favorites.length; attempts++) {
      const favorite = favorites[target];
      const model = ctx.modelRegistry.find(favorite.provider, favorite.model);

      if (!model) {
        ctx.ui.notify(`Favorite model not found: ${describeFavorite(favorite)}`, "warning");
      } else if (await pi.setModel(model)) {
        ctx.ui.notify(`Model: ${describeFavorite(favorite)}`, "info");
        updateStatus(ctx);
        return;
      } else {
        ctx.ui.notify(`No API key for ${describeFavorite(favorite)}`, "warning");
      }

      target = (target + direction + favorites.length) % favorites.length;
    }

    updateStatus(ctx);
  }

  // Hotkeys ----------------------------------------------------------------

  pi.registerShortcut(config.cycleForwardKey ?? DEFAULT_FORWARD_KEY, {
    description: "Cycle to next favorite model",
    handler: async (ctx) => {
      await cycle(ctx, 1);
    },
  });

  pi.registerShortcut(config.cycleBackwardKey ?? DEFAULT_BACKWARD_KEY, {
    description: "Cycle to previous favorite model",
    handler: async (ctx) => {
      await cycle(ctx, -1);
    },
  });

  // Command ----------------------------------------------------------------

  pi.registerCommand("favorite-models", {
    description: "Select a model; press f to toggle it as a favorite",
    handler: async (_args, ctx) => {
      const scoped = ctx.scopedModels.length > 0
        ? ctx.scopedModels.map((entry) => entry.model)
        : ctx.modelRegistry.getAvailable();
      const models = Array.from(
        new Map(scoped.map((model) => [`${model.provider}/${model.id}`, model])).values(),
      );

      if (models.length === 0) {
        ctx.ui.notify("No available models found.", "warning");
        return;
      }

      const result = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
        let selector: SelectList;
        let selectedIndex = 0;

        const isFavorite = (provider: string, model: string) =>
          favorites.some((favorite) => favorite.provider === provider && favorite.model === model);

        const makeItems = (): SelectItem[] => models.map((model) => {
          const key = `${model.provider}/${model.id}`;
          const marker = isFavorite(model.provider, model.id) ? "★ " : "  ";
          const active = ctx.model?.provider === model.provider && ctx.model.id === model.id ? " (active)" : "";
          return {
            value: key,
            label: `${marker}${model.provider}/${model.id}${active}`,
            description: isFavorite(model.provider, model.id) ? "favorite • f toggle" : "f add to favorites",
          };
        });

        const rebuild = () => {
          const items = makeItems();
          selector = new SelectList(items, Math.min(items.length, 12), {
            selectedPrefix: (text) => theme.fg("accent", text),
            selectedText: (text) => theme.fg("accent", text),
            description: (text) => theme.fg("muted", text),
            scrollInfo: (text) => theme.fg("dim", text),
            noMatch: (text) => theme.fg("warning", text),
          });
          selector.setSelectedIndex(selectedIndex);
          selector.onSelect = (item) => done(item.value);
          selector.onCancel = () => done(null);
        };
        rebuild();

        const container = new Container();
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Text(theme.fg("accent", theme.bold("Favorite Models")), 1, 0));
        container.addChild(new Text(theme.fg("dim", "↑↓ navigate • f toggle favorite • enter select • esc cancel"), 1, 0));

        return {
          render: (width: number) => {
            container.clear();
            container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
            container.addChild(new Text(theme.fg("accent", theme.bold("Favorite Models")), 1, 0));
            container.addChild(selector);
            container.addChild(new Text(theme.fg("dim", "↑↓ navigate • f toggle favorite • enter select • esc cancel"), 1, 0));
            container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
            return container.render(width);
          },
          invalidate: () => container.invalidate(),
          handleInput: (data: string) => {
            if (data === "f") {
              const item = selector.getSelectedItem();
              if (!item) return;
              const current = favorites.findIndex((favorite) =>
                `${favorite.provider}/${favorite.model}` === item.value,
              );
              if (current === -1) {
                const slash = item.value.indexOf("/");
                favorites.push({ provider: item.value.slice(0, slash), model: item.value.slice(slash + 1) });
                ctx.ui.notify(`Added favorite: ${item.value}`, "info");
              } else {
                favorites.splice(current, 1);
                ctx.ui.notify(`Removed favorite: ${item.value}`, "info");
              }
              saveFavorites();
              selectedIndex = models.findIndex((model) => `${model.provider}/${model.id}` === item.value);
              rebuild();
              tui.requestRender();
              return;
            }

            selector.handleInput(data);
            const item = selector.getSelectedItem();
            if (item) {
              selectedIndex = models.findIndex((model) => `${model.provider}/${model.id}` === item.value);
            }
            tui.requestRender();
          },
        };
      });

      if (result === null) return;
      const slash = result.indexOf("/");
      const model = ctx.modelRegistry.find(result.slice(0, slash), result.slice(slash + 1));
      if (!model) {
        ctx.ui.notify(`Model not found: ${result}`, "warning");
        return;
      }
      if (!(await pi.setModel(model))) {
        ctx.ui.notify(`No API key for ${result}`, "warning");
        return;
      }
      ctx.ui.notify(`Model: ${result}`, "info");
      updateStatus(ctx);
    },
  });

  // Backward-compatible alias.
  pi.registerCommand("favorites", {
    description: "Alias for /favorite-models",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Use /favorite-models to select models and press f to toggle favorites.", "info");
    },
  });

  // Lifecycle --------------------------------------------------------------

  // Refresh config (project-local config may only be available after trust).
  pi.on("session_start", (_event, ctx) => {
    reloadConfig(ctx.cwd);
    updateStatus(ctx);
  });

  // Keep the status bar in sync when the model changes via /model, Ctrl+P, or restore.
  pi.on("model_select", (_event, ctx) => {
    updateStatus(ctx);
  });
}
