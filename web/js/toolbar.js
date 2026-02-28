// Toolbar and controls functionality

class Toolbar {
    constructor(canvasRenderer) {
        this.renderer = canvasRenderer;
        this.diagonalChars = [];
        this.triangleChars = [];
        this.currentTab = 'diagonal';

        this.setupToolButtons();
        this.setupColorPickers();
        this.setupCanvasControls();
        this.setupFileButtons();
        this.setupCharPalette();
        this.loadCharsets();
    }

    setupToolButtons() {
        const toolDraw = document.getElementById('tool-draw');
        const toolErase = document.getElementById('tool-erase');
        const toolChar = document.getElementById('tool-char');
        const toolText = document.getElementById('tool-text');
        const toolSelect = document.getElementById('tool-select');
        const toolSelectSubpixel = document.getElementById('tool-select-subpixel');
        const toolBox = document.getElementById('tool-box');
        const toolPick = document.getElementById('tool-pick');
        const charPaletteSection = document.getElementById('char-palette-section');
        const boxStyleSection = document.getElementById('box-style-section');

        this.setTool = (tool) => {
            toolDraw.classList.toggle('active', tool === 'draw');
            toolErase.classList.toggle('active', tool === 'erase');
            toolChar.classList.toggle('active', tool === 'char');
            toolText.classList.toggle('active', tool === 'text');
            toolBox.classList.toggle('active', tool === 'box');
            toolSelect.classList.toggle('active', tool === 'select');
            toolSelectSubpixel.classList.toggle('active', tool === 'select-subpixel');
            toolPick.classList.toggle('active', tool === 'pick');
            charPaletteSection.style.display = tool === 'char' ? 'block' : 'none';
            boxStyleSection.style.display = tool === 'box' ? 'block' : 'none';
            this.renderer.setTool(tool);
        };

        toolDraw.addEventListener('click', () => this.setTool('draw'));
        toolErase.addEventListener('click', () => this.setTool('erase'));
        toolChar.addEventListener('click', () => this.setTool('char'));
        toolText.addEventListener('click', () => this.setTool('text'));
        toolBox.addEventListener('click', () => this.setTool('box'));
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
            if (e.target.tagName === 'INPUT') return;
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
                case 's': this.setTool('select'); break;
                case 'p': this.setTool('pick'); break;
            }
        });
    }

    setupColorPickers() {
        const fgColor = document.getElementById('fg-color');
        const bgColor = document.getElementById('bg-color');
        const fgDefault = document.getElementById('fg-default');
        const bgDefault = document.getElementById('bg-default');

        const updateFg = () => {
            const hex = fgColor.value;
            const r = parseInt(hex.substr(1, 2), 16);
            const g = parseInt(hex.substr(3, 2), 16);
            const b = parseInt(hex.substr(5, 2), 16);
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
            this.renderer.setBgColor({
                r, g, b,
                default: bgDefault.checked
            });
        };

        fgColor.addEventListener('input', updateFg);
        fgDefault.addEventListener('change', updateFg);
        bgColor.addEventListener('input', updateBg);
        bgDefault.addEventListener('change', updateBg);
    }

    setupCanvasControls() {
        const widthInput = document.getElementById('canvas-width');
        const heightInput = document.getElementById('canvas-height');
        const resizeBtn = document.getElementById('btn-resize');
        const clearBtn = document.getElementById('btn-clear');

        resizeBtn.addEventListener('click', () => {
            const width = parseInt(widthInput.value) || 40;
            const height = parseInt(heightInput.value) || 20;
            this.renderer.resize(width, height);
        });

        clearBtn.addEventListener('click', () => {
            if (confirm('Clear the entire canvas?')) {
                this.renderer.clear();
            }
        });
    }

    setupFileButtons() {
        const saveBtn = document.getElementById('btn-save');
        const savePlainBtn = document.getElementById('btn-save-plain');
        const loadBtn = document.getElementById('btn-load');
        const importPngBtn = document.getElementById('btn-import-png');
        const fileInput = document.getElementById('file-input');
        const pngInput = document.getElementById('png-input');

        // Save with ANSI
        saveBtn.addEventListener('click', async () => {
            try {
                const text = await API.downloadTxt();
                this.downloadText(text, 'ascii-art.txt');
            } catch (error) {
                alert('Failed to save: ' + error.message);
            }
        });

        // Save plain
        savePlainBtn.addEventListener('click', async () => {
            try {
                const text = await API.downloadPlain();
                this.downloadText(text, 'ascii-art.txt');
            } catch (error) {
                alert('Failed to save: ' + error.message);
            }
        });

        // Load
        loadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const canvas = await API.importTxt(file);
                this.renderer.setCanvas(canvas);
            } catch (error) {
                alert('Failed to load: ' + error.message);
            }
            fileInput.value = '';
        });

        // Import PNG
        importPngBtn.addEventListener('click', () => pngInput.click());
        pngInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            this.showPngDialog(file);
            pngInput.value = '';
        });
    }

    setupCharPalette() {
        const tabs = document.querySelectorAll('.char-tabs .tab-btn');
        const palette = document.getElementById('char-palette');

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

    renderCharPalette() {
        const palette = document.getElementById('char-palette');
        palette.innerHTML = '';

        const chars = this.currentTab === 'diagonal' ? this.diagonalChars : this.triangleChars;

        chars.forEach(charInfo => {
            const btn = document.createElement('button');
            btn.textContent = charInfo.char;
            btn.title = charInfo.name || `U+${charInfo.code.toString(16).toUpperCase()}`;
            btn.addEventListener('click', () => {
                // Remove selected from all buttons
                palette.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.renderer.setSelectedChar(charInfo.code);
            });
            palette.appendChild(btn);
        });
    }

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

        // Convert RGB to hex
        const toHex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

        fgColor.value = toHex(fg.r, fg.g, fg.b);
        fgDefault.checked = fg.default;
        this.renderer.setFgColor(fg);

        bgColor.value = toHex(bg.r, bg.g, bg.b);
        bgDefault.checked = bg.default;
        this.renderer.setBgColor(bg);
    }
}
