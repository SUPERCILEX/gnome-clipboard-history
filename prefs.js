'use strict';

const { GObject, Gtk, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext;
const _ = Gettext.domain(Me.uuid).gettext;

var Fields = {
  HISTORY_SIZE: 'history-size',
  WINDOW_WIDTH_PERCENTAGE: 'window-width-percentage',
  CACHE_FILE_SIZE: 'cache-size',
  CACHE_ONLY_FAVORITES: 'cache-only-favorites',
  NOTIFY_ON_COPY: 'notify-on-copy',
  CONFIRM_ON_CLEAR: 'confirm-clear',
  MOVE_ITEM_FIRST: 'move-item-first',
  ENABLE_KEYBINDING: 'enable-keybindings',
  TOPBAR_PREVIEW_SIZE: 'topbar-preview-size',
  TOPBAR_DISPLAY_MODE_ID: 'display-mode',
  DISABLE_DOWN_ARROW: 'disable-down-arrow',
  STRIP_TEXT: 'strip-text',
  PRIVATE_MODE: 'private-mode',
  PASTE_ON_SELECTION: 'paste-on-selection',
  PROCESS_PRIMARY_SELECTION: 'process-primary-selection',
};

const SCHEMA_NAME = 'org.gnome.shell.extensions.clipboard-history';
var Settings = ExtensionUtils.getSettings(SCHEMA_NAME);

function init() {
  ExtensionUtils.initTranslations(Me.uuid);
}

class Prefs extends GObject.Object {
  _init() {
    this.main = new Gtk.Grid({
      margin_top: 10,
      margin_bottom: 10,
      margin_start: 10,
      margin_end: 10,
      row_spacing: 12,
      column_spacing: 18,
      column_homogeneous: false,
      row_homogeneous: false,
    });
    this.field_size = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 100_000,
        step_increment: 100,
      }),
    });
    this.window_width_percentage = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 100,
        step_increment: 5,
      }),
    });
    this.field_cache_size = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 1024,
        step_increment: 5,
      }),
    });
    this.field_topbar_preview_size = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 100,
        step_increment: 10,
      }),
    });
    this.field_display_mode = new Gtk.ComboBox({
      model: this._create_display_mode_options(),
    });

    let rendererText = new Gtk.CellRendererText();
    this.field_display_mode.pack_start(rendererText, false);
    this.field_display_mode.add_attribute(rendererText, 'text', 0);
    this.field_disable_down_arrow = new Gtk.Switch();
    this.field_cache_disable = new Gtk.Switch();
    this.field_notification_toggle = new Gtk.Switch();
    this.field_confirm_clear_toggle = new Gtk.Switch();
    this.field_strip_text = new Gtk.Switch();
    this.field_paste_on_selection = new Gtk.Switch();
    this.field_process_primary_selection = new Gtk.Switch();
    this.field_move_item_first = new Gtk.Switch();
    this.field_keybinding = createKeybindingWidget(Settings);
    addKeybinding(
      this.field_keybinding.model,
      Settings,
      'toggle-menu',
      _('Toggle the menu'),
    );
    addKeybinding(
      this.field_keybinding.model,
      Settings,
      'clear-history',
      _('Clear history'),
    );
    addKeybinding(
      this.field_keybinding.model,
      Settings,
      'prev-entry',
      _('Previous entry'),
    );
    addKeybinding(
      this.field_keybinding.model,
      Settings,
      'next-entry',
      _('Next entry'),
    );
    addKeybinding(
      this.field_keybinding.model,
      Settings,
      'toggle-private-mode',
      _('Toggle private mode'),
    );

    this.field_keybinding_activation = new Gtk.Switch();
    this.field_keybinding_activation.connect('notify::active', (widget) => {
      this.field_keybinding.set_sensitive(widget.active);
    });

    let sizeLabel = new Gtk.Label({
      label: _('Max number of items'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let windowWidthPercentageLabel = new Gtk.Label({
      label: _('Window width (%)'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let cacheSizeLabel = new Gtk.Label({
      label: _('Max clipboard history size (MiB)'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let cacheDisableLabel = new Gtk.Label({
      label: _('Only save favorites to disk'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let notificationLabel = new Gtk.Label({
      label: _('Show notification on copy'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let confirmClearLabel = new Gtk.Label({
      label: _('Ask for confirmation before clearing history'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let moveFirstLabel = new Gtk.Label({
      label: _('Move previously copied items to the top'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let keybindingLabel = new Gtk.Label({
      label: _('Keyboard shortcuts'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let topbarPreviewLabel = new Gtk.Label({
      label: _('Number of characters in status bar'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let displayModeLabel = new Gtk.Label({
      label: _('What to show in status bar'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let disableDownArrowLabel = new Gtk.Label({
      label: _('Remove down arrow in status bar'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let stripTextLabel = new Gtk.Label({
      label: _('Remove whitespace around text'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let pasteOnSelectionLabel = new Gtk.Label({
      label: _('Paste on selection'),
      hexpand: true,
      halign: Gtk.Align.START,
    });
    let processPrimarySelection = new Gtk.Label({
      label: _('Save selected text to history'),
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
    })(this.main);

    addRow(windowWidthPercentageLabel, this.window_width_percentage);
    addRow(sizeLabel, this.field_size);
    addRow(cacheSizeLabel, this.field_cache_size);
    addRow(cacheDisableLabel, this.field_cache_disable);
    addRow(moveFirstLabel, this.field_move_item_first);
    addRow(stripTextLabel, this.field_strip_text);
    addRow(pasteOnSelectionLabel, this.field_paste_on_selection);
    addRow(processPrimarySelection, this.field_process_primary_selection);
    addRow(displayModeLabel, this.field_display_mode);
    addRow(disableDownArrowLabel, this.field_disable_down_arrow);
    addRow(topbarPreviewLabel, this.field_topbar_preview_size);
    addRow(notificationLabel, this.field_notification_toggle);
    addRow(confirmClearLabel, this.field_confirm_clear_toggle);
    addRow(keybindingLabel, this.field_keybinding_activation);
    addRow(null, this.field_keybinding);

    Settings.bind(
      Fields.HISTORY_SIZE,
      this.field_size,
      'value',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.WINDOW_WIDTH_PERCENTAGE,
      this.window_width_percentage,
      'value',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.CACHE_FILE_SIZE,
      this.field_cache_size,
      'value',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.CACHE_ONLY_FAVORITES,
      this.field_cache_disable,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.NOTIFY_ON_COPY,
      this.field_notification_toggle,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.CONFIRM_ON_CLEAR,
      this.field_confirm_clear_toggle,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.MOVE_ITEM_FIRST,
      this.field_move_item_first,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.TOPBAR_DISPLAY_MODE_ID,
      this.field_display_mode,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.DISABLE_DOWN_ARROW,
      this.field_disable_down_arrow,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.TOPBAR_PREVIEW_SIZE,
      this.field_topbar_preview_size,
      'value',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.STRIP_TEXT,
      this.field_strip_text,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.PASTE_ON_SELECTION,
      this.field_paste_on_selection,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.PROCESS_PRIMARY_SELECTION,
      this.field_process_primary_selection,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    Settings.bind(
      Fields.ENABLE_KEYBINDING,
      this.field_keybinding_activation,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
  }

  _create_display_mode_options() {
    let options = [
      { name: _('Icon') },
      { name: _('Clipboard contents') },
      { name: _('Both') },
      { name: _('Neither') },
    ];
    let liststore = new Gtk.ListStore();
    liststore.set_column_types([GObject.TYPE_STRING]);
    for (let i = 0; i < options.length; i++) {
      let option = options[i];
      let iter = liststore.append();
      liststore.set(iter, [0], [option.name]);
    }
    return liststore;
  }
}

const PrefsObj = new GObject.registerClass(Prefs);

function buildPrefsWidget() {
  let widget = new PrefsObj();
  return widget.main;
}

//binding widgets
//////////////////////////////////
const COLUMN_ID = 0;
const COLUMN_DESCRIPTION = 1;
const COLUMN_KEY = 2;
const COLUMN_MODS = 3;

function addKeybinding(model, settings, id, description) {
  // Get the current accelerator.
  let accelerator = settings.get_strv(id)[0];
  let key, mods;
  if (accelerator == null) {
    [key, mods] = [0, 0];
  } else {
    [, key, mods] = Gtk.accelerator_parse(settings.get_strv(id)[0]);
  }

  // Add a row for the keybinding.
  let row = model.insert(100); // Erm...
  model.set(
    row,
    [COLUMN_ID, COLUMN_DESCRIPTION, COLUMN_KEY, COLUMN_MODS],
    [id, description, key, mods],
  );
}

function createKeybindingWidget(Settings) {
  let model = new Gtk.ListStore();

  model.set_column_types([
    GObject.TYPE_STRING, // COLUMN_ID
    GObject.TYPE_STRING, // COLUMN_DESCRIPTION
    GObject.TYPE_INT, // COLUMN_KEY
    GObject.TYPE_INT,
  ]); // COLUMN_MODS

  let treeView = new Gtk.TreeView();
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
      let [ok, iter] = model.get_iter_from_string(path);
      if (!ok) {
        return;
      }

      // Update the UI.
      model.set(iter, [COLUMN_KEY, COLUMN_MODS], [key, mods]);

      // Update the stored setting.
      let id = model.get_value(iter, COLUMN_ID);
      let accelString = Gtk.accelerator_name(key, mods);
      Settings.set_strv(id, [accelString]);
    },
  );

  renderer.connect('accel-cleared', function (renderer, path) {
    let [ok, iter] = model.get_iter_from_string(path);
    if (!ok) {
      return;
    }

    // Update the UI.
    model.set(iter, [COLUMN_KEY, COLUMN_MODS], [0, 0]);

    // Update the stored setting.
    let id = model.get_value(iter, COLUMN_ID);
    Settings.set_strv(id, []);
  });

  column = new Gtk.TreeViewColumn();
  column.pack_end(renderer, false);
  column.add_attribute(renderer, 'accel-key', COLUMN_KEY);
  column.add_attribute(renderer, 'accel-mods', COLUMN_MODS);

  treeView.append_column(column);

  return treeView;
}
