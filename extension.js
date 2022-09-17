'use strict';

const { Clutter, Meta, Shell, St, GObject } = imports.gi;
const Mainloop = imports.mainloop;
const MessageTray = imports.ui.messageTray;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext;

const Clipboard = St.Clipboard.get_default();
const VirtualKeyboard = (() => {
  let VirtualKeyboard;
  return () => {
    if (!VirtualKeyboard) {
      VirtualKeyboard = Clutter.get_default_backend()
        .get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }
    return VirtualKeyboard;
  };
})();

const SETTING_KEY_CLEAR_HISTORY = 'clear-history';
const SETTING_KEY_PREV_ENTRY = 'prev-entry';
const SETTING_KEY_NEXT_ENTRY = 'next-entry';
const SETTING_KEY_TOGGLE_MENU = 'toggle-menu';
const SETTING_KEY_PRIVATE_MODE = 'toggle-private-mode';
const INDICATOR_ICON = 'edit-paste-symbolic';

const PAGE_SIZE = 50;
const MAX_VISIBLE_CHARS = 200;

const Util = imports.misc.util;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Store = Me.imports.store;
const DS = Me.imports.dataStructures;
const ConfirmDialog = Me.imports.confirmDialog;
const Prefs = Me.imports.prefs;

const IndicatorName = `${Me.metadata.name} Indicator`;
const _ = Gettext.domain(Me.uuid).gettext;

let MAX_REGISTRY_LENGTH;
let MAX_BYTES;
let WINDOW_WIDTH_PERCENTAGE;
let CACHE_ONLY_FAVORITES;
let MOVE_ITEM_FIRST;
let ENABLE_KEYBINDING;
let PRIVATE_MODE;
let NOTIFY_ON_COPY;
let CONFIRM_ON_CLEAR;
let MAX_TOPBAR_LENGTH;
let TOPBAR_DISPLAY_MODE; // 0 - only icon, 1 - only clipboard content, 2 - both, 3 - none
let DISABLE_DOWN_ARROW;
let STRIP_TEXT;
let PASTE_ON_SELECTION;
let PROCESS_PRIMARY_SELECTION;

class ClipboardIndicator extends PanelMenu.Button {
  _init() {
    super._init(0, IndicatorName, false);

    this._shortcutsBindingIds = [];

    const hbox = new St.BoxLayout({
      style_class: 'panel-status-menu-box clipboard-indicator-hbox',
    });
    this.icon = new St.Icon({
      icon_name: INDICATOR_ICON,
      style_class: 'system-status-icon clipboard-indicator-icon',
    });
    hbox.add_child(this.icon);
    this._buttonText = new St.Label({
      text: '',
      y_align: Clutter.ActorAlign.CENTER,
    });
    hbox.add_child(this._buttonText);
    this._downArrow = PopupMenu.arrowIcon(St.Side.BOTTOM);
    hbox.add(this._downArrow);
    this.add_child(hbox);

    this._fetchSettings();
    this._buildMenu();
    this._updateTopbarLayout();
  }

  destroy() {
    this._disconnectSettings();
    this._unbindShortcuts();
    this._disconnectSelectionListener();

    if (this._searchFocusHackCallbackId) {
      Mainloop.source_remove(this._searchFocusHackCallbackId);
      this._searchFocusHackCallbackId = undefined;
    }
    if (this._pasteHackCallbackId) {
      Mainloop.source_remove(this._pasteHackCallbackId);
      this._pasteHackCallbackId = undefined;
    }

    super.destroy();
  }

  _buildMenu() {
    this.searchEntry = new St.Entry({
      name: 'searchEntry',
      style_class: 'search-entry',
      can_focus: true,
      hint_text: _('Search clipboard history…'),
      track_hover: true,
      x_expand: true,
      y_expand: true,
    });

    const entryItem = new PopupMenu.PopupBaseMenuItem({
      style_class: 'ci-history-search-section',
      reactive: false,
      can_focus: false,
    });
    entryItem.add(this.searchEntry);
    this.menu.addMenuItem(entryItem);

    this.menu.connect('open-state-changed', (self, open) => {
      if (open) {
        this._setMenuWidth();
        this.searchEntry.set_text('');
        this._searchFocusHackCallbackId = Mainloop.timeout_add(1, () => {
          global.stage.set_key_focus(this.searchEntry);
          this._searchFocusHackCallbackId = undefined;
          return false;
        });
      }
    });

    // Create menu sections for items
    // Favorites
    this.favoritesSection = new PopupMenu.PopupMenuSection();

    this.scrollViewFavoritesMenuSection = new PopupMenu.PopupMenuSection();
    const favoritesScrollView = new St.ScrollView({
      style_class: 'ci-history-menu-section',
      overlay_scrollbars: true,
    });
    favoritesScrollView.add_actor(this.favoritesSection.actor);

    this.scrollViewFavoritesMenuSection.actor.add_actor(favoritesScrollView);
    this.menu.addMenuItem(this.scrollViewFavoritesMenuSection);
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // History
    this.historySection = new PopupMenu.PopupMenuSection();

    this.scrollViewMenuSection = new PopupMenu.PopupMenuSection();
    this.historyScrollView = new St.ScrollView({
      style_class: 'ci-history-menu-section',
      overlay_scrollbars: true,
    });
    this.historyScrollView.add_actor(this.historySection.actor);

    this.scrollViewMenuSection.actor.add_actor(this.historyScrollView);

    this.menu.addMenuItem(this.scrollViewMenuSection);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const actionsSection = new PopupMenu.PopupMenuSection();
    const actionsBox = new St.BoxLayout({
      style_class: 'ci-history-actions-section',
      vertical: false,
    });

    actionsSection.actor.add(actionsBox);
    this.menu.addMenuItem(actionsSection);

    const prevPage = new PopupMenu.PopupBaseMenuItem();
    prevPage.add_child(
      new St.Icon({
        icon_name: 'go-previous-symbolic',
        style_class: 'popup-menu-icon',
      }),
    );
    prevPage.connect('activate', this._navigatePrevPage.bind(this));
    actionsBox.add(prevPage);

    const nextPage = new PopupMenu.PopupBaseMenuItem();
    nextPage.add_child(
      new St.Icon({
        icon_name: 'go-next-symbolic',
        style_class: 'popup-menu-icon',
      }),
    );
    nextPage.connect('activate', this._navigateNextPage.bind(this));
    actionsBox.add(nextPage);

    actionsBox.add(new St.BoxLayout({ x_expand: true }));

    this.privateModeMenuItem = new PopupMenu.PopupSwitchMenuItem(
      _('Private mode'),
      PRIVATE_MODE,
      { reactive: true },
    );
    this.privateModeMenuItem.connect('toggled', () => {
      Prefs.Settings.set_boolean(
        Prefs.Fields.PRIVATE_MODE,
        this.privateModeMenuItem.state,
      );
    });
    actionsBox.add(this.privateModeMenuItem);
    this._updatePrivateModeState();

    const clearMenuItem = new PopupMenu.PopupBaseMenuItem();
    clearMenuItem.add_child(
      new St.Icon({
        icon_name: 'edit-delete-symbolic',
        style_class: 'popup-menu-icon',
      }),
    );
    actionsBox.add(clearMenuItem);

    const settingsMenuItem = new PopupMenu.PopupBaseMenuItem();
    settingsMenuItem.add_child(
      new St.Icon({
        icon_name: 'emblem-system-symbolic',
        style_class: 'popup-menu-icon',
      }),
    );
    settingsMenuItem.connect('activate', this._openSettings.bind(this));
    actionsBox.add(settingsMenuItem);

    if (ENABLE_KEYBINDING) {
      this._bindShortcuts();
    }
    this.menu.actor.connect('key-press-event', (_, event) =>
      this._handleGlobalKeyEvent(event),
    );

    Store.buildClipboardStateFromLog((entries, favoriteEntries, nextId) => {
      /**
       * This field stores the number of items in the historySection to avoid calling _getMenuItems
       * since that method is slow.
       */
      this.activeHistoryMenuItems = 0;
      /**
       * These two IDs are extremely important: making a mistake with either one breaks the
       * extension. Both IDs are globally unique within compaction intervals. The normal ID is
       * *always* present and valid -- it allows us to build an inverted index so we can find
       * previously copied items in O(1) time. The Disk ID is only present when we cache all
       * entries. This additional complexity is needed to know what the ID of an item is on disk as
       * compared to in memory when we're only caching favorites.
       */
      this.nextDiskId = this.nextId = nextId;
      /**
       * DS.LinkedList is the actual clipboard history and source of truth. Never use historySection
       * or favoritesSection as the source of truth as these may get outdated during pagination.
       *
       * Entries *may* have a menuItem attached, meaning they are currently visible. On the other
       * hand, menu items must always have an entry attached.
       */
      this.entries = entries;
      this.favoriteEntries = favoriteEntries;

      this.currentlySelectedEntry = entries.last();
      this._restoreFavoritedEntries();
      this._maybeRestoreMenuPages();

      this._settingsChangedId = Prefs.Settings.connect(
        'changed',
        this._onSettingsChange.bind(this),
      );

      this.searchEntry
        .get_clutter_text()
        .connect('text-changed', this._onSearchTextChanged.bind(this));
      clearMenuItem.connect('activate', this._removeAll.bind(this));

      this._setupSelectionChangeListener();
    });
  }

  _setMenuWidth() {
    const display = global.display;
    const screen_width = display.get_monitor_geometry(
      display.get_primary_monitor(),
    ).width;

    this.menu.actor.width = screen_width * (WINDOW_WIDTH_PERCENTAGE / 100);
  }

  _handleGlobalKeyEvent(event) {
    this._handleCtrlSelectKeyEvent(event);
    this._handleSettingsKeyEvent(event);
    this._handleNavigationKeyEvent(event);
    this._handleFocusSearchKeyEvent(event);
  }

  _handleCtrlSelectKeyEvent(event) {
    if (!event.has_control_modifier()) {
      return;
    }

    const index = parseInt(event.get_key_unicode()); // Starts at 1
    if (isNaN(index) || index <= 0) {
      return;
    }

    const items =
      event.get_state() === 68 // Ctrl + Super
        ? this.favoritesSection._getMenuItems()
        : this.historySection._getMenuItems();
    if (index > items.length) {
      return;
    }

    this._onMenuItemSelectedAndMenuClose(items[index - 1]);
  }

  _handleSettingsKeyEvent(event) {
    if (event.get_state() !== 12 || event.get_key_unicode() !== 's') {
      return;
    }

    this._openSettings();
  }

  _handleNavigationKeyEvent(event) {
    if (!event.has_control_modifier()) {
      return;
    }

    if (event.get_key_unicode() === 'n') {
      this._navigateNextPage();
    } else if (event.get_key_unicode() === 'p') {
      this._navigatePrevPage();
    }
  }

  _handleFocusSearchKeyEvent(event) {
    if (event.get_key_unicode() !== '/') {
      return;
    }

    global.stage.set_key_focus(this.searchEntry);
  }

  _addEntry(entry, selectEntry, updateClipboard, insertIndex) {
    if (!entry.favorite && this.activeHistoryMenuItems >= PAGE_SIZE) {
      const items = this.historySection._getMenuItems();
      const item = items[items.length - 1];
      this._rewriteMenuItem(item, entry);
      this.historySection.moveMenuItem(item, 0);

      if (selectEntry) {
        this._selectEntry(entry, updateClipboard);
      }
      return;
    }

    const menuItem = new PopupMenu.PopupMenuItem('', { hover: false });

    menuItem.entry = entry;
    entry.menuItem = menuItem;

    menuItem.connect(
      'activate',
      this._onMenuItemSelectedAndMenuClose.bind(this),
    );
    menuItem.connect('key-press-event', (_, event) =>
      this._handleMenuItemKeyEvent(event, menuItem),
    );

    this._setEntryLabel(menuItem);

    // Favorite button
    const icon_name = entry.favorite
      ? 'starred-symbolic'
      : 'non-starred-symbolic';
    const iconfav = new St.Icon({
      icon_name: icon_name,
      style_class: 'system-status-icon',
    });

    const icofavBtn = new St.Button({
      style_class: 'ci-action-btn',
      can_focus: true,
      child: iconfav,
      x_align: Clutter.ActorAlign.END,
      x_expand: true,
      y_expand: true,
    });

    menuItem.actor.add_child(icofavBtn);
    icofavBtn.connect('clicked', () => {
      this._favoriteToggle(menuItem);
    });

    // Delete button
    const icon = new St.Icon({
      icon_name: 'edit-delete-symbolic',
      style_class: 'system-status-icon',
    });

    const icoBtn = new St.Button({
      style_class: 'ci-action-btn',
      can_focus: true,
      child: icon,
      x_align: Clutter.ActorAlign.END,
      x_expand: false,
      y_expand: true,
    });

    menuItem.actor.add_child(icoBtn);
    icoBtn.connect('clicked', () => {
      this._deleteEntryAndRestoreLatest(menuItem.entry);
    });

    menuItem.connect('destroy', () => {
      delete menuItem.entry.menuItem;
      if (!menuItem.entry.favorite) {
        this.activeHistoryMenuItems--;
      }
    });
    menuItem.connect('key-focus-in', () => {
      if (!menuItem.entry.favorite) {
        Util.ensureActorVisibleInScrollView(this.historyScrollView, menuItem);
      }
    });

    if (entry.favorite) {
      this.favoritesSection.addMenuItem(menuItem, insertIndex);
    } else {
      this.historySection.addMenuItem(menuItem, insertIndex);

      this.activeHistoryMenuItems++;
    }

    if (selectEntry) {
      this._selectEntry(entry, updateClipboard);
    }
  }

  _handleMenuItemKeyEvent(event, menuItem) {
    if (event.get_key_unicode() === 'f') {
      this._favoriteToggle(menuItem);
    }
  }

  _updateButtonText(entry) {
    if (
      !(TOPBAR_DISPLAY_MODE === 1 || TOPBAR_DISPLAY_MODE === 2) ||
      (entry && entry.type !== DS.TYPE_TEXT)
    ) {
      return;
    }

    if (PRIVATE_MODE) {
      this._buttonText.set_text('…');
    } else if (entry) {
      this._buttonText.set_text(this._truncated(entry.text, MAX_TOPBAR_LENGTH));
    } else {
      this._buttonText.set_text('');
    }
  }

  _setEntryLabel(menuItem) {
    const entry = menuItem.entry;
    if (entry.type === DS.TYPE_TEXT) {
      menuItem.label.set_text(this._truncated(entry.text, MAX_VISIBLE_CHARS));
    } else {
      throw new TypeError('Unknown type: ' + entry.type);
    }
  }

  _favoriteToggle(menuItem) {
    const entry = menuItem.entry;
    const wasSelected = this.currentlySelectedEntry?.id === entry.id;

    // Move to front (end of list)
    (entry.favorite ? this.entries : this.favoriteEntries).append(entry);
    this._removeEntry(entry);
    entry.favorite = !entry.favorite;
    this._addEntry(entry, wasSelected, true, 0);
    this._maybeRestoreMenuPages();
    global.stage.set_key_focus(entry.menuItem);

    if (CACHE_ONLY_FAVORITES) {
      if (entry.favorite) {
        entry.diskId = this.nextDiskId++;

        Store.storeTextEntry(entry.text);
        Store.updateFavoriteStatus(entry.diskId, true);
      } else {
        Store.deleteTextEntry(entry.diskId, true);
        delete entry.diskId;
      }
    } else {
      Store.updateFavoriteStatus(entry.diskId, entry.favorite);
    }
  }

  _removeAll() {
    if (CONFIRM_ON_CLEAR) {
      this._confirmRemoveAll();
    } else {
      this._clearHistory();
    }
  }

  _confirmRemoveAll() {
    const title = _('Clear all?');
    const message = _('Are you sure you want to delete all clipboard items?');
    const sub_message = _('This operation cannot be undone.');

    ConfirmDialog.openConfirmDialog(
      title,
      message,
      sub_message,
      _('Clear'),
      _('Cancel'),
      () => {
        this._clearHistory();
      },
    );
  }

  _clearHistory() {
    if (this.currentlySelectedEntry && !this.currentlySelectedEntry.favorite) {
      this._resetSelectedMenuItem();
    }

    // Favorites aren't touched when clearing history
    this.entries = new DS.LinkedList();
    this.historySection.removeAll();

    Store.resetDatabase(this._currentStateBuilder.bind(this));
  }

  _removeEntry(entry, fullyDelete) {
    if (fullyDelete) {
      entry.detach();

      if (entry.diskId) {
        Store.deleteTextEntry(entry.diskId, entry.favorite);
      }
    }

    if (entry.id === this.currentlySelectedEntry?.id) {
      this._resetSelectedMenuItem();
    }
    entry.menuItem?.destroy();
    if (fullyDelete) {
      this._maybeRestoreMenuPages();
    }
  }

  _pruneOldestEntries() {
    let entry = this.entries.head;
    while (
      entry &&
      (this.entries.length > MAX_REGISTRY_LENGTH ||
        this.entries.bytes > MAX_BYTES)
    ) {
      const next = entry.next;
      this._removeEntry(entry, true);
      entry = next;
    }

    Store.maybePerformLogCompaction(this._currentStateBuilder.bind(this));
  }

  _selectEntry(entry, updateClipboard, triggerPaste) {
    this.currentlySelectedEntry?.menuItem?.setOrnament(PopupMenu.Ornament.NONE);
    this.currentlySelectedEntry = entry;

    entry.menuItem?.setOrnament(PopupMenu.Ornament.DOT);
    this._updateButtonText(entry);
    if (updateClipboard !== false) {
      if (entry.type === DS.TYPE_TEXT) {
        this._setClipboardText(entry.text);
      } else {
        throw new TypeError('Unknown type: ' + entry.type);
      }

      if (PASTE_ON_SELECTION && triggerPaste) {
        this._triggerPasteHack();
      }
    }
  }

  _setClipboardText(text) {
    if (this._debouncing !== undefined) {
      this._debouncing++;
    }

    Clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
    Clipboard.set_text(St.ClipboardType.PRIMARY, text);
  }

  _triggerPasteHack() {
    this._pasteHackCallbackId = Mainloop.timeout_add(
      1, // Just post to the end of the event loop
      () => {
        const eventTime = Clutter.get_current_event_time() * 1000;
        VirtualKeyboard().notify_keyval(
          eventTime,
          Clutter.KEY_Shift_L,
          Clutter.KeyState.PRESSED,
        );
        VirtualKeyboard().notify_keyval(
          eventTime,
          Clutter.KEY_Insert,
          Clutter.KeyState.PRESSED,
        );
        VirtualKeyboard().notify_keyval(
          eventTime,
          Clutter.KEY_Insert,
          Clutter.KeyState.RELEASED,
        );
        VirtualKeyboard().notify_keyval(
          eventTime,
          Clutter.KEY_Shift_L,
          Clutter.KeyState.RELEASED,
        );

        this._pasteHackCallbackId = undefined;
        return false;
      },
    );
  }

  _onMenuItemSelectedAndMenuClose(menuItem) {
    this._moveEntryFirst(menuItem.entry);
    this._selectEntry(menuItem.entry, true, true);
    this.menu.close();
  }

  _resetSelectedMenuItem() {
    this.currentlySelectedEntry = undefined;
    this._updateButtonText();
    this._setClipboardText('');
  }

  _restoreFavoritedEntries() {
    for (let entry = this.favoriteEntries.last(); entry; entry = entry.prev) {
      this._addEntry(entry);
    }
  }

  _maybeRestoreMenuPages() {
    if (this.activeHistoryMenuItems > 0) {
      return;
    }

    for (
      let entry = this.entries.last();
      entry && this.activeHistoryMenuItems < PAGE_SIZE;
      entry = entry.prev
    ) {
      this._addEntry(entry, this.currentlySelectedEntry === entry);
    }
  }

  /**
   * Our pagination implementation is purposefully "broken." The idea is simply to do no unnecessary
   * work. As a consequence, if a user navigates to some page and then starts copying/moving items,
   * those items will appear on the currently visible page even though they don't belong there. This
   * could kind of be considered a feature since it means you can go back to some cluster of copied
   * items and start copying stuff from the same cluster and have it all show up together.
   *
   * Note that over time (as the user copies items), the page reclamation process will morph the
   * current page into the first page. This is the only way to make the user-visible state match our
   * backing store after changing pages.
   *
   * Also note that the use of `last` and `next` is correct. Menu items are ordered from latest to
   * oldest whereas `entries` is ordered from oldest to latest.
   */
  _navigatePrevPage() {
    if (this.searchEntryFront) {
      this.populateSearchResults(this.searchEntry.get_text(), false);
      return;
    }

    const items = this.historySection._getMenuItems();
    if (items.length === 0) {
      return;
    }

    const start = items[0].entry;
    for (
      let entry = start.nextCyclic(), i = items.length - 1;
      entry !== start && i >= 0;
      entry = entry.nextCyclic()
    ) {
      this._rewriteMenuItem(items[i--], entry);
    }
  }

  _navigateNextPage() {
    if (this.searchEntryFront) {
      this.populateSearchResults(this.searchEntry.get_text(), true);
      return;
    }

    const items = this.historySection._getMenuItems();
    if (items.length === 0) {
      return;
    }

    const start = items[items.length - 1].entry;
    for (
      let entry = start.prevCyclic(), i = 0;
      entry !== start && i < items.length;
      entry = entry.prevCyclic()
    ) {
      this._rewriteMenuItem(items[i++], entry);
    }
  }

  _rewriteMenuItem(item, entry) {
    if (item.entry.id === this.currentlySelectedEntry?.id) {
      item.setOrnament(PopupMenu.Ornament.NONE);
    }

    item.entry = entry;
    entry.menuItem = item;

    this._setEntryLabel(item);
    if (entry.id === this.currentlySelectedEntry?.id) {
      item.setOrnament(PopupMenu.Ornament.DOT);
    }
  }

  _onSearchTextChanged() {
    const query = this.searchEntry.get_text();

    if (!query) {
      this.historySection.removeAll();
      this.favoritesSection.removeAll();

      this.searchEntryFront = this.searchEntryBack = undefined;
      this._restoreFavoritedEntries();
      this._maybeRestoreMenuPages();
      return;
    }

    this.searchEntryFront = this.searchEntryBack = this.entries.last();
    this.populateSearchResults(query);
  }

  populateSearchResults(query, forward) {
    if (!this.searchEntryFront) {
      return;
    }

    this.historySection.removeAll();
    this.favoritesSection.removeAll();

    if (typeof forward !== 'boolean') {
      forward = true;
    }

    let searchExp;
    try {
      searchExp = new RegExp(query, 'i');
    } catch {}
    const start = forward ? this.searchEntryFront : this.searchEntryBack;
    let entry = start;

    while (this.activeHistoryMenuItems < PAGE_SIZE) {
      if (entry.type === DS.TYPE_TEXT) {
        let match = entry.text.indexOf(query);
        if (searchExp && match < 0) {
          match = entry.text.search(searchExp);
        }
        if (match >= 0) {
          this._addEntry(
            entry,
            entry === this.currentlySelectedEntry,
            false,
            forward ? undefined : 0,
          );
          entry.menuItem.label.set_text(
            this._truncated(
              entry.text,
              match - 40,
              match + MAX_VISIBLE_CHARS - 40,
            ),
          );
        }
      } else {
        throw new TypeError('Unknown type: ' + entry.type);
      }

      entry = forward ? entry.prevCyclic() : entry.nextCyclic();
      if (entry === start) {
        break;
      }
    }

    if (forward) {
      this.searchEntryBack = this.searchEntryFront.nextCyclic();
      this.searchEntryFront = entry;
    } else {
      this.searchEntryFront = this.searchEntryBack.prevCyclic();
      this.searchEntryBack = entry;
    }
  }

  _queryClipboard() {
    if (PRIVATE_MODE) {
      return;
    }

    Clipboard.get_text(St.ClipboardType.CLIPBOARD, (_, text) => {
      this._processClipboardContent(text);
    });
  }

  _queryPrimaryClipboard() {
    if (PRIVATE_MODE) {
      return;
    }

    Clipboard.get_text(St.ClipboardType.PRIMARY, (_, text) => {
      const last = this.entries.last();
      this._processClipboardContent(text);
      if (
        last &&
        text &&
        text.length > last.text.length &&
        (text.endsWith(last.text) || text.startsWith(last.text))
      ) {
        this._removeEntry(last, true);
      }
    });
  }

  _processClipboardContent(text) {
    if (this._debouncing > 0) {
      this._debouncing--;
      return;
    }

    if (STRIP_TEXT && text) {
      text = text.trim();
    }
    if (!text) {
      return;
    }

    let entry =
      this.entries.findTextItem(text) ||
      this.favoriteEntries.findTextItem(text);
    if (entry) {
      const isFirst =
        entry === this.entries.last() || entry === this.favoriteEntries.last();
      if (!isFirst) {
        this._moveEntryFirst(entry);
      }
      if (!isFirst || entry !== this.currentlySelectedEntry) {
        this._selectEntry(entry, false);
      }
    } else {
      entry = new DS.LLNode();
      entry.id = this.nextId++;
      entry.diskId = CACHE_ONLY_FAVORITES ? undefined : this.nextDiskId++;
      entry.type = DS.TYPE_TEXT;
      entry.text = text;
      entry.favorite = false;
      this.entries.append(entry);
      this._addEntry(entry, true, false, 0);

      if (!CACHE_ONLY_FAVORITES) {
        Store.storeTextEntry(text);
      }
      this._pruneOldestEntries();
    }

    if (NOTIFY_ON_COPY) {
      this._showNotification(_('Copied to clipboard'), null, (notif) => {
        notif.addAction(_('Cancel'), () =>
          this._deleteEntryAndRestoreLatest(this.currentlySelectedEntry),
        );
      });
    }
  }

  _moveEntryFirst(entry) {
    if (!MOVE_ITEM_FIRST) {
      return;
    }

    let menu;
    let entries;
    if (entry.favorite) {
      menu = this.favoritesSection;
      entries = this.favoriteEntries;
    } else {
      menu = this.historySection;
      entries = this.entries;
    }

    if (entry.menuItem) {
      menu.moveMenuItem(entry.menuItem, 0);
    } else {
      this._addEntry(entry, false, false, 0);
    }

    entries.append(entry);
    if (entry.diskId) {
      Store.moveEntryToEnd(entry.diskId);
    }
  }

  _currentStateBuilder() {
    const state = [];

    this.nextDiskId = 1;
    for (const entry of this.favoriteEntries) {
      entry.diskId = this.nextDiskId++;
      state.push(entry);
    }
    for (const entry of this.entries) {
      if (CACHE_ONLY_FAVORITES) {
        delete entry.diskId;
      } else {
        entry.diskId = this.nextDiskId++;
        state.push(entry);
      }
    }

    return state;
  }

  _setupSelectionChangeListener() {
    this._debouncing = 0;

    this.selection = Shell.Global.get().get_display().get_selection();
    this._selectionOwnerChangedId = this.selection.connect(
      'owner-changed',
      (_, selectionType) => {
        if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
          this._queryClipboard();
        } else if (
          PROCESS_PRIMARY_SELECTION &&
          selectionType === Meta.SelectionType.SELECTION_PRIMARY
        ) {
          this._queryPrimaryClipboard();
        }
      },
    );
  }

  _disconnectSelectionListener() {
    if (!this._selectionOwnerChangedId) {
      return;
    }

    this.selection.disconnect(this._selectionOwnerChangedId);
    this.selection = undefined;
    this._selectionOwnerChangedId = undefined;
  }

  _deleteEntryAndRestoreLatest(entry) {
    this._removeEntry(entry, true);

    if (!this.currentlySelectedEntry) {
      const nextEntry = this.entries.last();
      if (nextEntry) {
        this._selectEntry(nextEntry, true);
      }
    }
  }

  _initNotifSource() {
    if (this._notifSource) {
      return;
    }

    this._notifSource = new MessageTray.Source(Me.uuid, INDICATOR_ICON);
    this._notifSource.connect('destroy', () => {
      this._notifSource = undefined;
    });
    Main.messageTray.add(this._notifSource);
  }

  _showNotification(title, message, transformFn) {
    this._initNotifSource();

    let notification;
    if (this._notifSource.count === 0) {
      notification = new MessageTray.Notification(
        this._notifSource,
        title,
        message,
      );
    } else {
      notification = this._notifSource.notifications[0];
      notification.update(title, message, { clear: true });
    }

    if (typeof transformFn === 'function') {
      transformFn(notification);
    }

    notification.setTransient(true);
    this._notifSource.showNotification(notification);
  }

  _updatePrivateModeState() {
    // We hide the history in private mode because it will be out of sync
    // (selected item will not reflect clipboard)
    this.scrollViewMenuSection.actor.visible = !PRIVATE_MODE;
    this.scrollViewFavoritesMenuSection.actor.visible = !PRIVATE_MODE;

    if (PRIVATE_MODE) {
      this.icon.add_style_class_name('private-mode');
      this._updateButtonText();
    } else {
      this.icon.remove_style_class_name('private-mode');
      if (this.currentlySelectedEntry) {
        this._selectEntry(this.currentlySelectedEntry, true);
      } else {
        this._resetSelectedMenuItem();
      }
    }
  }

  _fetchSettings() {
    MAX_REGISTRY_LENGTH = Prefs.Settings.get_int(Prefs.Fields.HISTORY_SIZE);
    MAX_BYTES =
      (1 << 20) * Prefs.Settings.get_int(Prefs.Fields.CACHE_FILE_SIZE);
    WINDOW_WIDTH_PERCENTAGE = Prefs.Settings.get_int(
      Prefs.Fields.WINDOW_WIDTH_PERCENTAGE,
    );
    CACHE_ONLY_FAVORITES = Prefs.Settings.get_boolean(
      Prefs.Fields.CACHE_ONLY_FAVORITES,
    );
    MOVE_ITEM_FIRST = Prefs.Settings.get_boolean(Prefs.Fields.MOVE_ITEM_FIRST);
    NOTIFY_ON_COPY = Prefs.Settings.get_boolean(Prefs.Fields.NOTIFY_ON_COPY);
    CONFIRM_ON_CLEAR = Prefs.Settings.get_boolean(
      Prefs.Fields.CONFIRM_ON_CLEAR,
    );
    ENABLE_KEYBINDING = Prefs.Settings.get_boolean(
      Prefs.Fields.ENABLE_KEYBINDING,
    );
    MAX_TOPBAR_LENGTH = Prefs.Settings.get_int(
      Prefs.Fields.TOPBAR_PREVIEW_SIZE,
    );
    TOPBAR_DISPLAY_MODE = Prefs.Settings.get_int(
      Prefs.Fields.TOPBAR_DISPLAY_MODE_ID,
    );
    DISABLE_DOWN_ARROW = Prefs.Settings.get_boolean(
      Prefs.Fields.DISABLE_DOWN_ARROW,
    );
    STRIP_TEXT = Prefs.Settings.get_boolean(Prefs.Fields.STRIP_TEXT);
    PRIVATE_MODE = Prefs.Settings.get_boolean(Prefs.Fields.PRIVATE_MODE);
    PASTE_ON_SELECTION = Prefs.Settings.get_boolean(
      Prefs.Fields.PASTE_ON_SELECTION,
    );
    PROCESS_PRIMARY_SELECTION = Prefs.Settings.get_boolean(
      Prefs.Fields.PROCESS_PRIMARY_SELECTION,
    );
  }

  _onSettingsChange() {
    const prevCacheOnlyFavorites = CACHE_ONLY_FAVORITES;
    const prevPrivateMode = PRIVATE_MODE;

    this._fetchSettings();

    if (
      prevCacheOnlyFavorites !== undefined &&
      CACHE_ONLY_FAVORITES !== prevCacheOnlyFavorites
    ) {
      if (CACHE_ONLY_FAVORITES) {
        Store.resetDatabase(this._currentStateBuilder.bind(this));
      } else {
        for (const entry of this.entries) {
          entry.diskId = this.nextDiskId++;
          Store.storeTextEntry(entry.text);
        }
      }
    }

    if (prevPrivateMode !== undefined && PRIVATE_MODE !== prevPrivateMode) {
      this._updatePrivateModeState();
    }

    // Remove old entries in case the registry size changed
    this._pruneOldestEntries();

    // Re-set menu-items labels in case preview size changed
    const resetLabel = (item) => this._setEntryLabel(item);
    this.favoritesSection._getMenuItems().forEach(resetLabel);
    this.historySection._getMenuItems().forEach(resetLabel);

    this._updateTopbarLayout();
    if (this.currentlySelectedEntry) {
      this._updateButtonText(this.currentlySelectedEntry);
    }
    this._setMenuWidth();

    if (ENABLE_KEYBINDING) {
      this._bindShortcuts();
    } else {
      this._unbindShortcuts();
    }
  }

  _bindShortcuts() {
    this._unbindShortcuts();
    this._bindShortcut(SETTING_KEY_CLEAR_HISTORY, () => {
      if (this.entries) {
        this._removeAll();
      }
    });
    this._bindShortcut(SETTING_KEY_PREV_ENTRY, () => {
      if (this.entries) {
        this._previousEntry();
      }
    });
    this._bindShortcut(SETTING_KEY_NEXT_ENTRY, () => {
      if (this.entries) {
        this._nextEntry();
      }
    });
    this._bindShortcut(SETTING_KEY_TOGGLE_MENU, () => this.menu.toggle());
    this._bindShortcut(SETTING_KEY_PRIVATE_MODE, () =>
      this.privateModeMenuItem.toggle(),
    );
  }

  _unbindShortcuts() {
    this._shortcutsBindingIds.forEach((id) => Main.wm.removeKeybinding(id));

    this._shortcutsBindingIds = [];
  }

  _bindShortcut(name, cb) {
    const ModeType = Shell.hasOwnProperty('ActionMode')
      ? Shell.ActionMode
      : Shell.KeyBindingMode;

    Main.wm.addKeybinding(
      name,
      Prefs.Settings,
      Meta.KeyBindingFlags.NONE,
      ModeType.ALL,
      cb.bind(this),
    );

    this._shortcutsBindingIds.push(name);
  }

  _updateTopbarLayout() {
    if (TOPBAR_DISPLAY_MODE === 3) {
      this.icon.visible = false;
      this._buttonText.visible = false;

      this._style_class = this.style_class;
      this.style_class = '';
    } else if (this._style_class) {
      this.style_class = this._style_class;
    }

    if (TOPBAR_DISPLAY_MODE === 0) {
      this.icon.visible = true;
      this._buttonText.visible = false;
    }
    if (TOPBAR_DISPLAY_MODE === 1) {
      this.icon.visible = false;
      this._buttonText.visible = true;
    }
    if (TOPBAR_DISPLAY_MODE === 2) {
      this.icon.visible = true;
      this._buttonText.visible = true;
    }
    this._downArrow.visible = !DISABLE_DOWN_ARROW;
  }

  _disconnectSettings() {
    if (!this._settingsChangedId) {
      return;
    }

    Prefs.Settings.disconnect(this._settingsChangedId);
    this._settingsChangedId = undefined;
  }

  _openSettings() {
    ExtensionUtils.openPrefs();
    this.menu.close();
  }

  _previousEntry() {
    this._selectNextPrevEntry(
      this.currentlySelectedEntry.nextCyclic() || this.entries.head,
    );
  }

  _nextEntry() {
    this._selectNextPrevEntry(
      this.currentlySelectedEntry.prevCyclic() || this.entries.last(),
    );
  }

  _selectNextPrevEntry(entry) {
    if (!entry) {
      return;
    }

    this._selectEntry(entry, true);
    if (entry.type === DS.TYPE_TEXT) {
      this._showNotification(_('Copied'), entry.text);
    }
  }

  _truncated(s, start, end) {
    if (start < 0) {
      start = 0;
    }
    if (!end) {
      end = start;
      start = 0;
    }
    if (end > s.length) {
      end = s.length;
    }

    const includesStart = start === 0;
    const includesEnd = end === s.length;
    const isMiddle = !includesStart && !includesEnd;
    const length = end - start;
    const overflow = s.length > length;

    // Reduce regex search space. If the string is mostly whitespace,
    // we might end up removing too many characters, but oh well.
    s = s.substring(start, end + 100);

    // Remove new lines and extra spaces so the text fits nicely on one line
    s = s.replace(/\s+/g, ' ').trim();

    if (includesStart && overflow) {
      s = s.substring(0, length - 1) + '…';
    }
    if (includesEnd && overflow) {
      s = '…' + s.substring(1, length);
    }
    if (isMiddle) {
      s = '…' + s.substring(1, length - 1) + '…';
    }

    return s;
  }
}

const ClipboardIndicatorObj = GObject.registerClass(ClipboardIndicator);

function init() {
  ExtensionUtils.initTranslations(Me.uuid);
}

let clipboardIndicator;

function enable() {
  if (clipboardIndicator) {
    return;
  }

  Store.init();

  clipboardIndicator = new ClipboardIndicatorObj();
  Main.panel.addToStatusArea(IndicatorName, clipboardIndicator, 1);
}

function disable() {
  clipboardIndicator.destroy();
  clipboardIndicator = undefined;

  Store.destroy();
}
