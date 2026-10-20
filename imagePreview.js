import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as DS from './dataStructures.js';

const PREVIEW_MAX_WIDTH = 560;
const PREVIEW_MAX_HEIGHT = 460;
const SHOW_DELAY_MS = 50;
const HIDE_DELAY_MS = 80;

export class ImagePreview {
  constructor() {
    this._showTimerId = null;
    this._hideTimerId = null;
    this._currentEntry = null;
    this._currentMenuItem = null;
    this._menuActor = null;

    this._buildUI();
  }

  _buildUI() {
    this._previewBox = new St.BoxLayout({
      style_class: 'ci-image-preview-popup',
      vertical: true,
      reactive: false,
      can_focus: false,
      visible: false,
    });

    // Header: Icon, Title & Format Badge
    const headerBox = new St.BoxLayout({
      style_class: 'ci-preview-header',
      vertical: false,
    });

    const headerIcon = new St.Icon({
      icon_name: 'image-x-generic-symbolic',
      style_class: 'ci-preview-header-icon',
      icon_size: 16,
      y_align: Clutter.ActorAlign.CENTER,
    });
    headerBox.add_child(headerIcon);

    this._titleLabel = new St.Label({
      text: _('Image Preview'),
      style_class: 'ci-preview-title',
      y_align: Clutter.ActorAlign.CENTER,
    });
    headerBox.add_child(this._titleLabel);

    this._badgeLabel = new St.Label({
      text: 'PNG',
      style_class: 'ci-preview-badge',
      x_expand: true,
      x_align: Clutter.ActorAlign.END,
      y_align: Clutter.ActorAlign.CENTER,
    });
    headerBox.add_child(this._badgeLabel);

    this._previewBox.add_child(headerBox);

    // Image Area
    this._imageContainer = new St.BoxLayout({
      style_class: 'ci-preview-image-box',
      vertical: false,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._previewBox.add_child(this._imageContainer);

    // Metadata Row: Dimensions, Size, Timestamp
    this._metaBox = new St.BoxLayout({
      style_class: 'ci-preview-meta-row',
      vertical: false,
    });

    this._dimPill = new St.Label({
      style_class: 'ci-preview-meta-pill',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._metaBox.add_child(this._dimPill);

    this._sizePill = new St.Label({
      style_class: 'ci-preview-meta-pill',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._metaBox.add_child(this._sizePill);

    this._timePill = new St.Label({
      style_class: 'ci-preview-meta-pill',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._metaBox.add_child(this._timePill);

    this._previewBox.add_child(this._metaBox);

    // Add directly to Shell's top-level UI layer
    Main.layoutManager.uiGroup.add_child(this._previewBox);
  }

  ensureMetadata(entry) {
    if (!entry || entry.type !== DS.TYPE_IMAGE || !entry.imagePath) {
      return;
    }
    if (!entry.imageWidth || !entry.imageHeight) {
      if (GLib.file_test(entry.imagePath, GLib.FileTest.EXISTS)) {
        try {
          const [info, w, h] = GdkPixbuf.Pixbuf.get_file_info(entry.imagePath);
          entry.imageWidth = w;
          entry.imageHeight = h;
          if (info) {
            entry.imageFormat = info.get_name().toUpperCase();
          }
        } catch (_) {}
      }
    }
    if (
      !entry.imageSize &&
      GLib.file_test(entry.imagePath, GLib.FileTest.EXISTS)
    ) {
      try {
        const fileInfo = Gio.File.new_for_path(entry.imagePath).query_info(
          'standard::size',
          Gio.FileQueryInfoFlags.NONE,
          null,
        );
        entry.imageSize = fileInfo.get_size();
      } catch (_) {}
    }
  }

  show(entry, menuItem, menuActor) {
    if (!entry || entry.type !== DS.TYPE_IMAGE || !entry.imagePath) {
      this.hideImmediate();
      return;
    }

    this._cancelHideTimer();
    this._currentEntry = entry;
    this._currentMenuItem = menuItem;
    this._menuActor = menuActor;

    this.ensureMetadata(entry);

    if (this._previewBox.visible) {
      this._cancelShowTimer();
      this._render(entry, menuItem, menuActor);
    } else {
      if (this._showTimerId) {
        GLib.source_remove(this._showTimerId);
      }
      this._showTimerId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        SHOW_DELAY_MS,
        () => {
          this._showTimerId = null;
          if (this._currentEntry === entry) {
            this._render(entry, menuItem, menuActor);
          }
          return GLib.SOURCE_REMOVE;
        },
      );
    }
  }

  _render(entry, menuItem, menuActor) {
    if (
      !entry.imagePath ||
      !GLib.file_test(entry.imagePath, GLib.FileTest.EXISTS)
    ) {
      this.hideImmediate();
      return;
    }

    const format =
      entry.imageFormat ||
      (entry.imageFileName &&
      (entry.imageFileName.endsWith('.jpg') ||
        entry.imageFileName.endsWith('.jpeg'))
        ? 'JPEG'
        : 'PNG');
    this._badgeLabel.set_text(format);

    this._imageContainer.destroy_all_children();

    const monitor = Main.layoutManager.primaryMonitor;
    const maxW = Math.min(PREVIEW_MAX_WIDTH, Math.round(monitor.width * 0.45));
    const maxH = Math.min(
      PREVIEW_MAX_HEIGHT,
      Math.round(monitor.height * 0.55),
    );

    const imgW = entry.imageWidth || 0;
    const imgH = entry.imageHeight || 0;

    let iconSize = maxW;
    if (imgW > 0 && imgH > 0) {
      const scale = Math.min(maxW / imgW, maxH / imgH, 1.0);
      const targetW = Math.max(160, Math.round(imgW * scale));
      const targetH = Math.max(100, Math.round(imgH * scale));
      iconSize = Math.max(targetW, targetH);
    }

    const file = Gio.File.new_for_path(entry.imagePath);
    const icon = new St.Icon({
      gicon: Gio.FileIcon.new(file),
      icon_size: iconSize,
      style_class: 'ci-preview-large-image',
    });
    this._imageContainer.add_child(icon);

    const itemActor = menuItem.actor || menuItem;
    if (!itemActor.is_mapped()) {
      this.hideImmediate();
      return;
    }

    if (entry.imageWidth && entry.imageHeight) {
      this._dimPill.set_text(`${entry.imageWidth} × ${entry.imageHeight}`);
      this._dimPill.show();
    } else {
      this._dimPill.hide();
    }

    const sizeStr = this._formatFileSize(entry.imageSize);
    if (sizeStr) {
      this._sizePill.set_text(sizeStr);
      this._sizePill.show();
    } else {
      this._sizePill.hide();
    }

    if (entry.timestamp) {
      const h = String(entry.timestamp.getHours()).padStart(2, '0');
      const m = String(entry.timestamp.getMinutes()).padStart(2, '0');
      this._timePill.set_text(`${h}:${m}`);
      this._timePill.show();
    } else {
      this._timePill.hide();
    }

    this._updatePosition(menuItem, menuActor);
    this._previewBox.show();
  }

  _updatePosition(menuItem, menuActor) {
    if (!menuItem || !menuActor) {
      return;
    }

    const itemActor = menuItem.actor || menuItem;
    if (!itemActor.is_mapped()) {
      return;
    }

    const monitor = Main.layoutManager.primaryMonitor;
    const [menuX] = menuActor.get_transformed_position();
    const menuW = menuActor.width;

    const [, natW] = this._previewBox.get_preferred_width(-1);
    const previewW =
      this._previewBox.width > 0 ? this._previewBox.width : natW || 560;
    const [, natH] = this._previewBox.get_preferred_height(previewW);
    const previewH =
      this._previewBox.height > 0 ? this._previewBox.height : natH || 400;

    const gap = 16;
    let posX = menuX + menuW + gap;
    if (posX + previewW > monitor.x + monitor.width - 12) {
      posX = menuX - previewW - gap;
    }
    posX = Math.max(
      monitor.x + 12,
      Math.min(posX, monitor.x + monitor.width - previewW - 12),
    );

    const [, itemY] = itemActor.get_transformed_position();
    const itemH = itemActor.height || 40;

    let targetY = itemY + itemH / 2 - previewH / 2;
    const minY = monitor.y + 16;
    const maxY = monitor.y + monitor.height - previewH - 16;
    const posY = Math.max(minY, Math.min(targetY, maxY));

    this._previewBox.set_position(Math.round(posX), Math.round(posY));
  }

  onScroll(scrollView) {
    if (
      !this._previewBox.visible ||
      !this._currentMenuItem ||
      !this._menuActor
    ) {
      return;
    }
    const itemActor = this._currentMenuItem.actor || this._currentMenuItem;
    if (!itemActor.is_mapped()) {
      this.hideImmediate();
      return;
    }

    if (scrollView) {
      try {
        const [, itemY] = itemActor.get_transformed_position();
        const [, scrollY] = scrollView.get_transformed_position();
        const scrollH = scrollView.height;
        if (itemY < scrollY - 20 || itemY > scrollY + scrollH + 20) {
          this.hideImmediate();
          return;
        }
      } catch (_) {
        this.hideImmediate();
        return;
      }
    }
    this._updatePosition(this._currentMenuItem, this._menuActor);
  }

  scheduleHide() {
    this._cancelShowTimer();
    if (this._hideTimerId) {
      GLib.source_remove(this._hideTimerId);
    }
    this._hideTimerId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      HIDE_DELAY_MS,
      () => {
        this._hideTimerId = null;
        this.hideImmediate();
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  hideImmediate() {
    this._cancelTimers();
    this._currentEntry = null;
    this._currentMenuItem = null;
    if (this._previewBox && this._previewBox.visible) {
      this._previewBox.hide();
    }
  }

  _cancelShowTimer() {
    if (this._showTimerId) {
      GLib.source_remove(this._showTimerId);
      this._showTimerId = null;
    }
  }

  _cancelHideTimer() {
    if (this._hideTimerId) {
      GLib.source_remove(this._hideTimerId);
      this._hideTimerId = null;
    }
  }

  _cancelTimers() {
    this._cancelShowTimer();
    this._cancelHideTimer();
  }

  _formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  destroy() {
    this._cancelTimers();
    if (this._previewBox) {
      this._previewBox.destroy();
      this._previewBox = null;
    }
    this._currentEntry = null;
    this._currentMenuItem = null;
    this._menuActor = null;
  }
}
