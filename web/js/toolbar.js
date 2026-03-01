// Toolbar and controls functionality

// Additional Symbols for Legacy Computing characters (U+1FB70-U+1FBFA)
// Grouped by category for the character palette tabs
const LEGACY_CHARS = {
    blocks: [
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

class Toolbar {
    constructor(canvasRenderer) {
        this.renderer = canvasRenderer;
        this.diagonalChars = [];
        this.triangleChars = [];
        this.currentTab = 'diagonal';
        this.openMenu = null;
        this.saveFilename = 'motd.txt';
        this.saveFormat = 'ansi';

        this.setupMenuBar();
        this.setupToolButtons();
        this.setupColorPickers();
        this.setupRenderToggle();
        this.setupFileInputs();
        this.setupCharPalette();
        this.loadCharsets();
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

    handleMenuAction(action) {
        switch (action) {
            case 'new':
                if (confirm('Create a new canvas? Unsaved changes will be lost.')) {
                    this.renderer.createNew(40, 20, 'sextant');
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
            case 'import-png':
                document.getElementById('png-input').click();
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

    async doSave() {
        try {
            const text = this.saveFormat === 'ansi'
                ? await API.downloadTxt()
                : await API.downloadPlain();
            this.downloadText(text, this.saveFilename);
        } catch (error) {
            alert('Failed to save: ' + error.message);
        }
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

        form.onsubmit = async (e) => {
            e.preventDefault();
            this.saveFilename = filenameInput.value || 'motd.txt';
            this.saveFormat = form.querySelector('input[name="save-format"]:checked').value;
            dialog.close();
            await this.doSave();
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
            const width = parseInt(widthInput.value) || 40;
            const height = parseInt(heightInput.value) || 20;
            this.renderer.resize(width, height);
            dialog.close();
        };

        dialog.showModal();
    }

    // --- Tool Buttons ---

    setupToolButtons() {
        const toolDraw = document.getElementById('tool-draw');
        const toolErase = document.getElementById('tool-erase');
        const toolChar = document.getElementById('tool-char');
        const toolText = document.getElementById('tool-text');
        const toolSelect = document.getElementById('tool-select');
        const toolSelectSubpixel = document.getElementById('tool-select-subpixel');
        const toolBox = document.getElementById('tool-box');
        const toolLine = document.getElementById('tool-line');
        const toolPick = document.getElementById('tool-pick');
        const charPaletteSection = document.getElementById('char-palette-section');
        const boxStyleSection = document.getElementById('box-style-section');

        this.setTool = (tool) => {
            toolDraw.classList.toggle('active', tool === 'draw');
            toolErase.classList.toggle('active', tool === 'erase');
            toolChar.classList.toggle('active', tool === 'char');
            toolText.classList.toggle('active', tool === 'text');
            toolBox.classList.toggle('active', tool === 'box');
            toolLine.classList.toggle('active', tool === 'line');
            toolSelect.classList.toggle('active', tool === 'select');
            toolSelectSubpixel.classList.toggle('active', tool === 'select-subpixel');
            toolPick.classList.toggle('active', tool === 'pick');

            const showCharPalette = tool === 'char';
            const showBoxStyle = tool === 'box' || tool === 'line';
            charPaletteSection.style.display = showCharPalette ? 'block' : 'none';
            boxStyleSection.style.display = showBoxStyle ? 'block' : 'none';

            this.renderer.setTool(tool);
        };

        toolDraw.addEventListener('click', () => this.setTool('draw'));
        toolErase.addEventListener('click', () => this.setTool('erase'));
        toolChar.addEventListener('click', () => this.setTool('char'));
        toolText.addEventListener('click', () => this.setTool('text'));
        toolBox.addEventListener('click', () => this.setTool('box'));
        toolLine.addEventListener('click', () => this.setTool('line'));
        toolSelect.addEventListener('click', () => this.setTool('select'));
        toolSelectSubpixel.addEventListener('click', () => this.setTool('select-subpixel'));
        toolPick.addEventListener('click', () => this.setTool('pick'));

        // Box line style buttons
        const boxStyleBtns = document.querySelectorAll('.box-style-btn');
        boxStyleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                boxStyleBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderer.boxLineStyle = parseInt(btn.dataset.style);
            });
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
            if (e.key === 'Escape') {
                if (this.openMenu) {
                    this.closeMenus();
                    return;
                }
            }

            // Skip tool shortcuts when modifier keys are held (Ctrl+C, etc.)
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // Skip tool shortcuts when text cursor is active (typing goes to canvas)
            if (this.renderer.tool === 'text' && this.renderer.textCursor) return;
            if (e.shiftKey && e.key.toLowerCase() === 's') {
                this.setTool('select-subpixel');
                return;
            }
            switch (e.key.toLowerCase()) {
                case 'd': this.setTool('draw'); break;
                case 'e': this.setTool('erase'); break;
                case 'c': this.setTool('char'); break;
                case 't': this.setTool('text'); break;
                case 'b': this.setTool('box'); break;
                case 'l': this.setTool('line'); break;
                case 's': this.setTool('select'); break;
                case 'p': this.setTool('pick'); break;
            }
        });
    }

    // --- Color Pickers ---

    setupColorPickers() {
        const fgColor = document.getElementById('fg-color');
        const bgColor = document.getElementById('bg-color');
        const fgDefault = document.getElementById('fg-default');
        const bgDefault = document.getElementById('bg-default');

        const fgRow = document.getElementById('fg-color-row');
        const bgRow = document.getElementById('bg-color-row');

        const updateFg = () => {
            const hex = fgColor.value;
            const r = parseInt(hex.substr(1, 2), 16);
            const g = parseInt(hex.substr(3, 2), 16);
            const b = parseInt(hex.substr(5, 2), 16);
            fgRow.classList.toggle('color-inactive', fgDefault.checked);
            this.renderer.setFgColor({
                r, g, b,
                default: fgDefault.checked
            });
        };

        const updateBg = () => {
            const hex = bgColor.value;
            const r = parseInt(hex.substr(1, 2), 16);
            const g = parseInt(hex.substr(3, 2), 16);
            const b = parseInt(hex.substr(5, 2), 16);
            bgRow.classList.toggle('color-inactive', bgDefault.checked);
            this.renderer.setBgColor({
                r, g, b,
                default: bgDefault.checked
            });
        };

        // Set initial inactive state
        fgRow.classList.toggle('color-inactive', fgDefault.checked);
        bgRow.classList.toggle('color-inactive', bgDefault.checked);

        fgColor.addEventListener('input', updateFg);
        fgDefault.addEventListener('change', updateFg);
        bgColor.addEventListener('input', updateBg);
        bgDefault.addEventListener('change', updateBg);
    }

    // --- Render Toggle ---

    setupRenderToggle() {
        const btns = document.querySelectorAll('.render-mode-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderer.fontMode = btn.dataset.mode;
                this.renderer.render();
                this.renderCharPalette();
            });
        });
    }

    // --- File Inputs ---

    setupFileInputs() {
        const fileInput = document.getElementById('file-input');
        const pngInput = document.getElementById('png-input');

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const canvas = await API.importTxt(file);
                this.renderer.setCanvas(canvas);
                this.saveFilename = file.name;
                this.saveFormat = 'ansi';
            } catch (error) {
                alert('Failed to open: ' + error.message);
            }
            fileInput.value = '';
        });

        pngInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this.showPngDialog(file);
            pngInput.value = '';
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
    }

    async loadCharsets() {
        try {
            [this.diagonalChars, this.triangleChars] = await Promise.all([
                API.getDiagonalChars(),
                API.getTriangleChars()
            ]);
            this.renderCharPalette();
        } catch (error) {
            console.error('Failed to load charsets:', error);
        }
    }

    getCharsForTab(tab) {
        if (tab === 'diagonal') return this.diagonalChars;
        if (tab === 'triangle') return this.triangleChars;
        const legacy = LEGACY_CHARS[tab];
        if (legacy) {
            return legacy.map(([code, name]) => ({
                char: String.fromCodePoint(code),
                code,
                name,
            }));
        }
        return [];
    }

    renderCharPalette() {
        const palette = document.getElementById('char-palette');
        palette.innerHTML = '';

        const chars = this.getCharsForTab(this.currentTab);

        // Palette display colors: white on toolbar background
        const paletteFG = { r: 255, g: 255, b: 255, default: false };
        const paletteBG = { r: 37, g: 37, b: 37, default: false };

        chars.forEach(charInfo => {
            const btn = document.createElement('button');
            btn.title = charInfo.name || `U+${charInfo.code.toString(16).toUpperCase()}`;

            // Use bitmap renderer for consistent look with canvas
            const useBitmap = this.renderer.fontMode !== 'font'
                && bitmapRenderer && bitmapRenderer.ready
                && bitmapRenderer.hasGlyph(charInfo.code);

            if (useBitmap) {
                const img = bitmapRenderer.createImage(charInfo.code, paletteFG, paletteBG);
                if (img) {
                    btn.appendChild(img);
                } else {
                    btn.textContent = charInfo.char;
                }
            } else {
                // Font mode
                const code = charInfo.code;
                const isTiling = (code >= 0x1FB00 && code <= 0x1FBAF)
                    || (code >= 0x1FBCE && code <= 0x1FBDF);
                const span = document.createElement('span');
                span.textContent = charInfo.char;
                span.style.fontFamily = "'Noto Sans Symbols 2', 'Cascadia Code', 'Consolas', monospace";
                span.style.fontSize = '16px';
                span.style.lineHeight = '1';
                if (isTiling) {
                    span.style.transform = 'scaleY(2) translateY(1px)';
                }
                btn.appendChild(span);
            }

            btn.addEventListener('click', () => {
                palette.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.renderer.setSelectedChar(charInfo.code);
            });
            palette.appendChild(btn);
        });
    }

    // --- PNG Import ---

    showPngDialog(file) {
        const dialog = document.getElementById('png-dialog');
        const form = document.getElementById('png-form');
        const thresholdInput = document.getElementById('png-threshold');
        const thresholdValue = document.getElementById('png-threshold-value');
        const cancelBtn = document.getElementById('png-cancel');

        // Update threshold display
        thresholdInput.addEventListener('input', () => {
            thresholdValue.textContent = thresholdInput.value;
        });

        cancelBtn.addEventListener('click', () => dialog.close());

        form.onsubmit = async (e) => {
            e.preventDefault();

            const options = {
                width: parseInt(document.getElementById('png-width').value) || 80,
                threshold: parseInt(thresholdInput.value),
                invert: document.getElementById('png-invert').checked,
                color: document.getElementById('png-color').checked,
                bitmap: document.getElementById('png-bitmap').checked,
                extended: document.getElementById('png-extended').checked
            };

            try {
                const canvas = await API.importPNG(file, options);
                this.renderer.setCanvas(canvas);
                dialog.close();
            } catch (error) {
                alert('Failed to import PNG: ' + error.message);
            }
        };

        dialog.showModal();
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

    setColors(fg, bg) {
        const fgColor = document.getElementById('fg-color');
        const bgColor = document.getElementById('bg-color');
        const fgDefault = document.getElementById('fg-default');
        const bgDefault = document.getElementById('bg-default');

        const toHex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

        fgColor.value = toHex(fg.r, fg.g, fg.b);
        fgDefault.checked = fg.default;
        document.getElementById('fg-color-row').classList.toggle('color-inactive', fg.default);
        this.renderer.setFgColor(fg);

        bgColor.value = toHex(bg.r, bg.g, bg.b);
        bgDefault.checked = bg.default;
        document.getElementById('bg-color-row').classList.toggle('color-inactive', bg.default);
        this.renderer.setBgColor(bg);
    }
}
