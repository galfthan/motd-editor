// The editor's interface around the canvas: top bar, tool dock, inspector,
// colours, zoom and rulers, menus, dialogs and the command palette (⌘K)

// Additional Symbols for Legacy Computing characters (U+1FB70-U+1FBFA)
// Grouped by category for the character palette tabs
const LEGACY_CHARS = {
    blocks: [
        [0x2588, 'Full Block'], [0x2580, 'Upper Half Block'],
        [0x2584, 'Lower Half Block'], [0x258C, 'Left Half Block'],
        [0x2590, 'Right Half Block'], [0x2591, 'Light Shade'],
        [0x2592, 'Medium Shade'], [0x2593, 'Dark Shade'],
        [0x1FB70, 'Vertical 1/8 Block-2'], [0x1FB71, 'Vertical 1/8 Block-3'],
        [0x1FB72, 'Vertical 1/8 Block-4'], [0x1FB73, 'Vertical 1/8 Block-5'],
        [0x1FB74, 'Vertical 1/8 Block-6'], [0x1FB75, 'Vertical 1/8 Block-7'],
        [0x1FB76, 'Horizontal 1/8 Block-2'], [0x1FB77, 'Horizontal 1/8 Block-3'],
        [0x1FB78, 'Horizontal 1/8 Block-4'], [0x1FB79, 'Horizontal 1/8 Block-5'],
        [0x1FB7A, 'Horizontal 1/8 Block-6'], [0x1FB7B, 'Horizontal 1/8 Block-7'],
        [0x1FB7C, 'Left+Lower 1/8 Block'], [0x1FB7D, 'Left+Upper 1/8 Block'],
        [0x1FB7E, 'Right+Upper 1/8 Block'], [0x1FB7F, 'Right+Lower 1/8 Block'],
        [0x1FB80, 'Upper+Lower 1/8 Block'], [0x1FB81, 'Horizontal 1/8 Block-1358'],
        [0x1FB82, 'Upper 1/4 Block'], [0x1FB83, 'Upper 3/8 Block'],
        [0x1FB84, 'Upper 5/8 Block'], [0x1FB85, 'Upper 3/4 Block'],
        [0x1FB86, 'Upper 7/8 Block'], [0x1FB87, 'Right 1/4 Block'],
        [0x1FB88, 'Right 3/8 Block'], [0x1FB89, 'Right 5/8 Block'],
        [0x1FB8A, 'Right 3/4 Block'], [0x1FB8B, 'Right 7/8 Block'],
        [0x1FBCE, 'Left 2/3 Block'], [0x1FBCF, 'Left 1/3 Block'],
        [0x1FBE4, 'Upper Centre 1/4 Block'], [0x1FBE5, 'Lower Centre 1/4 Block'],
        [0x1FBE6, 'Middle Left 1/4 Block'], [0x1FBE7, 'Middle Right 1/4 Block'],
    ],
    shades: [
        [0x1FB8C, 'Left Half Medium Shade'], [0x1FB8D, 'Right Half Medium Shade'],
        [0x1FB8E, 'Upper Half Medium Shade'], [0x1FB8F, 'Lower Half Medium Shade'],
        [0x1FB90, 'Inverse Medium Shade'],
        [0x1FB91, 'Upper Half Block+Lower Inverse Shade'],
        [0x1FB92, 'Upper Inverse Shade+Lower Half Block'],
        [0x1FB94, 'Left Inverse Shade+Right Half Block'],
        [0x1FB95, 'Checkerboard Fill'], [0x1FB96, 'Inverse Checkerboard Fill'],
        [0x1FB97, 'Heavy Horizontal Fill'],
        [0x1FB98, 'UL to LR Fill'], [0x1FB99, 'UR to LL Fill'],
        [0x1FB9A, 'Upper+Lower Triangular Half Block'],
        [0x1FB9B, 'Left+Right Triangular Half Block'],
        [0x1FB9C, 'UL Triangular Medium Shade'],
        [0x1FB9D, 'UR Triangular Medium Shade'],
        [0x1FB9E, 'LR Triangular Medium Shade'],
        [0x1FB9F, 'LL Triangular Medium Shade'],
    ],
    lines: [
        [0x1FBA0, 'Diag Upper Centre to Middle Left'],
        [0x1FBA1, 'Diag Upper Centre to Middle Right'],
        [0x1FBA2, 'Diag Middle Left to Lower Centre'],
        [0x1FBA3, 'Diag Middle Right to Lower Centre'],
        [0x1FBA4, 'Diag UC-ML-LC'], [0x1FBA5, 'Diag UC-MR-LC'],
        [0x1FBA6, 'Diag ML-LC-MR'], [0x1FBA7, 'Diag ML-UC-MR'],
        [0x1FBA8, 'Diag UC-ML & MR-LC'], [0x1FBA9, 'Diag UC-MR & ML-LC'],
        [0x1FBAA, 'Diag UC-MR-LC-ML'], [0x1FBAB, 'Diag UC-ML-LC-MR'],
        [0x1FBAC, 'Diag ML-UC-MR-LC'], [0x1FBAD, 'Diag MR-UC-ML-LC'],
        [0x1FBAE, 'Diag Diamond'], [0x1FBAF, 'Horizontal+Vertical Stroke'],
        [0x1FBD0, 'Diag MR to Lower Left'], [0x1FBD1, 'Diag UR to ML'],
        [0x1FBD2, 'Diag UL to MR'], [0x1FBD3, 'Diag ML to Lower Right'],
        [0x1FBD4, 'Diag UL to LC'], [0x1FBD5, 'Diag UC to LR'],
        [0x1FBD6, 'Diag UR to LC'], [0x1FBD7, 'Diag UC to LL'],
        [0x1FBD8, 'Diag UL-MC-UR'], [0x1FBD9, 'Diag UR-MC-LR'],
        [0x1FBDA, 'Diag LL-MC-LR'], [0x1FBDB, 'Diag UL-MC-LL'],
        [0x1FBDC, 'Diag UL-LC-UR'], [0x1FBDD, 'Diag UR-ML-LR'],
        [0x1FBDE, 'Diag LL-UC-LR'], [0x1FBDF, 'Diag UL-MR-LL'],
    ],
    misc: [
        [0x1FBB0, 'Arrowhead Pointer'], [0x1FBB1, 'Inverse Check Mark'],
        [0x1FBB2, 'Left Half Running Man'], [0x1FBB3, 'Right Half Running Man'],
        [0x1FBB4, 'Inverse Down Arrow Tip Left'],
        [0x1FBB5, 'Left Arrow+1/8 Blocks'], [0x1FBB6, 'Right Arrow+1/8 Blocks'],
        [0x1FBB7, 'Down Arrow+Right 1/8'], [0x1FBB8, 'Up Arrow+Right 1/8'],
        [0x1FBB9, 'Left Half Folder'], [0x1FBBA, 'Right Half Folder'],
        [0x1FBBB, 'Voided Greek Cross'], [0x1FBBC, 'Right Open Squared Dot'],
        [0x1FBBD, 'Negative Diagonal Cross'],
        [0x1FBBE, 'Negative Diag MR-LC'], [0x1FBBF, 'Negative Diag Diamond'],
        [0x1FBC0, 'Heavy Saltire Rounded'], [0x1FBC1, 'Left 1/3 Point Index'],
        [0x1FBC2, 'Mid 1/3 Point Index'], [0x1FBC3, 'Right 1/3 Point Index'],
        [0x1FBC4, 'Negative Squared ?'], [0x1FBC5, 'Stick Figure'],
        [0x1FBC6, 'Stick Figure Arms Up'], [0x1FBC7, 'Stick Figure Left'],
        [0x1FBC8, 'Stick Figure Right'], [0x1FBC9, 'Stick Figure Dress'],
        [0x1FBCA, 'White Up Chevron'], [0x1FBCB, 'White Cross Mark'],
        [0x1FBCC, 'Raised Left Bracket'], [0x1FBCD, 'Black Up Chevron'],
        [0x1FBE0, 'Top Half White Circle'], [0x1FBE1, 'Right Half White Circle'],
        [0x1FBE2, 'Bottom Half White Circle'], [0x1FBE3, 'Left Half White Circle'],
        [0x1FBE8, 'Top Half Black Circle'], [0x1FBE9, 'Right Half Black Circle'],
        [0x1FBEA, 'Bottom Half Black Circle'], [0x1FBEB, 'Left Half Black Circle'],
        [0x1FBEC, 'TR Quarter Black Circle'], [0x1FBED, 'BL Quarter Black Circle'],
        [0x1FBEE, 'BR Quarter Black Circle'], [0x1FBEF, 'TL Quarter Black Circle'],
        [0x1FBF0, 'Segmented 0'], [0x1FBF1, 'Segmented 1'],
        [0x1FBF2, 'Segmented 2'], [0x1FBF3, 'Segmented 3'],
        [0x1FBF4, 'Segmented 4'], [0x1FBF5, 'Segmented 5'],
        [0x1FBF6, 'Segmented 6'], [0x1FBF7, 'Segmented 7'],
        [0x1FBF8, 'Segmented 8'], [0x1FBF9, 'Segmented 9'],
        [0x1FBFA, 'Alarm Bell'],
    ],
};

// The dock's tools and the editor tools each one covers (the first is its
// default; the inspector switches between them)
const TOOL_GROUPS = {
    brush: ['draw', 'erase'],
    fill: ['fill'],
    glyph: ['char'],
    text: ['text'],
    shape: ['box', 'line'],
    selection: ['select', 'select-subpixel'],
    hand: ['hand'],
    pick: ['pick']
};

const GROUP_INFO = {
    brush: { title: 'Brush', key: 'B' },
    fill: { title: 'Fill', key: 'F' },
    glyph: { title: 'Glyph', key: 'G' },
    text: { title: 'Text', key: 'T' },
    shape: { title: 'Shape', key: 'S' },
    selection: { title: 'Select', key: 'V' },
    hand: { title: 'Hand', key: 'H' },
    pick: { title: 'Pick colour', key: 'I' }
};

// Single-key shortcuts: a tool, or a dock tool (its last used mode). D, C
// and P are the older keys for draw, symbol and pick.
const KEY_TOOLS = {
    b: 'brush', e: 'erase', d: 'draw', f: 'fill', g: 'glyph', c: 'glyph', t: 'text',
    s: 'shape', l: 'line', v: 'selection', h: 'hand', i: 'pick', p: 'pick'
};

// Where the canvas is autosaved (see Toolbar.autosave)
const AUTOSAVE_KEY = 'motd-editor.canvas';

// Zoom steps for + and -
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];

const ANSI_COLORS = [
    ['Black', '#000000'], ['Red', '#cd3131'], ['Green', '#0dbc79'], ['Yellow', '#e5e510'],
    ['Blue', '#2472c8'], ['Magenta', '#bc3fbc'], ['Cyan', '#11a8cd'], ['White', '#e5e5e5'],
    ['Bright black', '#666666'], ['Bright red', '#f14c4c'], ['Bright green', '#23d18b'], ['Bright yellow', '#f5f543'],
    ['Bright blue', '#3b8eea'], ['Bright magenta', '#d670d6'], ['Bright cyan', '#29b8db'], ['Bright white', '#ffffff']
];

const toHex = ({ r, g, b }) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

const hexToRgb = (hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
});

// Read and write a remembered setting; storage may be unavailable (e.g. a
// private window), and then nothing is remembered
function loadSetting(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}

function saveSetting(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) { /* not saved */ }
}

// "LOWER LEFT BLOCK" and "grinning face" as "Lower left block", "Grinning
// face"; mixed-case names stay as they are
function sentenceCase(name) {
    if (name !== name.toUpperCase() && name !== name.toLowerCase()) return name;
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Mark one of `buttons` pressed (aria-pressed)
function pressOne(buttons, pressed) {
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b === pressed)));
}

class Toolbar {
    constructor(canvasRenderer) {
        this.renderer = canvasRenderer;
        this.currentTab = 'diagonal';
        this.saveFilename = 'motd.txt';
        this.saveFormat = 'ansi';
        this.colorTarget = 'fg';
        this.lastTool = { brush: 'draw', shape: 'box', selection: 'select' };
        this.lastChar = null;
        this.toolBeforePick = null;

        this.setupMenus();
        this.setupActions();
        this.setupHistoryButtons();
        // View settings, remembered in this browser once changed
        this.toggleGrid = this.setupToggle('motd-editor.grid', false, (on) => {
            this.renderer.setShowGrid(on);
            document.querySelector('[data-action="toggle-grid"]').setAttribute('aria-pressed', String(on));
        });
        this.toggleLightTerminal = this.setupToggle('motd-editor.lightTerminal', false, (on) => {
            this.renderer.setLightTerminal(on);
            document.querySelector('[data-action="dark-terminal"]').setAttribute('aria-pressed', String(!on));
            document.querySelector('[data-action="light-terminal"]').setAttribute('aria-pressed', String(on));
        });
        this.setupCellAspect();
        this.setupZoom();
        this.setupPanning();
        this.setupTools();
        this.setupColors();
        this.setupStyle();
        this.setupImagePanel();
        this.setupViews();
        this.setupFileInputs();
        this.setupCharPalette();
        this.setupCommandPalette();
        this.setupKeyboard();
        this.setTool('draw');
    }

    // --- Menus (file name, cell aspect) ---

    setupMenus() {
        const menus = [...document.querySelectorAll('.menu')];
        const close = () => menus.forEach(m => {
            m.classList.remove('open');
            m.querySelector('.menu-trigger').setAttribute('aria-expanded', 'false');
        });
        this.closeMenus = close;
        menus.forEach(menu => {
            const trigger = menu.querySelector('.menu-trigger');
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = !menu.classList.contains('open');
                close();
                menu.classList.toggle('open', open);
                trigger.setAttribute('aria-expanded', String(open));
            });
            // Items close the menu (their actions are wired separately)
            menu.querySelector('.menu-list').addEventListener('click', close);
        });
        document.addEventListener('click', close);
    }

    // --- Actions: buttons with data-action, the command palette, shortcuts ---

    setupActions() {
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => this.handleAction(btn.dataset.action));
        });
    }

    handleAction(action) {
        const r = this.renderer;
        switch (action) {
            case 'undo': r.undo(); break;
            case 'redo': r.redo(); break;
            case 'new':
                if (confirm('Create a new canvas? Unsaved changes will be lost.')) {
                    r.createNew(80, 60, 'sextant');
                    this.setFilename('motd.txt');
                    this.saveFormat = 'ansi';
                }
                break;
            case 'open': document.getElementById('file-input').click(); break;
            case 'import-image': document.getElementById('image-input').click(); break;
            case 'save': this.doSave(); break;
            case 'save-as': this.showSaveAsDialog(); break;
            case 'resize': this.showResizeDialog(); break;
            case 'clear':
                if (confirm('Clear the entire canvas?')) r.clear();
                break;
            case 'toggle-grid': this.toggleGrid(); break;
            case 'dark-terminal': if (r.lightTerminal) this.toggleLightTerminal(); break;
            case 'light-terminal': if (!r.lightTerminal) this.toggleLightTerminal(); break;
            case 'toggle-light-terminal': this.toggleLightTerminal(); break;
            case 'zoom-in': this.stepZoom(1); break;
            case 'zoom-out': this.stepZoom(-1); break;
            case 'zoom-fit': this.zoomToFit(); break;
            case 'zoom-reset': this.setZoom(1); break;
            case 'swap-colors': if (r.view === 'both') this.setColors(r.bgColor, r.fgColor); break;
            case 'default-colors':
                this.setStyle(false, false);
                this.setColors(defaultFG(), defaultBG());
                break;
            case 'pick': this.setTool('pick'); break;
            case 'commands': this.openCommandPalette(); break;
            case 'toggle-inspector': document.getElementById('inspector').classList.toggle('open'); break;
        }
    }

    // Undo/redo buttons are enabled only when there is something to undo/redo
    setupHistoryButtons() {
        const undoBtn = document.querySelector('[data-action="undo"]');
        const redoBtn = document.querySelector('[data-action="redo"]');
        const history = this.renderer.history;
        const update = () => {
            undoBtn.disabled = !history.canUndo();
            redoBtn.disabled = !history.canRedo();
            undoBtn.title = history.undoLabel() ? `Undo ${history.undoLabel()} (⌘Z)` : 'Undo (⌘Z)';
            redoBtn.title = history.redoLabel() ? `Redo ${history.redoLabel()} (⇧⌘Z)` : 'Redo (⇧⌘Z)';
        };
        history.onChange = () => {
            update();
            this.scheduleAutosave();
        };
        update();
    }

    // A view setting: applies the saved choice (or the default) now and
    // returns a function that toggles it. The choice is only saved once the
    // user toggles it, so changing a default reaches everyone who never chose;
    // with save false (the AI's changes) it isn't saved at all.
    setupToggle(key, defaultOn, apply) {
        const saved = loadSetting(key);
        let on = saved === null ? defaultOn : saved === 'true';
        apply(on);
        return (save = true) => {
            on = !on;
            apply(on);
            if (save) saveSetting(key, on);
        };
    }

    // Cell aspect (width / height) presets and Custom…, to preview cells as a
    // given terminal draws them. Remembered like the toggles.
    setupCellAspect() {
        const key = 'motd-editor.cellAspect';
        const items = [...document.querySelectorAll('[data-cell-aspect]')];
        const custom = items.find(b => b.dataset.cellAspect === 'custom');
        const presets = items.filter(b => b !== custom);
        const value = (b) => parseFloat(b.dataset.cellAspect);

        // Show and apply `aspect` (see isCellAspect); with `save`, remember it
        this.setCellAspect = (aspect, save = true) => {
            const preset = presets.find(b => Math.abs(value(b) - aspect) < 0.0005);
            items.forEach(b => b.setAttribute('aria-checked', String(b === (preset || custom))));
            custom.querySelector('.menu-label').textContent = preset ? 'Custom…' : `Custom (${aspect.toFixed(3)})…`;
            document.getElementById('aspect-value').textContent = aspect.toFixed(2);
            this.renderer.setCellAspect(aspect);
            if (save) saveSetting(key, aspect);
        };
        this.customCellAspect = () => {
            const answer = prompt(`Cell width ÷ height, ${CELL_ASPECT_RANGE.join('-')} (e.g. 9x19 px terminal cells: 0.47)`,
                this.renderer.cellAspect.toFixed(3));
            const aspect = parseFloat(answer);
            if (isCellAspect(aspect)) this.setCellAspect(aspect);
        };

        items.forEach(b => b.addEventListener('click', () => {
            if (b === custom) this.customCellAspect();
            else this.setCellAspect(value(b));
        }));

        const saved = parseFloat(loadSetting(key));
        this.setCellAspect(isCellAspect(saved) ? saved : DEFAULT_CELL_ASPECT, false);
    }

    // --- Zoom and rulers ---

    setupZoom() {
        this.scroller = document.getElementById('canvas-scroll');
        this.renderer.onRender = () => this.renderRulers();
        const saved = parseFloat(loadSetting('motd-editor.zoom'));
        if (saved >= ZOOMS[0] && saved <= ZOOMS[ZOOMS.length - 1]) this.renderer.zoom = saved;
        this.showZoom();

        // Ctrl/⌘+wheel over the canvas zooms around the pointer
        this.scroller.addEventListener('wheel', (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            this._zoomWheel = (this._zoomWheel || 0) + e.deltaY;
            if (Math.abs(this._zoomWheel) < 40) return;
            this.stepZoom(this._zoomWheel < 0 ? 1 : -1, e);
            this._zoomWheel = 0;
        }, { passive: false });
    }

    // Moving the view by dragging: with the hand tool, while Space is held
    // (any tool; not while typing on the canvas), or with the middle button
    setupPanning() {
        const s = this.scroller, r = this.renderer;
        let space = false, drag = null;
        const ready = () => s.classList.toggle('pan-ready', !drag && (space || r.tool === 'hand'));
        this.updatePanCursor = ready;

        // Capture phase: before the canvas sees the press
        s.addEventListener('mousedown', (e) => {
            if (!(e.button === 1 || (e.button === 0 && (space || r.tool === 'hand')))) return;
            e.preventDefault();
            e.stopPropagation();
            drag = { x: e.clientX, y: e.clientY, left: s.scrollLeft, top: s.scrollTop };
            s.classList.add('panning');
            ready();
        }, true);
        window.addEventListener('mousemove', (e) => {
            if (!drag) return;
            if (e.buttons === 0) return end();   // released where we didn't see it
            s.scrollLeft = drag.left - (e.clientX - drag.x);
            s.scrollTop = drag.top - (e.clientY - drag.y);
        });
        const end = () => {
            drag = null;
            s.classList.remove('panning');
            ready();
        };
        window.addEventListener('mouseup', () => { if (drag) end(); });
        // The middle button's click mustn't start auto-scrolling either
        s.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

        const typing = (e) => (e.target.closest && e.target.closest('input, textarea, dialog')) ||
            (r.tool === 'text' && r.textCursor);
        document.addEventListener('keydown', (e) => {
            if (e.key !== ' ' || typing(e)) return;
            e.preventDefault();   // no scrolling, no pressing a focused button
            if (space) return;    // held: the key repeats
            space = true;
            ready();
        });
        document.addEventListener('keyup', (e) => {
            if (e.key !== ' ' || !space) return;
            e.preventDefault();   // a focused button would activate on key-up
            space = false;
            ready();
        });
        window.addEventListener('blur', () => { space = false; ready(); });
    }

    // Zoom to `zoom`, keeping the canvas point under `at` (a pointer event;
    // default the middle of the view) where it is
    setZoom(zoom, at = null) {
        const r = this.renderer, s = this.scroller;
        zoom = Math.min(ZOOMS[ZOOMS.length - 1], Math.max(ZOOMS[0], zoom));
        if (zoom === r.zoom) return;
        const box = s.getBoundingClientRect();
        const px = at ? at.clientX - box.left : s.clientWidth / 2;
        const py = at ? at.clientY - box.top : s.clientHeight / 2;
        const canvasBox = r.container.getBoundingClientRect();
        const cx = (box.left + px - canvasBox.left) / r.zoom;
        const cy = (box.top + py - canvasBox.top) / r.zoom;
        r.setZoom(zoom);
        const after = r.container.getBoundingClientRect();
        s.scrollLeft += after.left + cx * zoom - (box.left + px);
        s.scrollTop += after.top + cy * zoom - (box.top + py);
        saveSetting('motd-editor.zoom', zoom);
        this.showZoom();
    }

    stepZoom(dir, at) {
        const z = this.renderer.zoom;
        const next = dir > 0 ? ZOOMS.find(v => v > z + 0.001) : [...ZOOMS].reverse().find(v => v < z - 0.001);
        if (next) this.setZoom(next, at);
    }

    // The largest zoom that shows the whole canvas
    zoomToFit() {
        const r = this.renderer, s = this.scroller;
        const cs = getComputedStyle(s);
        const w = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const h = s.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        this.setZoom(Math.min(w / (r.canvas.width * CELL_W), h / (r.canvas.height * CELL_H)));
    }

    showZoom() {
        document.getElementById('zoom-value').textContent = Math.round(this.renderer.zoom * 100) + '%';
    }

    // Column numbers above the canvas and row numbers to its left, as far
    // apart as keeps them readable at this zoom
    renderRulers() {
        const r = this.renderer;
        if (!r.canvas) return;
        const cw = CELL_W * r.zoom, ch = CELL_H * r.zoom;
        const stepX = [10, 20, 50, 100].find(n => n * cw >= 48) || 100;
        const stepY = [5, 10, 20, 50].find(n => n * ch >= 28) || 50;
        const top = document.getElementById('ruler-top');
        const left = document.getElementById('ruler-left');
        top.style.width = r.canvas.width * cw + 'px';
        left.style.height = r.canvas.height * ch + 'px';
        top.replaceChildren(...this.rulerMarks(r.canvas.width, stepX, n => ({ left: n * cw + 'px' })));
        left.replaceChildren(...this.rulerMarks(r.canvas.height, stepY, n => ({ top: (n + 0.5) * ch + 'px' })));
    }

    rulerMarks(count, step, position) {
        const marks = [];
        for (let n = 0; n < count; n += step) {
            const span = document.createElement('span');
            span.textContent = n;
            Object.assign(span.style, position(n));
            marks.push(span);
        }
        return marks;
    }

    // --- Tools ---

    setupTools() {
        document.querySelectorAll('.dock-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
        });
        // Modes within a dock tool (Paint / Erase, Box / Line, Cells / Subpixels)
        document.querySelectorAll('[data-tool-set]').forEach(btn => {
            btn.addEventListener('click', () => this.setTool(btn.dataset.toolSet));
        });

        const styles = [...document.querySelectorAll('.tile[data-style]')];
        styles.forEach(btn => btn.addEventListener('click', () => {
            // A drag in progress is in the old style's units (cells or subpixels)
            if (this.renderer.dragStart) this.renderer.cancelDrag();
            pressOne(styles, btn);
            this.renderer.boxLineStyle = parseInt(btn.dataset.style);
        }));
        const fills = [...document.querySelectorAll('[data-fill]')];
        fills.forEach(btn => btn.addEventListener('click', () => {
            pressOne(fills, btn);
            this.renderer.boxFillMode = parseInt(btn.dataset.fill);
        }));
        const paths = [...document.querySelectorAll('[data-line-path]')];
        paths.forEach(btn => btn.addEventListener('click', () => {
            pressOne(paths, btn);
            this.renderer.linePath = btn.dataset.linePath;
        }));
        const fillModes = [...document.querySelectorAll('[data-fill-mode]')];
        fillModes.forEach(btn => btn.addEventListener('click', () => {
            pressOne(fillModes, btn);
            this.renderer.fillMode = btn.dataset.fillMode;
            document.querySelectorAll('[data-fill-hint]').forEach(p => { p.hidden = p.dataset.fillHint !== btn.dataset.fillMode; });
        }));
        const brushes = [...document.querySelectorAll('[data-brush]')];
        brushes.forEach(btn => btn.addEventListener('click', () => {
            pressOne(brushes, btn);
            this.renderer.brushCell = btn.dataset.brush === 'cell';
        }));
    }

    // Switch to an editor tool ('draw', 'box', …) or a dock tool ('brush',
    // 'shape', …: its last used mode)
    setTool(tool) {
        if (TOOL_GROUPS[tool] && !TOOL_GROUPS[tool].includes(tool)) {
            tool = this.lastTool[tool] || TOOL_GROUPS[tool][0];
        }
        const group = Object.keys(TOOL_GROUPS).find(g => TOOL_GROUPS[g].includes(tool));
        if (!group) return;
        const r = this.renderer;
        if (r.view === 'paper' && (group === 'glyph' || group === 'text' || tool === 'select-subpixel')) return;   // ink only
        if (tool === 'pick' && r.tool !== 'pick') this.toolBeforePick = r.tool;
        if (group in this.lastTool) this.lastTool[group] = tool;

        r.setTool(tool);
        if (tool === 'char' && this.lastChar !== null) r.setSelectedChar(this.lastChar);

        document.querySelectorAll('.dock-btn[data-tool]').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === group);
            b.setAttribute('aria-pressed', String(b.dataset.tool === group));
        });
        document.querySelectorAll('[data-tool-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.toolSet === tool)));
        if (this.updatePanCursor) this.updatePanCursor();
        this.currentGroup = group;
        this.showPanel();

        // Fill applies to boxes only, and a line needs a border
        document.querySelector('.box-only').hidden = tool !== 'box';
        document.querySelector('.line-path').hidden = tool !== 'line';
        const none = document.querySelector('.tile[data-style="0"]');
        none.hidden = tool === 'line';
        if (tool === 'line' && r.boxLineStyle === 0) document.querySelector('.tile[data-style="1"]').click();
    }

    // The inspector's panel: the Image panel while an image is being
    // placed, else the current tool's
    showPanel() {
        const image = !!this.renderer.imagePaste;
        const panel = image ? 'image' : this.currentGroup;
        document.querySelectorAll('.inspector section[data-panel]').forEach(s => s.classList.toggle('active', s.dataset.panel === panel));
        document.getElementById('tool-title').textContent = image ? 'Image' : GROUP_INFO[panel].title;
        const key = document.getElementById('tool-key');
        key.textContent = image ? '' : GROUP_INFO[panel].key;
        key.hidden = image;
        const note = document.getElementById('view-note');
        note.textContent = this.viewNote();
        note.hidden = !note.textContent;
        // The ink and paper views each fill in one way
        const both = this.renderer.view === 'both';
        document.querySelector('.fill-modes').hidden = !both;
        document.querySelectorAll('[data-fill-hint]').forEach(p => {
            p.hidden = !both || p.dataset.fillHint !== this.renderer.fillMode;
        });
        // Narrow windows: open the inspector for the image, close it after
        const inspector = document.getElementById('inspector');
        if (image && !inspector.classList.contains('open')) {
            inspector.classList.add('open');
            this._openedForImage = true;
        } else if (!image && this._openedForImage) {
            inspector.classList.remove('open');
            this._openedForImage = false;
        }
    }

    // --- Image panel ---

    setupImagePanel() {
        const r = this.renderer;
        r.onImagePaste = (p) => this.showImagePanel(p);
        const set = (changes) => r.setImageOptions(changes);

        document.querySelectorAll('[data-image-action]').forEach(btn => btn.addEventListener('click', () => {
            const p = r.imagePaste;
            if (!p) return;
            switch (btn.dataset.imageAction) {
                case 'place': r.placeImage(); break;
                case 'cancel': r.endImagePaste(); break;
                case 'reset-tone': set({ brightness: 0, contrast: 0, midtones: 0, invert: false }); break;
                case 'fit-canvas':
                case 'fit-selection': {
                    const a = btn.dataset.imageAction === 'fit-selection' && r.selection ||
                        { x1: 0, y1: 0, x2: r.canvas.width - 1, y2: r.canvas.height - 1 };
                    const cols = fitImageCols(p.image, r.cellAspect, a.x2 - a.x1 + 1, a.y2 - a.y1 + 1);
                    r.setImageOptions({ cols, rows: imageRows(p.image, cols, r.cellAspect), locked: true });
                    r.moveImageTo({ x: a.x1, y: a.y1 });
                    break;
                }
            }
        }));
        const cols = document.getElementById('image-cols'), rows = document.getElementById('image-rows');
        cols.addEventListener('input', () => { if (cols.value >= 1) set({ cols: +cols.value }); });
        rows.addEventListener('input', () => { if (rows.value >= 1) set({ rows: +rows.value }); });
        for (const input of [cols, rows]) {
            // Leaving the field shows the size as it is (limits applied)
            input.addEventListener('blur', () => r.imagePaste && this.showImagePanel(r.imagePaste));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Escape') input.blur();
            });
        }
        const lock = document.getElementById('image-lock');
        lock.addEventListener('click', () => set({ locked: lock.getAttribute('aria-pressed') !== 'true' }));
        document.querySelectorAll('[data-image-mono]').forEach(b => b.addEventListener('click', () => set({ mono: b.dataset.imageMono === 'true' })));
        document.querySelectorAll('[data-image-dither]').forEach(b => b.addEventListener('click', () => set({ dither: b.dataset.imageDither })));
        document.querySelectorAll('[data-image-slider]').forEach(input => {
            const name = input.dataset.imageSlider;
            input.addEventListener('input', () => set({ [name]: name === 'strength' ? input.value / 100 : +input.value }));
            // Double-click puts a slider back to its default
            input.addEventListener('dblclick', () => set({ [name]: name === 'strength' ? 1 : 0 }));
        });
        const invert = document.getElementById('image-invert');
        invert.addEventListener('change', () => set({ invert: invert.checked }));
    }

    // Show the image's settings (null: placing ended)
    showImagePanel(p) {
        this.showPanel();
        if (!p) return;
        // Not the field being typed in, which would move its cursor
        for (const [id, value] of [['image-cols', p.cols], ['image-rows', p.rows]]) {
            const input = document.getElementById(id);
            if (document.activeElement !== input) input.value = value;
        }
        document.getElementById('image-lock').setAttribute('aria-pressed', String(p.locked));
        pressOne([...document.querySelectorAll('[data-image-mono]')], document.querySelector(`[data-image-mono="${p.mono}"]`));
        pressOne([...document.querySelectorAll('[data-image-dither]')], document.querySelector(`[data-image-dither="${p.dither}"]`));
        document.querySelectorAll('[data-image-slider]').forEach(input => {
            const name = input.dataset.imageSlider;
            const value = name === 'strength' ? Math.round(p.strength * 100) : p[name];
            input.value = value;
            input.nextElementSibling.textContent = name === 'strength' ? value + '%' : (value > 0 ? '+' : '') + value;
        });
        document.getElementById('image-invert').checked = p.invert;
        document.querySelector('[data-image-action="fit-selection"]').disabled = !this.renderer.selection;
    }

    // --- Colours ---

    setupColors() {
        const palette = document.getElementById('palette');
        const add = (label, color, cls) => {
            const btn = document.createElement('button');
            btn.title = label;
            btn.setAttribute('aria-label', label);
            if (cls) btn.className = cls;
            else btn.style.background = color;
            btn.addEventListener('click', () => this.setColor(this.colorTarget,
                color === 'keep' ? keepColor(this.colorTarget)
                    : color ? { ...hexToRgb(color), default: false } : (this.colorTarget === 'fg' ? defaultFG() : defaultBG())));
            palette.appendChild(btn);
        };
        add("Terminal's own colour", null, 'default-swatch');
        add("Keep: leave the cell's own colour", 'keep', 'keep-swatch');
        ANSI_COLORS.forEach(([name, hex]) => add(name, hex));

        for (const which of ['fg', 'bg']) {
            const input = document.getElementById(`${which}-color`);
            input.addEventListener('input', () => this.setColor(which, { ...hexToRgb(input.value), default: false }));
            input.addEventListener('click', () => this.setColorTarget(which));
            document.querySelector(`[data-target-pick="${which}"]`).addEventListener('click', () => this.setColorTarget(which));
        }
        this.setColors(this.renderer.fgColor, this.renderer.bgColor);
    }

    // Which colour the palette sets: 'fg' (ink) or 'bg' (paper)
    setColorTarget(which) {
        this.colorTarget = which;
        document.querySelectorAll('[data-target-pick]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.targetPick === which)));
    }

    // Make `color` the current fg/bg colour and show it
    setColor(which, color) {
        if (color.keep) color = keepColor(which);   // e.g. after a swap
        if (which === 'fg') this.renderer.setFgColor(color);
        else this.renderer.setBgColor(color);
        if (this.renderer.imagePaste && this.renderer.imagePaste.mono) this.renderer.scheduleImageUpdate();
        const input = document.getElementById(`${which}-color`);
        input.value = toHex(color);
        const swatch = input.parentElement;
        swatch.classList.toggle('keep', !!color.keep);
        swatch.classList.toggle('default', color.default && !color.keep);
        swatch.style.setProperty('--swatch', toHex(color));
        document.getElementById(`${which}-value`).textContent = color.keep ? 'Keep' : color.default ? 'Terminal' : toHex(color);
        const chip = document.getElementById(`dock-${which}`);
        chip.classList.toggle('keep', !!color.keep);
        chip.classList.toggle('default', color.default && !color.keep);
        chip.style.background = color.default ? '' : toHex(color);
    }

    // Set both colours (the pick tool, swap, reset); a pick made with the
    // Pick tool goes back to the tool used before it
    setColors(fg, bg) {
        this.setColor('fg', { ...fg });
        this.setColor('bg', { ...bg });
        if (this.renderer.tool === 'pick' && this.toolBeforePick) {
            this.setTool(this.toolBeforePick);
            if (this.renderer.tool === 'pick') this.setTool('draw');   // not in this view
            this.toolBeforePick = null;
        }
    }

    // --- Views: see and edit only the ink, only the paper, or both ---

    setupViews() {
        document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => this.setView(btn.dataset.view)));
    }

    setView(view) {
        this.renderer.setView(view);
        document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
        // The colour the view doesn't edit is dimmed, and the palette sets the other
        document.querySelector('.color-target[data-target="bg"]').classList.toggle('unused', view === 'ink');
        document.querySelector('.color-target[data-target="fg"]').classList.toggle('unused', view === 'paper');
        document.querySelector('.style-toggles').classList.toggle('unused', view === 'paper');
        document.getElementById('fg-color').disabled = view === 'paper';
        document.getElementById('bg-color').disabled = view === 'ink';
        const inspector = document.getElementById('inspector');
        inspector.classList.toggle('paper-view', view === 'paper');
        inspector.classList.toggle('ink-view', view === 'ink');
        if (view === 'ink') this.setColorTarget('fg');
        if (view === 'paper') this.setColorTarget('bg');
        // Swapping would change the colour the view hides
        document.querySelector('[data-action="swap-colors"]').disabled = view !== 'both';
        // Subpixel selection: paper is per cell
        if (view === 'paper' && this.renderer.tool === 'select-subpixel') this.setTool('select');
        // Glyphs and text are ink: not in the paper view
        for (const group of ['glyph', 'text']) document.querySelector(`.dock-btn[data-tool="${group}"]`).disabled = view === 'paper';
        if (view === 'paper' && ['char', 'text'].includes(this.renderer.tool)) this.setTool('brush');
        // The ink view's box has no Recolour (the Fill tool recolours)
        if (view === 'ink' && this.renderer.boxFillMode === 2) document.querySelector('[data-fill="0"]').click();
        this.showPanel();
    }

    // What the current tool does in the ink or paper view, if it differs
    viewNote() {
        const view = this.renderer.view, group = this.renderer.imagePaste ? 'image' : this.currentGroup;
        const notes = {
            paper: {
                brush: "Paper view: paints whole cells' paper; Erase gives them the terminal's own.",
                fill: 'Paper view: fills connected cells of the same paper with the paper colour, whatever they hold.',
                glyph: 'Glyphs are ink: switch to Ink or Both to use this tool.',
                text: 'Text is ink: switch to Ink or Both to use this tool.',
                shape: 'Paper view: the box or line gives every cell it covers the paper colour.',
                selection: 'Paper view: copy, cut and paste move only the paper.',
                image: "Paper view: each cell's paper gets the image's colour there."
            },
            ink: {
                brush: 'Ink view: the paper stays as it is.',
                fill: 'Ink view: lights the area in the ink colour; only lit subpixels and characters stop it.',
                glyph: 'Ink view: the paper stays as it is.',
                text: 'Ink view: the paper stays as it is.',
                shape: 'Ink view: the paper stays as it is.',
                selection: 'Ink view: copy, cut and paste leave the paper as it is.',
                image: 'Ink view: the image is drawn in the ink colour over the paper there.'
            }
        };
        return (notes[view] || {})[group] || '';
    }

    // --- Text style ---

    setupStyle() {
        document.querySelectorAll('[data-style-toggle]').forEach(btn => btn.addEventListener('click', () => {
            const r = this.renderer;
            if (btn.dataset.styleToggle === 'bold') this.setStyle(!r.bold, r.inverse);
            else this.setStyle(r.bold, !r.inverse);
        }));
    }

    // Make bold / inverse the style drawn cells get, and show it
    setStyle(bold, inverse) {
        this.renderer.bold = bold;
        this.renderer.inverse = inverse;
        document.querySelector('[data-style-toggle="bold"]').setAttribute('aria-pressed', String(bold));
        document.querySelector('[data-style-toggle="inverse"]').setAttribute('aria-pressed', String(inverse));
    }

    // --- Autosave: the canvas is kept in this browser (as ANSI text, with
    // its size and file name) and comes back when the editor is reopened ---

    // The saved canvas, or undefined; applies the saved file name
    savedCanvas() {
        try {
            const saved = JSON.parse(loadSetting(AUTOSAVE_KEY));
            const size = (v, max) => Number.isInteger(v) && v >= 1 && v <= max;
            // None, or not something this version saved: start empty
            if (!saved || saved.v !== 1 || typeof saved.ansi !== 'string' ||
                !size(saved.width, 500) || !size(saved.height, 200)) return undefined;
            const canvas = parseANSIText(saved.ansi);
            resizeCanvas(canvas, saved.width, saved.height);
            if (typeof saved.name === 'string' && saved.name) this.setFilename(saved.name, false);
            return canvas;
        } catch (e) {
            return undefined;   // unreadable: start empty
        }
    }

    // Save a moment after the last change (and when the page goes away);
    // big canvases take a while to save, so wait longer for them
    scheduleAutosave() {
        clearTimeout(this._autosaveTimer);
        const c = this.renderer.canvas;
        const delay = c && c.width * c.height > 20000 ? 3000 : 500;
        this._autosaveTimer = setTimeout(() => this.autosave(), delay);
        if (!this._autosaveOnLeave) {
            this._autosaveOnLeave = true;
            window.addEventListener('pagehide', () => {
                if (this._autosaveTimer) this.autosave();
            });
        }
    }

    autosave() {
        clearTimeout(this._autosaveTimer);
        this._autosaveTimer = null;
        const c = this.renderer.canvas;
        const state = document.getElementById('save-state');
        try {
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
                v: 1, width: c.width, height: c.height, name: this.saveFilename, ansi: canvasToANSI(c)
            }));
            state.textContent = 'Autosaved';
            state.title = 'Kept in this browser: it comes back when you reopen the editor. Export to save a file.';
            state.classList.remove('failed');
        } catch (e) {
            state.textContent = 'Not autosaved';
            state.title = "This browser can't keep the canvas (storage full, or not allowed). Export to save it.";
            state.classList.add('failed');
        }
    }

    // --- Save / open / resize ---

    setFilename(name, save = true) {
        this.saveFilename = name;
        document.getElementById('file-name').textContent = name;
        if (save) this.scheduleAutosave();
    }

    doSave() {
        const text = this.saveFormat === 'ansi'
            ? canvasToANSI(this.renderer.canvas)
            : canvasToPlain(this.renderer.canvas);
        this.downloadText(text, this.saveFilename);
    }

    showSaveAsDialog() {
        const dialog = document.getElementById('save-as-dialog');
        const form = document.getElementById('save-as-form');
        const filenameInput = document.getElementById('save-filename');

        filenameInput.value = this.saveFilename;
        form.querySelectorAll('input[name="save-format"]').forEach(r => {
            r.checked = (r.value === this.saveFormat);
        });
        document.getElementById('save-as-cancel').onclick = () => dialog.close();
        form.onsubmit = (e) => {
            e.preventDefault();
            this.setFilename(filenameInput.value || 'motd.txt');
            this.saveFormat = form.querySelector('input[name="save-format"]:checked').value;
            dialog.close();
            this.doSave();
        };
        dialog.showModal();
        filenameInput.select();
    }

    showResizeDialog() {
        const dialog = document.getElementById('resize-dialog');
        const form = document.getElementById('resize-form');
        const widthInput = document.getElementById('resize-width');
        const heightInput = document.getElementById('resize-height');

        if (this.renderer.canvas) {
            widthInput.value = this.renderer.canvas.width;
            heightInput.value = this.renderer.canvas.height;
        }
        document.getElementById('resize-cancel').onclick = () => dialog.close();
        form.onsubmit = (e) => {
            e.preventDefault();
            const width = parseInt(widthInput.value) || 80;
            const height = parseInt(heightInput.value) || 60;
            this.renderer.resize(width, height);
            dialog.close();
        };
        dialog.showModal();
    }

    setupFileInputs() {
        const fileInput = document.getElementById('file-input');
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    this.renderer.setCanvas(parseANSIText(reader.result));
                    this.setFilename(file.name);
                    this.saveFormat = 'ansi';
                } catch (error) {
                    alert('Failed to open: ' + error.message);
                }
            };
            reader.readAsText(file);
            fileInput.value = '';
        });

        const imageInput = document.getElementById('image-input');
        imageInput.addEventListener('change', () => {
            const file = imageInput.files[0];
            if (file) this.renderer.startImagePaste(file);
            imageInput.value = '';
        });
    }

    // --- Glyph palette ---

    setupCharPalette() {
        const tabs = [...document.querySelectorAll('#glyph-tabs button')];
        const search = document.getElementById('glyph-search');
        tabs.forEach(tab => tab.addEventListener('click', () => {
            tabs.forEach(t => t.setAttribute('aria-selected', String(t === tab)));
            this.currentTab = tab.dataset.tab;
            search.value = '';
            this.renderCharPalette();
        }));
        search.addEventListener('input', () => this.renderCharPalette());
        this.renderCharPalette();
    }

    // Every glyph the palette offers, by tab: [{ code, name }]; emoji also
    // carry their Unicode group
    glyphTabs() {
        if (!this._glyphTabs) {
            const named = ([code, name]) => ({ code, name });
            this._glyphTabs = {
                diagonal: DIAGONAL_CHARS,
                triangle: TRIANGLE_CHARS,
                ...Object.fromEntries(Object.entries(LEGACY_CHARS).map(([tab, list]) => [tab, list.map(named)])),
                emoji: EMOJI_GROUPS.flatMap(g => g.emoji.map(([code, name]) => ({ code, name, group: g.name })))
            };
        }
        return this._glyphTabs;
    }

    // Glyphs whose name contains every word of `query`, from all tabs
    searchGlyphs(query, limit = Infinity) {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        const out = [];
        for (const list of Object.values(this.glyphTabs())) {
            for (const g of list) {
                const name = g.name.toLowerCase();
                if (words.every(w => name.includes(w))) out.push(g);
                if (out.length >= limit) return out;
            }
        }
        return out;
    }

    // Palette sections [{ title, chars }]: the search results, or the current
    // tab (emoji by Unicode group)
    getPaletteSections() {
        const query = document.getElementById('glyph-search').value.trim();
        if (query) return [{ chars: this.searchGlyphs(query, 300) }];
        const list = this.glyphTabs()[this.currentTab];
        if (this.currentTab !== 'emoji') return [{ chars: list }];
        return EMOJI_GROUPS.map(g => ({ title: g.name, chars: list.filter(c => c.group === g.name) }));
    }

    renderCharPalette() {
        const palette = document.getElementById('char-palette');
        const sections = this.getPaletteSections();
        palette.classList.toggle('emoji-grid', sections.some(s => s.chars.some(c => charWidth(c.code) === 2)));
        palette.replaceChildren();

        if (!sections.some(s => s.chars.length)) {
            const empty = document.createElement('div');
            empty.className = 'char-group-title';
            empty.textContent = 'No matches';
            palette.appendChild(empty);
        }
        for (const section of sections) {
            if (section.title) {
                const title = document.createElement('div');
                title.className = 'char-group-title';
                title.textContent = section.title;
                palette.appendChild(title);
            }
            for (const charInfo of section.chars) {
                const btn = document.createElement('button');
                btn.title = charInfo.name || `U+${charInfo.code.toString(16).toUpperCase()}`;
                btn.classList.toggle('selected', charInfo.code === this.renderer.selectedChar);
                const span = document.createElement('span');
                span.className = glyphClass(charInfo.code);
                span.textContent = String.fromCodePoint(charInfo.code);
                btn.appendChild(span);
                btn.addEventListener('click', () => this.selectGlyph(charInfo.code));
                palette.appendChild(btn);
            }
        }
    }

    // Stamp `code` with the glyph tool
    selectGlyph(code) {
        this.lastChar = code;
        this.setTool('char');
        this.renderer.setSelectedChar(code);
        document.querySelectorAll('#char-palette button').forEach(b => {
            b.classList.toggle('selected', b.textContent === String.fromCodePoint(code));
        });
    }

    // --- Command palette (⌘K) ---

    setupCommandPalette() {
        const dialog = document.getElementById('command-palette');
        const input = document.getElementById('command-query');
        const list = document.getElementById('command-list');

        input.addEventListener('input', () => {
            this.commandIndex = 0;
            this.renderCommands();
        });
        input.addEventListener('keydown', (e) => {
            const n = this.commandResults.length;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!n) return;
                this.commandIndex = (this.commandIndex + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
                this.renderCommands();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (n) this.runCommand(this.commandResults[this.commandIndex]);
            }
        });
        list.addEventListener('mousemove', (e) => {
            const li = e.target.closest('li[data-index]');
            if (li && +li.dataset.index !== this.commandIndex) {
                this.commandIndex = +li.dataset.index;
                this.renderCommands();
            }
        });
        list.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-index]');
            if (li) this.runCommand(this.commandResults[+li.dataset.index]);
        });
        // A click on the backdrop closes it
        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    }

    // Everything the editor can do, for the command palette
    commands() {
        const act = (action) => () => this.handleAction(action);
        const tool = (t) => () => this.setTool(t);
        const r = this.renderer;
        const cmds = [
            ['Tools', 'Brush', 'B', tool('draw')],
            ['Tools', 'Fill', 'F', tool('fill')],
            ...['ink', 'paper', 'both'].map(m => ['Fill', `Fill with ${m}`, '', () => {
                this.setTool('fill');
                document.querySelector(`[data-fill-mode="${m}"]`).click();
            }]),
            ['Tools', 'Erase', 'E', tool('erase')],
            ['Tools', 'Glyph', 'G', tool('char')],
            ['Tools', 'Text', 'T', tool('text')],
            ['Tools', 'Box', 'S', tool('box')],
            ['Tools', 'Line', 'L', tool('line')],
            ['Tools', 'Select cells', 'V', tool('select')],
            ['Tools', 'Select subpixels', '⇧V', tool('select-subpixel')],
            ['Tools', 'Pick colour', 'I', tool('pick')],
            ['Tools', 'Hand: move the view', 'H', tool('hand')],
            ['Brush', 'Brush tip: subpixel', '', () => { this.setTool('brush'); document.querySelector('[data-brush="subpixel"]').click(); }],
            ['Brush', 'Brush tip: whole cell', '', () => { this.setTool('brush'); document.querySelector('[data-brush="cell"]').click(); }],
            ['File', 'New canvas', '', act('new')],
            ['File', 'Open…', '', act('open')],
            ['File', 'Save', '⌘S', act('save')],
            ['File', 'Export / save as…', '⇧⌘S', act('save-as')],
            ['File', 'Import image…', '', act('import-image')],
            ['Edit', 'Undo', '⌘Z', act('undo')],
            ['Edit', 'Redo', '⇧⌘Z', act('redo')],
            ['Colour', 'Swap ink and paper', 'X', act('swap-colors')],
            ['Colour', "Ink: keep the cells' own", '', () => this.setColor('fg', keepColor('fg'))],
            ['Colour', "Paper: keep the cells' own", '', () => this.setColor('bg', keepColor('bg'))],
            ['Shape', 'Subpixel box', '', () => { this.setTool('box'); document.querySelector('.tile[data-style="4"]').click(); }],
            ['Shape', 'Subpixel line', '', () => { this.setTool('line'); document.querySelector('.tile[data-style="4"]').click(); }],
            ['Colour', "Reset to the terminal's colours", '', act('default-colors')],
            ['Style', r.bold ? 'Bold off' : 'Bold on', '', () => this.setStyle(!r.bold, r.inverse)],
            ['Style', r.inverse ? 'Inverse off' : 'Inverse on', '', () => this.setStyle(r.bold, !r.inverse)],
            ['View', 'See and edit only the ink', '', () => this.setView('ink')],
            ['View', 'See and edit only the paper', '', () => this.setView('paper')],
            ['View', 'See and edit ink and paper', '', () => this.setView('both')],
            ['View', r.showGrid ? 'Hide grid' : 'Show grid', '', act('toggle-grid')],
            ['View', r.lightTerminal ? 'Preview in a dark terminal' : 'Preview in a light terminal', '', act('toggle-light-terminal')],
            ['View', 'Zoom in', '+', act('zoom-in')],
            ['View', 'Zoom out', '−', act('zoom-out')],
            ['View', 'Zoom to fit', '0', act('zoom-fit')],
            ['View', 'Actual size (100%)', '', act('zoom-reset')],
            ...[...document.querySelectorAll('[data-cell-aspect]')]
                .filter(b => b.dataset.cellAspect !== 'custom')
                .map(b => ['View', `Cell shape: ${b.firstChild.textContent} (${b.querySelector('kbd').textContent})`, '',
                    () => this.setCellAspect(parseFloat(b.dataset.cellAspect))]),
            ['View', 'Cell shape: custom…', '', () => this.customCellAspect()],
            ['Canvas', 'Resize canvas…', '', act('resize')],
            ['Canvas', 'Clear canvas', '', act('clear')]
        ];
        return cmds.map(([group, label, keys, run]) => ({ group, label, keys, run }));
    }

    openCommandPalette() {
        const dialog = document.getElementById('command-palette');
        if (dialog.open) return;
        this.closeMenus();
        const input = document.getElementById('command-query');
        input.value = '';
        this.commandIndex = 0;
        this.renderCommands();
        dialog.showModal();
        input.focus();
    }

    // Commands matching the query (every word in the label or group), then
    // glyphs whose name matches it
    renderCommands() {
        const query = document.getElementById('command-query').value.trim().toLowerCase();
        const words = query.split(/\s+/).filter(Boolean);
        const results = this.commands().filter(c => words.every(w => (c.label + ' ' + c.group).toLowerCase().includes(w)));
        if (query.length >= 2) {
            for (const g of this.searchGlyphs(query, 30)) {
                results.push({
                    group: 'Glyph', label: sentenceCase(g.name),
                    glyph: g.code, run: () => this.selectGlyph(g.code)
                });
            }
        }
        this.commandResults = results;
        this.commandIndex = Math.min(this.commandIndex, Math.max(0, results.length - 1));

        const list = document.getElementById('command-list');
        list.replaceChildren();
        if (!results.length) {
            const li = document.createElement('li');
            li.className = 'cmd-empty';
            li.textContent = 'Nothing matches';
            list.appendChild(li);
            return;
        }
        results.forEach((c, i) => {
            const li = document.createElement('li');
            li.dataset.index = i;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', String(i === this.commandIndex));
            const icon = document.createElement('span');
            icon.className = 'cmd-icon';
            if (c.glyph) {
                const g = document.createElement('span');
                g.className = glyphClass(c.glyph);
                g.textContent = String.fromCodePoint(c.glyph);
                icon.appendChild(g);
            } else {
                icon.textContent = c.group.charAt(0);
            }
            const label = document.createElement('span');
            label.className = 'cmd-label';
            label.textContent = c.label;
            const group = document.createElement('span');
            group.className = 'cmd-group';
            group.textContent = c.group;
            li.append(icon, label, group);
            if (c.keys) {
                const kbd = document.createElement('kbd');
                kbd.textContent = c.keys;
                li.appendChild(kbd);
            }
            list.appendChild(li);
        });
        list.children[this.commandIndex].scrollIntoView({ block: 'nearest' });
    }

    runCommand(cmd) {
        document.getElementById('command-palette').close();
        cmd.run();
    }

    // --- Keyboard shortcuts ---

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            const mod = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            // ⌘K: commands, also while typing on the canvas
            if (mod && key === 'k') {
                e.preventDefault();
                this.openCommandPalette();
                return;
            }
            if (e.target.closest && e.target.closest('input, textarea, dialog')) return;

            // ⌘S: save, ⇧⌘S: save as
            if (mod && key === 's') {
                e.preventDefault();
                if (e.shiftKey) this.showSaveAsDialog();
                else this.doSave();
                return;
            }
            if (e.key === 'Escape') this.closeMenus();

            if (mod || e.altKey) return;
            // Typing goes to the canvas, and an image being placed has its own keys
            if (this.renderer.tool === 'text' && this.renderer.textCursor) return;
            if (this.renderer.isImagePaste()) return;

            if (e.code === 'Equal' || e.code === 'NumpadAdd') this.stepZoom(1);
            else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.stepZoom(-1);
            else if (e.key === '0') this.zoomToFit();
            else if (key === 'x') this.handleAction('swap-colors');
            else if (e.shiftKey && (key === 'v' || key === 's')) this.setTool('select-subpixel');
            else if (KEY_TOOLS[key]) this.setTool(KEY_TOOLS[key]);
            else return;
            e.preventDefault();
        });
    }

    // --- Utilities ---

    downloadText(text, filename) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}
