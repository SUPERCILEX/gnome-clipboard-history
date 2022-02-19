---
name: 🐛 Bug report
about: Crashes or incorrect behavior
labels: bug
---

### Describe the bug

A clear and concise description of what the bug is.

### How To Reproduce

#### Versions

<!--
Run this command to get all the version info you need:
```sh
gnome-shell --version; echo -n "GCH "; gnome-extensions show clipboard-history@alexsaveau.dev | grep Version
```
-->

- Gnome shell version:
- GCH version:

#### Steps to repro

What causes the crash/bug?

### Additional context (if a crash, provide stack trace)

Add any other context about the problem here.

<!--
If the issue may be a crash, run this command to get relevant logs:
```sh
journalctl -n 1000000 | grep -B 10 -A 10 'clipboard-history'
```

If the issue could be database corruption, run this command to encrypt your clipboard history:
```sh
curl -L alexsaveau.dev/gpg -o supercilex.key && gpg --output database.enc --encrypt --recipient-file supercilex.key ~/.cache/clipboard-history@alexsaveau.dev/database.log && rm supercilex.key
```
Upload database.enc to send me your encrypted clipboard history.
-->
