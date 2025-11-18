// Main application logic for the camera floor plan viewer

// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
let canvas = document.getElementById('pdf-canvas');
let ctx = canvas.getContext('2d');
let currentFloorPlan = null;
let currentActiveHotspot = null;
let hotspotsVisible = false; // Default to hidden

// Initialize the application
function init() {
    populateFloorSelector();
    setupEventListeners();
}

// Populate the floor plan dropdown
function populateFloorSelector() {
    const selector = document.getElementById('floor-selector');
    
    floorPlansConfig.forEach((floorPlan, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = floorPlan.name;
        selector.appendChild(option);
    });
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('floor-selector').addEventListener('change', handleFloorSelection);
    document.getElementById('zoom-in').addEventListener('click', () => adjustZoom(0.25));
    document.getElementById('zoom-out').addEventListener('click', () => adjustZoom(-0.25));
    document.getElementById('reset-zoom').addEventListener('click', resetZoom);
    document.getElementById('toggle-hotspots').addEventListener('click', toggleHotspots);
    
    // Double-click zoom event listener
    const pdfContainer = document.getElementById('pdf-container');
    pdfContainer.addEventListener('dblclick', handleDoubleClickZoom);
    
    // Single-click on PDF container (not on hotspot) clears camera view
    pdfContainer.addEventListener('click', handlePdfContainerClick);
}

// Handle clicks on the PDF container to clear camera view when not clicking hotspots
function handlePdfContainerClick(e) {
    // Only clear if clicking directly on the container or canvas (not on a hotspot)
    if (e.target === document.getElementById('pdf-container') || 
        e.target === document.getElementById('pdf-canvas')) {
        clearCameraView();
    }
}

// Toggle hotspot visibility
function toggleHotspots() {
    hotspotsVisible = !hotspotsVisible;
    const button = document.getElementById('toggle-hotspots');
    const hotspots = document.querySelectorAll('.camera-hotspot');
    
    if (hotspotsVisible) {
        button.textContent = 'Hide CAM Links';
        hotspots.forEach(hotspot => hotspot.classList.remove('hidden'));
    } else {
        button.textContent = 'Show CAM Links';
        hotspots.forEach(hotspot => hotspot.classList.add('hidden'));
    }
}

// Adjust zoom level (for zoom in/out buttons)
function adjustZoom(delta) {
    if (!pdfDoc) return;
    
    scale += delta;
    if (scale < 0.5) scale = 0.5;
    if (scale > 5) scale = 5;
    
    renderPage(pageNum);
}

// Handle double-click zoom
function handleDoubleClickZoom(e) {
    if (!pdfDoc) return;
    
    // Don't zoom if clicking on a hotspot
    if (e.target.classList.contains('camera-hotspot') || 
        e.target.parentElement?.classList.contains('camera-hotspot')) {
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const container = document.getElementById('pdf-container');
    
    // Get click position relative to canvas
    const clickX = e.clientX - rect.left + container.scrollLeft;
    const clickY = e.clientY - rect.top + container.scrollTop;
    
    // Define zoom area (100x100 pixels at current scale)
    const zoomAreaSize = 100;
    
    // Calculate the new scale to make the 100x100 area fill approximately the viewport
    // We want the 100px area to become roughly the size of the container
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Use the smaller dimension to ensure it fits
    const targetSize = Math.min(containerWidth, containerHeight) * 0.8; // 80% of viewport
    const zoomFactor = targetSize / zoomAreaSize;
    
    // Calculate new scale
    const newScale = scale * zoomFactor;
    
    // Limit zoom (max 5x)
    scale = Math.max(0.5, Math.min(5, newScale));
    
    // Store the click position for centering
    const zoomCenterX = clickX;
    const zoomCenterY = clickY;
    
    // Render with zoom
    renderPageAndCenter(zoomCenterX, zoomCenterY);
}

// Render page and center on specific coordinates
function renderPageAndCenter(centerX, centerY) {
    if (!pdfDoc) return;
    
    pageRendering = true;
    
    pdfDoc.getPage(pageNum).then(function(page) {
        const oldScale = scale / (scale / (canvas.width / page.getViewport({ scale: 1 }).width));
        const viewport = page.getViewport({ scale: scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        const renderTask = page.render(renderContext);
        
        renderTask.promise.then(function() {
            pageRendering = false;
            if (pageNumPending !== null) {
                renderPageAndCenter(pageNumPending);
                pageNumPending = null;
            } else {
                // After rendering, add camera hotspots
                addCameraHotspots();
                
                // Center on the clicked area
                const container = document.getElementById('pdf-container');
                const scaleRatio = scale / oldScale;
                
                const newCenterX = centerX * scaleRatio;
                const newCenterY = centerY * scaleRatio;
                
                container.scrollLeft = newCenterX - container.clientWidth / 2;
                container.scrollTop = newCenterY - container.clientHeight / 2;
            }
        });
    });
}

// Reset zoom to show full floor plan
function resetZoom() {
    if (!pdfDoc) return;
    
    // Automatically hide CAM links when resetting zoom
    if (hotspotsVisible) {
        hotspotsVisible = false;
        const button = document.getElementById('toggle-hotspots');
        button.textContent = 'Show CAM Links';
        // Hotspots will be hidden when re-rendered
    }
    
    // Clear camera view when resetting zoom
    clearCameraView();
    
    // Calculate scale needed to fit the entire PDF in the viewport
    pdfDoc.getPage(pageNum).then(function(page) {
        const viewport = page.getViewport({ scale: 1 });
        const container = document.getElementById('pdf-container');
        
        // Get PDF dimensions at scale 1
        const pdfWidth = viewport.width;
        const pdfHeight = viewport.height;
        
        // Get container dimensions
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Calculate scale to fit entire PDF with some padding
        const scaleX = (containerWidth * 0.95) / pdfWidth;  // 95% to add some margin
        const scaleY = (containerHeight * 0.95) / pdfHeight;
        
        // Use the smaller scale to ensure entire PDF fits
        scale = Math.min(scaleX, scaleY);
        
        renderPage(pageNum);
        
        // Center the PDF in the viewport
        setTimeout(() => {
            const newWidth = pdfWidth * scale;
            const newHeight = pdfHeight * scale;
            container.scrollLeft = Math.max(0, (newWidth - containerWidth) / 2);
            container.scrollTop = Math.max(0, (newHeight - containerHeight) / 2);
        }, 100);
    });
}

// Handle floor plan selection
function handleFloorSelection(e) {
    const index = e.target.value;
    if (index === '') {
        clearPdfContainer();
        clearCameraView();
        return;
    }
    
    currentFloorPlan = floorPlansConfig[index];
    loadPdf(currentFloorPlan.pdfFile);
    clearCameraView();
}

// Load PDF file
function loadPdf(url) {
    const loadingTask = pdfjsLib.getDocument(url);
    
    loadingTask.promise.then(function(pdf) {
        pdfDoc = pdf;
        // Load with 400x400 default zoom
        resetZoom();
    }).catch(function(error) {
        console.error('Error loading PDF:', error);
        alert('Error loading PDF: ' + error.message + '\n\nMake sure the PDF file exists at: ' + url);
    });
}

// Render a page of the PDF
function renderPage(num) {
    pageRendering = true;
    
    pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({ scale: scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        const renderTask = page.render(renderContext);
        
        renderTask.promise.then(function() {
            pageRendering = false;
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            } else {
                // After rendering, add camera hotspots
                addCameraHotspots();
            }
        });
    });
}

// Queue page rendering
function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// Clear the PDF container
function clearPdfContainer() {
    const container = document.getElementById('pdf-container');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Remove all existing hotspots
    const existingHotspots = container.querySelectorAll('.camera-hotspot');
    existingHotspots.forEach(hotspot => hotspot.remove());
    
    currentFloorPlan = null;
    pdfDoc = null;
    currentActiveHotspot = null;
}

// Clear the camera view
function clearCameraView() {
    const container = document.getElementById('camera-view-container');
    container.innerHTML = `
        <div class="placeholder">
            <div class="placeholder-icon">📹</div>
            <h3>No Camera Selected</h3>
            <p>Click on a camera hotspot in the floor plan to view its feed</p>
        </div>
    `;
    currentActiveHotspot = null;
}

// Load camera view in the right panel
function loadCameraView(camera, hotspotElement) {
    const container = document.getElementById('camera-view-container');
    
    // Remove active class from previous hotspot
    if (currentActiveHotspot) {
        currentActiveHotspot.classList.remove('active');
    }
    
    // Add active class to current hotspot
    hotspotElement.classList.add('active');
    currentActiveHotspot = hotspotElement;
    
    // Create iframe to load the camera view
    container.innerHTML = `<iframe id="camera-view-frame" src="${camera.viewFile}"></iframe>`;
    
    // Handle iframe load errors
    const iframe = document.getElementById('camera-view-frame');
    iframe.onerror = function() {
        container.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">⚠️</div>
                <h3>Error Loading Camera View</h3>
                <p>Could not load: ${camera.viewFile}</p>
                <p style="font-size: 12px; color: #666;">Make sure the file exists and the path is correct.</p>
            </div>
        `;
    };
}

// Add camera hotspots over the PDF
function addCameraHotspots() {
    if (!currentFloorPlan) return;
    
    const container = document.getElementById('pdf-container');
    
    // Remove existing hotspots
    const existingHotspots = container.querySelectorAll('.camera-hotspot');
    existingHotspots.forEach(hotspot => hotspot.remove());
    
    // Add new hotspots
    currentFloorPlan.cameras.forEach(camera => {
        const hotspot = document.createElement('div');
        hotspot.className = 'camera-hotspot';
        
        // Apply hidden class if hotspots are hidden (default is hidden)
        if (!hotspotsVisible) {
            hotspot.classList.add('hidden');
        }
        
        // Extract FOV label from camera ID
        // Examples: "C-L16-02-FOV1" -> "FOV 1", "C-L16-04" -> "FOV 1" (default)
        let fovLabel = "FOV 1"; // Default for single FOV cameras
        if (camera.id.includes('FOV')) {
            const fovMatch = camera.id.match(/FOV(\d+)/);
            if (fovMatch) {
                fovLabel = `FOV ${fovMatch[1]}`;
            }
        }
        
        // Set the text content
        hotspot.textContent = fovLabel;
        
        // Calculate position based on canvas size
        const left = (camera.position.x / 100) * canvas.width;
        const top = (camera.position.y / 100) * canvas.height;
        
        // Position the text label (no width/height needed - auto-sized by text)
        hotspot.style.left = left + 'px';
        hotspot.style.top = top + 'px';
        
        // Add tooltip that shows on hover
        hotspot.title = camera.id + ' - Click to view';
        
        // Add click handler - load in right panel instead of new window
        hotspot.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent any other events
            loadCameraView(camera, hotspot);
        });
        
        container.appendChild(hotspot);
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
