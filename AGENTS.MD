# AGENTS.md

## Scope

These instructions apply to the global pi configuration repository at `~/.pi`.

## Important files

- `agent/extensions/` contains TypeScript extensions loaded by pi.
- `agent/favorite-models.json` configures favorite models and their cycling keys.
- `agent/keybindings.json` overrides built-in pi keybindings.
- `agent/settings.json` contains general pi settings and enabled model patterns.

## Extension changes

- Read the relevant pi documentation before changing an extension.
- Use the official extension APIs and follow the examples shipped with pi.
- Keep extensions small and focused.
- Use `ctx.ui.custom()` and components from `@earendil-works/pi-tui` for interactive pickers.
- After changing an extension, validate that pi can load it with a headless invocation when possible.
- Run `/reload` in pi after changes.

## Favorite-model behavior

The favorite-models extension must preserve these behaviors:

- `/favorite-models` opens the model picker.
- `f` toggles the highlighted model as a favorite.
- `Ctrl+P` cycles forward through favorites only.
- `Ctrl+Alt+M` cycles backward through favorites.
- Favorites persist in `agent/favorite-models.json`.
- Models that cannot be resolved or authenticated should be skipped during cycling.

When changing the picker, keep the favorite marker and keyboard help text up to date.

## Safety

Never commit or expose:

- `agent/auth.json`
- Session history under `agent/sessions/`
- Generated model catalogs such as `agent/models-store.json`
- API keys, OAuth tokens, or other credentials

Do not modify pi’s installed package or documentation to implement personal behavior when an extension can provide the functionality.

## Git

This is a personal configuration repository. Prefer focused commits with descriptive messages. Before committing, check:

```bash
git status --short
git diff --check
git diff --stat
```
