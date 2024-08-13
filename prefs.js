import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';

import {
  ExtensionPreferences,
  gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import Fields from './settingsFields.js';

export default class ClipboardHistoryPrefs extends ExtensionPreferences {
  // fillPreferencesWindow() is passed a Adw.PreferencesWindow,
  // we need to wrap our widget in a Adw.PreferencesPage and Adw.PreferencesGroup
  // ourselves.
  // It would be great to port the preferences to standard Adw widgets.
  // https://gjs.guide/extensions/development/preferences.html#prefs-js
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const main = new Gtk.Grid({
      margin_top: 10,
      margin_bottom: 10,
      margin_start: 10,
      margin_end: 10,
      row_spacing: 12,
      column_spacing: 18,
      column_homogeneous: false,
      row_homogeneous: false,
    });
    const field_size = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 100_000,
        step_increment: 100,
      }),
    });
    const window_width_percentage = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 100,
        step_increment: 5,
      }),
    });
    const field_cache_size = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 1024,
        step_increment: 5,
      }),
    });
    const field_topbar_preview_size = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 100,
        step_increment: 10,
      }),
    });
    const field_display_mode = new Gtk.ComboBox({
      model: this._create_display_mode_options(),
    });

    const rendererText = new Gtk.CellRendererText();
    field_display_mode.pack_start(rendererText, false);
    field_display_mode.add_attribute(rendererText, 'text', 0);
    const field_disable_down_arrow = new Gtk.Switch();
    const field_cache_disable = new Gtk.Switch();
    const field_notification_toggle = new Gtk.Switch();
    const field_confirm_clear_toggle = new Gtk.Switch();
    const field_strip_text = new Gtk.Switch();
    const field_paste_on_selection = new Gtk.Switch();
    const field_process_primary_selection = new Gtk.Switch();
    const field_ignore_password_mimes = new Gtk.Switch();
    const field_move_item_first = new Gtk.Switch();
    const field_keybinding = createKeybindingWidget(settings);
    addKeybinding(
      field_keybinding.model,
      settings,
      'toggle-menu',
      _('Toggle the menu'),
    );
    addKeybinding(
      field_keybinding.model,
      settings,
      'clear-history',
      _('Clear history'),
    );
    addKeybinding(
      field_keybinding.model,
      settings,
      'prev-entry',
      _('Previous entry'),
    );
    addKeybinding(
      field_keybinding.model,
      settings,
      'next-entry',
      _('Next entry'),
    );
    addKeybinding(
      field_keybinding.model,
      settings,
      'toggle-private-mode',
      _('Toggle private mode'),
    );

    const field_keybinding_activation = new Gtk.Switch();
    field_keybinding_activation.connect('notify::active', (widget) => {
      field_keybinding.set_sensitive(widget.active);
    });

    const sizeLabel = new Gtk.Label({
      label: _('Max number of items'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const windowWidthPercentageLabel = new Gtk.Label({
      label: _('Window width (%)'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const cacheSizeLabel = new Gtk.Label({
      label: _('Max clipboard history size (MiB)'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const cacheDisableLabel = new Gtk.Label({
      label: _('Only save favorites to disk'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const notificationLabel = new Gtk.Label({
      label: _('Show notification on copy'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const confirmClearLabel = new Gtk.Label({
      label: _('Ask for confirmation before clearing history'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const moveFirstLabel = new Gtk.Label({
      label: _('Move previously copied items to the top'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const keybindingLabel = new Gtk.Label({
      label: _('Keyboard shortcuts'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const topbarPreviewLabel = new Gtk.Label({
      label: _('Number of characters in status bar'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const displayModeLabel = new Gtk.Label({
      label: _('What to show in status bar'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const disableDownArrowLabel = new Gtk.Label({
      label: _('Remove down arrow in status bar'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const stripTextLabel = new Gtk.Label({
      label: _('Remove whitespace around text'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const pasteOnSelectionLabel = new Gtk.Label({
      label: _('Paste on selection'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const processPrimarySelection = new Gtk.Label({
      label: _('Save selected text to history'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    const ignorePasswordMimes = new Gtk.Label({
      label: _('Try to avoid copying passwords (known potentially buggy)'),
      hexpand: true,
      halign: Gtk.Align.START,
    });

    const addRow = ((main) => {
      let row = 0;
      return (label, input) => {
        let inputWidget = input;

        if (input instanceof Gtk.Switch) {
          inputWidget = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
          });
          inputWidget.append(input);
        }

        if (label) {
          main.attach(label, 0, row, 1, 1);
          main.attach(inputWidget, 1, row, 1, 1);
        } else {
          main.attach(inputWidget, 0, row, 2, 1);
        }

        row++;
      };
    })(main);

    addRow(windowWidthPercentageLabel, window_width_percentage);
    addRow(sizeLabel, field_size);
    addRow(cacheSizeLabel, field_cache_size);
    addRow(cacheDisableLabel, field_cache_disable);
    addRow(moveFirstLabel, field_move_item_first);
    addRow(stripTextLabel, field_strip_text);
    addRow(pasteOnSelectionLabel, field_paste_on_selection);
    addRow(processPrimarySelection, field_process_primary_selection);
    addRow(ignorePasswordMimes, field_ignore_password_mimes);
    addRow(displayModeLabel, field_display_mode);
    addRow(disableDownArrowLabel, field_disable_down_arrow);
    addRow(topbarPreviewLabel, field_topbar_preview_size);
    addRow(notificationLabel, field_notification_toggle);
    addRow(confirmClearLabel, field_confirm_clear_toggle);
    addRow(keybindingLabel, field_keybinding_activation);
    addRow(null, field_keybinding);

    settings.bind(
      Fields.HISTORY_SIZE,
      field_size,
      'value',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.WINDOW_WIDTH_PERCENTAGE,
      window_width_percentage,
      'value',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.CACHE_FILE_SIZE,
      field_cache_size,
      'value',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.CACHE_ONLY_FAVORITES,
      field_cache_disable,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.NOTIFY_ON_COPY,
      field_notification_toggle,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.CONFIRM_ON_CLEAR,
      field_confirm_clear_toggle,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.MOVE_ITEM_FIRST,
      field_move_item_first,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.TOPBAR_DISPLAY_MODE_ID,
      field_display_mode,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.DISABLE_DOWN_ARROW,
      field_disable_down_arrow,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.TOPBAR_PREVIEW_SIZE,
      field_topbar_preview_size,
      'value',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.STRIP_TEXT,
      field_strip_text,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.PASTE_ON_SELECTION,
      field_paste_on_selection,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.PROCESS_PRIMARY_SELECTION,
      field_process_primary_selection,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.IGNORE_PASSWORD_MIMES,
      field_ignore_password_mimes,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    settings.bind(
      Fields.ENABLE_KEYBINDING,
      field_keybinding_activation,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );

    const group = new Adw.PreferencesGroup();
    group.add(main);

    const page = new Adw.PreferencesPage();
    page.add(group);

    window.add(page);
  }

  _create_display_mode_options() {
    const options = [
      { name: _('Icon') },
      { name: _('Clipboard contents') },
      { name: _('Both') },
      { name: _('Neither') },
    ];
    const liststore = new Gtk.ListStore();
    liststore.set_column_types([GObject.TYPE_STRING]);
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const iter = liststore.append();
      liststore.set(iter, [0], [option.name]);
    }
    return liststore;
  }
}

//binding widgets
//////////////////////////////////
const COLUMN_ID = 0;
const COLUMN_DESCRIPTION = 1;
const COLUMN_KEY = 2;
const COLUMN_MODS = 3;

function addKeybinding(model, settings, id, description) {
  // Get the current accelerator.
  const accelerator = settings.get_strv(id)[0];
  let key, mods;
  if (accelerator == null) {
    [key, mods] = [0, 0];
  } else {
    [, key, mods] = Gtk.accelerator_parse(settings.get_strv(id)[0]);
  }

  // Add a row for the keybinding.
  const row = model.insert(100); // Erm...
  model.set(
    row,
    [COLUMN_ID, COLUMN_DESCRIPTION, COLUMN_KEY, COLUMN_MODS],
    [id, description, key, mods],
  );
}

function createKeybindingWidget(Settings) {
  const model = new Gtk.ListStore();

  model.set_column_types([
    GObject.TYPE_STRING, // COLUMN_ID
    GObject.TYPE_STRING, // COLUMN_DESCRIPTION
    GObject.TYPE_INT, // COLUMN_KEY
    GObject.TYPE_INT,
  ]); // COLUMN_MODS

  const treeView = new Gtk.TreeView();
  treeView.model = model;
  treeView.headers_visible = false;

  let column, renderer;

  // Description column.
  renderer = new Gtk.CellRendererText();

  column = new Gtk.TreeViewColumn();
  column.expand = true;
  column.pack_start(renderer, true);
  column.add_attribute(renderer, 'text', COLUMN_DESCRIPTION);

  treeView.append_column(column);

  // Key binding column.
  renderer = new Gtk.CellRendererAccel();
  renderer.accel_mode = Gtk.CellRendererAccelMode.GTK;
  renderer.editable = true;

  renderer.connect(
    'accel-edited',
    function (renderer, path, key, mods, hwCode) {
      const [ok, iter] = model.get_iter_from_string(path);
      if (!ok) {
        return;
      }

      // Update the UI.
      model.set(iter, [COLUMN_KEY, COLUMN_MODS], [key, mods]);

      // Update the stored setting.
      const id = model.get_value(iter, COLUMN_ID);
      const accelString = Gtk.accelerator_name(key, mods);
      Settings.set_strv(id, [accelString]);
    },
  );

  renderer.connect('accel-cleared', function (renderer, path) {
    const [ok, iter] = model.get_iter_from_string(path);
    if (!ok) {
      return;
    }

    // Update the UI.
    model.set(iter, [COLUMN_KEY, COLUMN_MODS], [0, 0]);

    // Update the stored setting.
    const id = model.get_value(iter, COLUMN_ID);
    Settings.set_strv(id, []);
  });

  column = new Gtk.TreeViewColumn();
  column.pack_end(renderer, false);
  column.add_attribute(renderer, 'accel-key', COLUMN_KEY);
  column.add_attribute(renderer, 'accel-mods', COLUMN_MODS);

  treeView.append_column(column);

  return treeView;
}
