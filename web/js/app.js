// Main application entry point

let canvasRenderer;
let toolbar;
let boxDrawLookup;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize bitmap renderer for extended characters (diagonals, triangles)
    // Cell dimensions: 16x32 (2x scale of 8x16 Unifont, matching CSS .cell width/height)
    bitmapRenderer = new BitmapRenderer(16, 32);
    await bitmapRenderer.init();

    // Initialize box-drawing character lookup
    boxDrawLookup = new BoxDrawLookup();

    // Initialize canvas renderer
    const canvasEl = document.getElementById('canvas');
    canvasRenderer = new CanvasRenderer(canvasEl);

    // Initialize toolbar
    toolbar = new Toolbar(canvasRenderer);

    // Connect toolbar to canvas renderer for pick tool
    canvasRenderer.toolbar = toolbar;

    // Load initial canvas
    await canvasRenderer.loadCanvas();

    console.log('MOTD Editor initialized');
});
