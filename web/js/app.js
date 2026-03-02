// Main application entry point

let canvasRenderer;
let toolbar;
let boxDrawLookup;

document.addEventListener('DOMContentLoaded', () => {
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
    canvasRenderer.loadCanvas();

    console.log('MOTD Editor initialized');
});
