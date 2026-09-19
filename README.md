# pi Configuration

This repository contains the personal configuration and extensions for [pi](https://github.com/badlogic/pi-mono), the terminal coding assistant.

## Repository layout

- `agent/extensions/` — pi extensions.
- `agent/favorite-models.json` — favorite models and model-cycle key configuration.
- `agent/settings.json` — pi settings and enabled model patterns.
- `agent/keybindings.json` — custom pi keybindings.
- `agent/skills/` — installed pi skills.
- `agent/themes/` — installed pi themes.

Sensitive and generated data is intentionally ignored, including credentials, session history, and model catalogs. See `.gitignore`.

## Favorite models

The favorite-models extension is located at:

```text
agent/extensions/favorite-models.ts
```

Use the following command inside pi to open the model picker:

```text
/favorite-models
```

In the picker:

- `↑` / `↓` navigates models.
- `f` adds or removes the highlighted model from favorites.
- `Enter` selects the highlighted model.
- `Esc` closes the picker.

`Ctrl+P` cycles forward through favorite models. The previous favorite is available with `Ctrl+Alt+M`.

Favorites are stored in:

```text
agent/favorite-models.json
```

After changing extensions or keybindings, run `/reload` in pi or restart pi.

## Git workflow

This repository is the global pi configuration repository. From `~/.pi`:

```bash
git status
git add README.md AGENTS.MD agent/extensions agent/favorite-models.json agent/keybindings.json
git commit -m "Update pi configuration"
```

Do not add `agent/auth.json` or session data to Git.
