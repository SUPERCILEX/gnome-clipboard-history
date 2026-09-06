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
  WRAP_HISTORY_CYCLE: 'wrap-history-cycle',
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
    this.field_wrap_history_cycle = new Gtk.Switch();
    this.field_keybinding = createKeybindingWidget(Settings);
    addKeybinding(
      this.field_keybinding,
      Settings,
      'toggle-menu',
      _('Toggle the menu'),
    );
    addKeybinding(
      this.field_keybinding,
      Settings,
      'clear-history',
      _('Clear history'),
    );
    addKeybinding(
      this.field_keybinding,
      Settings,
      'prev-entry',
      _('Previous entry'),
    );
    addKeybinding(
      this.field_keybinding,
      Settings,
      'next-entry',
      _('Next entry'),
    );
    addKeybinding(
      this.field_keybinding,
      Settings,
      'toggle-private-mode',
      _('Toggle private mode'),
    );
    const keybindingHint = new Gtk.Label({
      label: _(
        'Click a shortcut, then press the new keys. Esc cancels. Backspace disables.',
      ),
      wrap: true,
      hexpand: true,
      halign: Gtk.Align.START,
      xalign: 0,
    });
    keybindingHint.add_css_class('dim-label');
    this.field_keybinding.append(keybindingHint);

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
    let wrapHistoryCycleLabel = new Gtk.Label({
      label: _('Wrap around when cycling history'),
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
    addRow(wrapHistoryCycleLabel, this.field_wrap_history_cycle);
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
    Settings.bind(
      Fields.WRAP_HISTORY_CYCLE,
      this.field_wrap_history_cycle,
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
// Gtk.CellRendererAccel grabs the keyboard and can leave Settings stuck
// on "New accelerator…". These buttons never grab; they just listen.
let ShortcutButton;
let activeShortcutButton = null;

function addKeybinding(widget, settings, id, description) {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
    hexpand: true,
  });
  row.append(
    new Gtk.Label({
      label: description,
      hexpand: true,
      halign: Gtk.Align.START,
      xalign: 0,
    }),
  );
  row.append(new (getShortcutButton())(settings, id));
  widget.append(row);
}

function createKeybindingWidget(_settings) {
  return new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 6,
    hexpand: true,
  });
}

function getShortcutButton() {
  if (ShortcutButton) {
    return ShortcutButton;
  }

  const Gdk = imports.gi.Gdk;
  const GLib = imports.gi.GLib;

  ShortcutButton = GObject.registerClass(
    {
      GTypeName: 'ClipboardHistoryShortcutButton',
    },
    class ShortcutButtonClass extends Gtk.Button {
      _init(settings, id) {
        super._init({
          hexpand: false,
          halign: Gtk.Align.END,
          valign: Gtk.Align.CENTER,
          can_focus: true,
        });
        this._settings = settings;
        this._id = id;
        this._capturing = false;
        this._timeoutId = 0;
        this._windowKey = null;
        this._updateLabel();

        this.connect('clicked', () => {
          if (this._capturing) {
            this._stopCapture();
          } else {
            this._startCapture();
          }
        });
        this.connect('unmap', () => this._stopCapture());
        this.connect('destroy', () => this._stopCapture());

        const key = new Gtk.EventControllerKey();
        if (key.set_im_context) {
          key.set_im_context(null);
        }
        key.connect('key-pressed', (_controller, keyval, keycode, state) => {
          if (!this._capturing) {
            return Gdk.EVENT_PROPAGATE;
          }
          return this._onKeyPressed(keyval, keycode, state);
        });
        this.add_controller(key);

        this._settingsChangedId = this._settings.connect(
          `changed::${id}`,
          () => {
            if (!this._capturing) {
              this._updateLabel();
            }
          },
        );
        this.connect('destroy', () => {
          if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
          }
        });
      }

      _startCapture() {
        if (activeShortcutButton && activeShortcutButton !== this) {
          activeShortcutButton._stopCapture();
        }
        activeShortcutButton = this;
        this._capturing = true;
        this.label = _('New accelerator…');
        this.grab_focus();
        this._addWindowKeyController();
        if (!this._windowKey) {
          GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (this._capturing && !this._windowKey) {
              this.grab_focus();
              this._addWindowKeyController();
            }
            return GLib.SOURCE_REMOVE;
          });
        }
        this._timeoutId = GLib.timeout_add_seconds(
          GLib.PRIORITY_DEFAULT,
          15,
          () => {
            this._timeoutId = 0;
            this._stopCapture();
            return GLib.SOURCE_REMOVE;
          },
        );
      }

      _stopCapture() {
        if (this._timeoutId) {
          GLib.source_remove(this._timeoutId);
          this._timeoutId = 0;
        }
        this._removeWindowKeyController();
        if (!this._capturing) {
          if (activeShortcutButton === this) {
            activeShortcutButton = null;
          }
          return;
        }
        this._capturing = false;
        if (activeShortcutButton === this) {
          activeShortcutButton = null;
        }
        this._updateLabel();
      }

      _addWindowKeyController() {
        this._removeWindowKeyController();
        const root = this.get_root && this.get_root();
        if (!root || !root.add_controller) {
          return;
        }
        const key = new Gtk.EventControllerKey();
        key.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
        if (key.set_im_context) {
          key.set_im_context(null);
        }
        key.connect('key-pressed', (_controller, keyval, keycode, state) => {
          if (!this._capturing) {
            return Gdk.EVENT_PROPAGATE;
          }
          return this._onKeyPressed(keyval, keycode, state);
        });
        root.add_controller(key);
        this._windowKey = key;
      }

      _removeWindowKeyController() {
        if (!this._windowKey) {
          return;
        }
        const root = this.get_root && this.get_root();
        if (root && root.remove_controller) {
          root.remove_controller(this._windowKey);
        }
        this._windowKey = null;
      }

      _showModifierPreview(mods) {
        mods &= Gtk.accelerator_get_default_mod_mask();
        if (!mods) {
          this.label = _('New accelerator…');
          return;
        }
        const label = Gtk.accelerator_get_label(0, mods);
        this.label = label ? `${label}+…` : _('New accelerator…');
      }

      _onKeyPressed(keyval, keycode, state) {
        let mods = state & Gtk.accelerator_get_default_mod_mask();
        let keyvalLower = Gdk.keyval_to_lower(keyval);
        if (keyvalLower === Gdk.KEY_ISO_Left_Tab) {
          keyvalLower = Gdk.KEY_Tab;
        }
        if (keyvalLower !== keyval) {
          mods |= Gdk.ModifierType.SHIFT_MASK;
        }
        mods &= ~Gdk.ModifierType.LOCK_MASK;
        mods |= modifierMaskForKey(Gdk, keyvalLower);

        if (isModifierKey(Gdk, keyvalLower)) {
          this._showModifierPreview(mods);
          return Gdk.EVENT_STOP;
        }

        if (mods === 0 && keyvalLower === Gdk.KEY_Escape) {
          this._stopCapture();
          return Gdk.EVENT_STOP;
        }

        if (
          mods === 0 &&
          (keyvalLower === Gdk.KEY_BackSpace || keyvalLower === Gdk.KEY_Delete)
        ) {
          this._settings.set_strv(this._id, []);
          this._stopCapture();
          return Gdk.EVENT_STOP;
        }

        if (
          isDeadKey(Gdk, keyvalLower) ||
          !isUsableShortcut(Gdk, keyvalLower, mods)
        ) {
          this._showModifierPreview(mods);
          return Gdk.EVENT_STOP;
        }

        let accel = Gtk.accelerator_name(keyvalLower, mods);
        if (!accel) {
          accel = Gtk.accelerator_name_with_keycode(
            null,
            keyvalLower,
            keycode,
            mods,
          );
        }
        if (accel) {
          this._settings.set_strv(this._id, [accel]);
        }
        this._stopCapture();
        return Gdk.EVENT_STOP;
      }

      _updateLabel() {
        const accel = this._settings.get_strv(this._id)[0];
        if (!accel) {
          this.label = _('Disabled');
          return;
        }
        const [, key, mods] = Gtk.accelerator_parse(accel);
        this.label = Gtk.accelerator_get_label(key, mods) || accel;
      }
    },
  );

  return ShortcutButton;
}

function isModifierKey(Gdk, keyval) {
  return modifierMaskForKey(Gdk, keyval) !== 0;
}

function modifierMaskForKey(Gdk, keyval) {
  if (keyval === Gdk.KEY_Control_L || keyval === Gdk.KEY_Control_R) {
    return Gdk.ModifierType.CONTROL_MASK;
  }
  if (keyval === Gdk.KEY_Shift_L || keyval === Gdk.KEY_Shift_R) {
    return Gdk.ModifierType.SHIFT_MASK;
  }
  if (keyval === Gdk.KEY_Alt_L || keyval === Gdk.KEY_Alt_R) {
    return Gdk.ModifierType.ALT_MASK;
  }
  if (
    keyval === Gdk.KEY_Super_L ||
    keyval === Gdk.KEY_Super_R ||
    keyval === Gdk.KEY_Meta_L ||
    keyval === Gdk.KEY_Meta_R ||
    keyval === Gdk.KEY_Hyper_L ||
    keyval === Gdk.KEY_Hyper_R
  ) {
    return Gdk.ModifierType.SUPER_MASK;
  }
  if (
    keyval === Gdk.KEY_ISO_Level3_Shift ||
    keyval === Gdk.KEY_ISO_Level5_Shift
  ) {
    return 0;
  }
  return 0;
}

function isDeadKey(Gdk, keyval) {
  const name = Gdk.keyval_name(keyval);
  return name ? name.startsWith('dead_') : false;
}

function isUsableShortcut(Gdk, keyval, mods) {
  if (keyval === 0) {
    return false;
  }
  const onlyShift = mods === 0 || mods === Gdk.ModifierType.SHIFT_MASK;
  if (onlyShift && isBareKey(Gdk, keyval)) {
    return false;
  }
  return true;
}

function isBareKey(Gdk, keyval) {
  return (
    (keyval >= Gdk.KEY_a && keyval <= Gdk.KEY_z) ||
    (keyval >= Gdk.KEY_A && keyval <= Gdk.KEY_Z) ||
    (keyval >= Gdk.KEY_0 && keyval <= Gdk.KEY_9) ||
    keyval === Gdk.KEY_space
  );
}
