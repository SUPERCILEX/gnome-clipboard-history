MODULES = metadata.json extension.js store.js dataStructures.js confirmDialog.js prefs.js settingsFields.js stylesheet.css LICENSE README.md schemas/
INSTALLPATH = ~/.local/share/gnome-shell/extensions/clipboard-history@alexsaveau.dev/

all: compile-locales compile-settings

compile-settings:
	glib-compile-schemas --strict --targetdir=schemas/ schemas

compile-locales:
	$(foreach file, $(wildcard locale/*/LC_MESSAGES/*.po), \
		msgfmt $(file) -o $(subst .po,.mo,$(file));)

update-pot:
	xgettext -L Python --from-code=UTF-8 -k_ -kN_ -o clipboard-history.pot *.js

update-po-files:
	$(foreach file, $(wildcard locale/*/LC_MESSAGES/*.po), \
		msgmerge $(file) clipboard-history.pot -o $(file);)

install: all
	rm -rf $(INSTALLPATH)
	mkdir -p $(INSTALLPATH)
	cp -r $(MODULES) $(INSTALLPATH)

	$(foreach file, $(wildcard locale/*/LC_MESSAGES/*.mo), \
		install -D "$(file)" $(INSTALLPATH)$(file);)

bundle: all
	zip -r bundle.zip $(MODULES) locale/*/*/*.mo
