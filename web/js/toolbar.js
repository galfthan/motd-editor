// Toolbar and controls functionality

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

// Single-key tool shortcuts (Shift+S is handled separately)
const TOOL_SHORTCUTS = {
    d: 'draw', e: 'erase', c: 'char', t: 'text',
    b: 'box', l: 'line', s: 'select', p: 'pick'
};

const toHex = ({ r, g, b }) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

const hexToRgb = (hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
});

// Wire a group of mutually exclusive buttons: clicking one marks it active
// and calls onPick with it
function bindButtonGroup(buttons, onPick) {
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.toggle('active', b === btn));
            onPick(btn);
        });
    });
}

class Toolbar {
    constructor(canvasRenderer) {
        this.renderer = canvasRenderer;
        this.currentTab = 'diagonal';
        this.openMenu = null;
        this.saveFilename = 'motd.txt';
        this.saveFormat = 'ansi';

        this.setupMenuBar();
        this.setupEditMenu();
        // Canvas menu check items, remembered in this browser once toggled
        this.toggleGrid = this.setupCanvasToggle('toggle-grid', 'motd-editor.grid', false,
            on => this.renderer.setShowGrid(on));
        this.toggleLightTerminal = this.setupCanvasToggle('toggle-light-terminal', 'motd-editor.lightTerminal', false,
            on => this.renderer.setLightTerminal(on));
        this.setupToolButtons();
        this.setupColorPickers();
        this.setupFileInputs();
        this.setupCharPalette();
        this.renderCharPalette();
    }

    // --- Menu Bar ---

    setupMenuBar() {
        const menuItems = document.querySelectorAll('.menu-item');

        // Click to open/close
        menuItems.forEach(item => {
            const trigger = item.querySelector('.menu-trigger');
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.openMenu === item) {
                    this.closeMenus();
                } else {
                    this.openMenuDropdown(item);
                }
            });

            // Hover-switch when a menu is already open
            trigger.addEventListener('mouseenter', () => {
                if (this.openMenu && this.openMenu !== item) {
                    this.openMenuDropdown(item);
                }
            });
        });

        // Click outside closes menus
        document.addEventListener('click', () => this.closeMenus());

        // Prevent dropdown clicks from bubbling (action buttons close explicitly)
        document.querySelectorAll('.menu-dropdown').forEach(dd => {
            dd.addEventListener('click', (e) => e.stopPropagation());
        });

        // Wire up menu actions
        document.querySelectorAll('.menu-dropdown button[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.closeMenus();
                this.handleMenuAction(action);
            });
        });
    }

    openMenuDropdown(item) {
        this.closeMenus();
        item.classList.add('open');
        this.openMenu = item;
    }

    closeMenus() {
        document.querySelectorAll('.menu-item.open').forEach(item => {
            item.classList.remove('open');
        });
        this.openMenu = null;
    }

    // Keep Undo/Redo enabled only when there is something to undo/redo
    setupEditMenu() {
        const undoBtn = document.querySelector('button[data-action="undo"]');
        const redoBtn = document.querySelector('button[data-action="redo"]');
        const history = this.renderer.history;
        const update = () => {
            undoBtn.disabled = !history.canUndo();
            redoBtn.disabled = !history.canRedo();
            undoBtn.title = history.undoLabel() ? `Undo ${history.undoLabel()}` : '';
            redoBtn.title = history.redoLabel() ? `Redo ${history.redoLabel()}` : '';
        };
        history.onChange = update;
        update();
    }

    // A check item in the Canvas menu: applies the saved choice (or the
    // default) now and returns a function that toggles it. The choice is only
    // saved once the user toggles it, so changing a default reaches everyone
    // who never chose. Storage may be unavailable (e.g. a private window):
    // then the default is used and nothing is remembered.
    setupCanvasToggle(action, key, defaultOn, apply) {
        const btn = document.querySelector(`button[data-action="${action}"]`);
        const set = (on) => {
            btn.setAttribute('aria-checked', String(on));
            apply(on);
        };
        let on = defaultOn;
        try {
            const saved = localStorage.getItem(key);
            if (saved !== null) on = saved === 'true';
        } catch (e) { /* default */ }
        set(on);
        return () => {
            const next = btn.getAttribute('aria-checked') !== 'true';
            set(next);
            try { localStorage.setItem(key, String(next)); } catch (e) { /* not saved */ }
        };
    }

    handleMenuAction(action) {
        switch (action) {
            case 'undo':
                this.renderer.undo();
                break;
            case 'redo':
                this.renderer.redo();
                break;
            case 'new':
                if (confirm('Create a new canvas? Unsaved changes will be lost.')) {
                    this.renderer.createNew(80, 60, 'sextant');
                    this.saveFilename = 'motd.txt';
                    this.saveFormat = 'ansi';
                }
                break;
            case 'open':
                document.getElementById('file-input').click();
                break;
            case 'save':
                this.doSave();
                break;
            case 'save-as':
                this.showSaveAsDialog();
                break;
            case 'toggle-grid':
                this.toggleGrid();
                break;
            case 'toggle-light-terminal':
                this.toggleLightTerminal();
                break;
            case 'resize':
                this.showResizeDialog();
                break;
            case 'clear':
                if (confirm('Clear the entire canvas?')) {
                    this.renderer.clear();
                }
                break;
        }
    }

    // --- Save / Save As ---

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
        const cancelBtn = document.getElementById('save-as-cancel');

        filenameInput.value = this.saveFilename;
        form.querySelectorAll('input[name="save-format"]').forEach(r => {
            r.checked = (r.value === this.saveFormat);
        });

        cancelBtn.onclick = () => dialog.close();

        form.onsubmit = (e) => {
            e.preventDefault();
            this.saveFilename = filenameInput.value || 'motd.txt';
            this.saveFormat = form.querySelector('input[name="save-format"]:checked').value;
            dialog.close();
            this.doSave();
        };

        dialog.showModal();
        filenameInput.select();
    }

    // --- Resize Dialog ---

    showResizeDialog() {
        const dialog = document.getElementById('resize-dialog');
        const form = document.getElementById('resize-form');
        const widthInput = document.getElementById('resize-width');
        const heightInput = document.getElementById('resize-height');
        const cancelBtn = document.getElementById('resize-cancel');

        if (this.renderer.canvas) {
            widthInput.value = this.renderer.canvas.width;
            heightInput.value = this.renderer.canvas.height;
        }

        cancelBtn.onclick = () => dialog.close();

        form.onsubmit = (e) => {
            e.preventDefault();
            const width = parseInt(widthInput.value) || 80;
            const height = parseInt(heightInput.value) || 60;
            this.renderer.resize(width, height);
            dialog.close();
        };

        dialog.showModal();
    }

    // --- Tool Buttons ---

    setupToolButtons() {
        // Tool buttons have ids "tool-<name>"
        const toolBtns = [...document.querySelectorAll('.tool-btn[id^="tool-"]')];
        const charPaletteSection = document.getElementById('char-palette-section');
        const boxStyleSection = document.getElementById('box-style-section');
        const boxFillSection = document.getElementById('box-fill-section');
        const brushSection = document.getElementById('brush-section');
        const noneStyleBtn = document.querySelector('.box-style-btn[data-style="0"]');
        const lightStyleBtn = document.querySelector('.box-style-btn[data-style="1"]');

        this.setTool = (tool) => {
            toolBtns.forEach(btn => btn.classList.toggle('active', btn.id === `tool-${tool}`));

            charPaletteSection.style.display = tool === 'char' ? 'block' : 'none';
            boxStyleSection.style.display = (tool === 'box' || tool === 'line') ? 'block' : 'none';
            boxFillSection.style.display = tool === 'box' ? 'block' : 'none';
            brushSection.style.display = (tool === 'draw' || tool === 'erase') ? 'block' : 'none';

            // "None" line style is a no-op for the line tool, so hide it there.
            // If it was selected, fall back to Light.
            noneStyleBtn.style.display = (tool === 'line') ? 'none' : '';
            if (tool === 'line' && this.renderer.boxLineStyle === 0) {
                lightStyleBtn.click();
            }

            this.renderer.setTool(tool);
        };

        toolBtns.forEach(btn => {
            btn.addEventListener('click', () => this.setTool(btn.id.slice('tool-'.length)));
        });

        bindButtonGroup(document.querySelectorAll('.box-style-btn'), btn => {
            this.renderer.boxLineStyle = parseInt(btn.dataset.style);
        });
        bindButtonGroup(document.querySelectorAll('.box-fill-btn'), btn => {
            this.renderer.boxFillMode = parseInt(btn.dataset.fill);
        });
        bindButtonGroup(document.querySelectorAll('.brush-btn'), btn => {
            this.renderer.brushCell = btn.dataset.brush === 'cell';
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Ctrl+S: Save, Ctrl+Shift+S: Save As
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.showSaveAsDialog();
                } else {
                    this.doSave();
                }
                return;
            }

            // Escape: close menus first
            if (e.key === 'Escape' && this.openMenu) {
                this.closeMenus();
                return;
            }

            // Skip tool shortcuts when modifier keys are held (Ctrl+C, etc.)
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // Skip tool shortcuts when text cursor is active (typing goes to canvas)
            if (this.renderer.tool === 'text' && this.renderer.textCursor) return;

            const key = e.key.toLowerCase();
            const tool = (e.shiftKey && key === 's') ? 'select-subpixel' : TOOL_SHORTCUTS[key];
            if (tool) this.setTool(tool);
        });
    }

    // --- Color Pickers ---

    setupColorPickers() {
        for (const which of ['fg', 'bg']) {
            const input = document.getElementById(`${which}-color`);
            const isDefault = document.getElementById(`${which}-default`);
            const update = () => this.setColor(which, { ...hexToRgb(input.value), default: isDefault.checked });
            input.addEventListener('input', update);
            isDefault.addEventListener('change', update);
            update();
        }
    }

    // Make `color` the current fg/bg colour ("Def" colours grey out the picker)
    setColor(which, color) {
        document.getElementById(`${which}-color-row`).classList.toggle('color-inactive', color.default);
        if (which === 'fg') {
            this.renderer.setFgColor(color);
        } else {
            this.renderer.setBgColor(color);
        }
    }

    // Set both colours, updating the pickers to match (used by the pick tool)
    setColors(fg, bg) {
        for (const [which, color] of [['fg', fg], ['bg', bg]]) {
            document.getElementById(`${which}-color`).value = toHex(color);
            document.getElementById(`${which}-default`).checked = color.default;
            this.setColor(which, color);
        }
    }

    // --- File Inputs ---

    setupFileInputs() {
        const fileInput = document.getElementById('file-input');

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const canvas = parseANSIText(reader.result);
                    this.renderer.setCanvas(canvas);
                    this.saveFilename = file.name;
                    this.saveFormat = 'ansi';
                } catch (error) {
                    alert('Failed to open: ' + error.message);
                }
            };
            reader.readAsText(file);
            fileInput.value = '';
        });
    }

    // --- Character Palette ---

    setupCharPalette() {
        const tabs = document.querySelectorAll('.char-tabs .tab-btn');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;
                this.renderCharPalette();
            });
        });

        document.getElementById('emoji-search').addEventListener('input', () => this.renderCharPalette());
    }

    // Palette sections [{ title, chars: [{ code, name }] }] for a tab. Only the
    // emoji tab has titled sections (its Unicode groups), filtered by `query`.
    getPaletteSections(tab, query) {
        if (tab === 'emoji') {
            return EMOJI_GROUPS
                .map(group => ({
                    title: group.name,
                    chars: group.emoji
                        .filter(([, name]) => name.includes(query))
                        .map(([code, name]) => ({ code, name }))
                }))
                .filter(section => section.chars.length > 0);
        }
        if (tab === 'diagonal') return [{ chars: DIAGONAL_CHARS }];
        if (tab === 'triangle') return [{ chars: TRIANGLE_CHARS }];
        return [{ chars: (LEGACY_CHARS[tab] || []).map(([code, name]) => ({ code, name })) }];
    }

    renderCharPalette() {
        const palette = document.getElementById('char-palette');
        const search = document.getElementById('emoji-search');
        const isEmoji = this.currentTab === 'emoji';
        search.style.display = isEmoji ? '' : 'none';
        palette.classList.toggle('emoji-grid', isEmoji);
        palette.innerHTML = '';

        const query = isEmoji ? search.value.trim().toLowerCase() : '';
        const sections = this.getPaletteSections(this.currentTab, query);
        if (sections.length === 0) {
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

                btn.addEventListener('click', () => {
                    palette.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    this.renderer.setSelectedChar(charInfo.code);
                });
                palette.appendChild(btn);
            }
        }
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
