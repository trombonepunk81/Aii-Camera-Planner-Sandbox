// Main application logic for the camera floor plan viewer
// Version 3.1 - Firebase Real-time Database Integration

// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyC-yHyl8MBiCS455xHIDYkMLDXOyf83_8Y",
    authDomain: "project-001-camera-planner.firebaseapp.com",
    databaseURL: "https://project-001-camera-planner-default-rtdb.firebaseio.com",
    projectId: "project-001-camera-planner",
    storageBucket: "project-001-camera-planner.firebasestorage.app",
    messagingSenderId: "461451825806",
    appId: "1:461451825806:web:7267d184ca0718436befdf"
};

// Initialize Firebase only if not already done
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const commentsRef = database.ref('comments');

// ==========================================
// PDF.js INITIALIZATION
// ==========================================
pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ==========================================
// STATE VARIABLES
// ==========================================
let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
let canvas = document.getElementById('pdf-canvas');
let ctx = canvas.getContext('2d');
let currentFloorPlan = null;
let currentActiveHotspot = null;
let currentCamera = null;
let hotspotsVisible = false;

// Comments state
let commentsPanelOpen = false;
let commentsPanelMode = null; // 'floor' or 'fov'
let shouldOpenCommentsAfterLoad = false;
let commentsData = []; // Will be populated from Firebase

// Load saved author name (still use localStorage for user preference)
const savedAuthor = localStorage.getItem('cameraPlanner_authorName');
if (savedAuthor) {
    document.getElementById('comment-author').value = savedAuthor;
}

// ==========================================
// INITIALIZATION
// ==========================================
function init() {
    populateFloorSelector();
    setupEventListeners();
    setupIframeMessageListener();
    initializeFirebaseListeners();
    checkUrlParameters();
}

function initializeFirebaseListeners() {
    // Listen for comments changes (real-time!)
    commentsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        commentsData = data ? Object.entries(data).map(([key, value]) => ({
            ...value,
            firebaseKey: key
        })) : [];
        
        // Update floor comments count
        updateFloorCommentsCount();
        
        // Refresh comments panel if open
        if (commentsPanelOpen) {
            if (commentsPanelMode === 'floor') {
                renderFloorCommentsInPanel();
            } else if (commentsPanelMode === 'fov') {
                renderFOVCommentsInPanel();
            }
        }
    });
}

// Check URL parameters for direct navigation
function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const floorId = urlParams.get('floor');
    const cameraId = urlParams.get('camera');
    const openComments = urlParams.get('openComments');
    
    // Store whether to open comments after camera loads
    shouldOpenCommentsAfterLoad = openComments === 'true';
    
    if (floorId) {
        const floorIndex = floorPlansConfig.findIndex(f => f.name === floorId);
        if (floorIndex !== -1) {
            document.getElementById('floor-selector').value = floorIndex;
            currentFloorPlan = floorPlansConfig[floorIndex];
            loadPdfAndNavigateToCamera(currentFloorPlan.pdfFile, cameraId);
        }
    }
}

// Load PDF and navigate to specific camera
function loadPdfAndNavigateToCamera(url, cameraId) {
    const loadingTask = pdfjsLib.getDocument(url);
    
    loadingTask.promise.then(function(pdf) {
        pdfDoc = pdf;
        document.getElementById('floor-comments-btn').disabled = false;
        updateFloorCommentsCount();
        
        if (cameraId) {
            const camera = currentFloorPlan.cameras.find(c => c.id === cameraId);
            if (camera) {
                navigateToCamera(camera);
            } else {
                resetZoom();
            }
        } else {
            resetZoom();
        }
    }).catch(function(error) {
        console.error('Error loading PDF:', error);
        alert('Error loading PDF: ' + error.message);
    });
}

// Navigate to a specific camera
function navigateToCamera(camera) {
    if (!pdfDoc || !currentFloorPlan) return;
    
    if (!hotspotsVisible) {
        hotspotsVisible = true;
        document.getElementById('toggle-hotspots').textContent = 'Hide CAM Links';
    }
    
    pdfDoc.getPage(pageNum).then(function(page) {
        const viewport = page.getViewport({ scale: 1 });
        const container = document.getElementById('pdf-container');
        
        scale = 3;
        
        const centerX = (camera.position.x / 100) * viewport.width * scale;
        const centerY = (camera.position.y / 100) * viewport.height * scale;
        
        const zoomedViewport = page.getViewport({ scale: scale });
        canvas.height = zoomedViewport.height;
        canvas.width = zoomedViewport.width;
        
        const renderContext = {
            canvasContext: ctx,
            viewport: zoomedViewport
        };
        
        page.render(renderContext).promise.then(function() {
            addCameraHotspots();
            
            setTimeout(() => {
                container.scrollLeft = centerX - container.clientWidth / 2;
                container.scrollTop = centerY - container.clientHeight / 2;
                
                const hotspots = document.querySelectorAll('.camera-hotspot');
                hotspots.forEach(hotspot => {
                    if (hotspot.title.startsWith(camera.id)) {
                        loadCameraView(camera, hotspot);
                    }
                });
            }, 100);
        });
    });
}

// Setup listener for messages from iframe
function setupIframeMessageListener() {
    window.addEventListener('message', function(event) {
        if (event.data.type === 'addComment') {
            addComment(event.data.comment);
        } else if (event.data.type === 'openComments') {
            // Message from iframe to open FOV comments
            openFOVComments();
        }
    });
}

// ==========================================
// UNIFIED COMMENTS PANEL FUNCTIONS
// ==========================================

function openFloorComments() {
    if (!currentFloorPlan) return;
    
    commentsPanelMode = 'floor';
    commentsPanelOpen = true;
    
    document.getElementById('cp-title').textContent = 'Floor Comments';
    document.getElementById('cp-subtitle').textContent = currentFloorPlan.name;
    document.getElementById('cp-form').classList.remove('active'); // Hide form for floor comments
    
    renderFloorCommentsInPanel();
    document.getElementById('comments-panel').classList.add('active');
}

function openFOVComments() {
    if (!currentCamera || !currentFloorPlan) return;
    
    commentsPanelMode = 'fov';
    commentsPanelOpen = true;
    
    document.getElementById('cp-title').textContent = 'Camera Comments';
    document.getElementById('cp-subtitle').textContent = currentCamera.id;
    document.getElementById('cp-form').classList.add('active'); // Show form for FOV comments
    
    renderFOVCommentsInPanel();
    document.getElementById('comments-panel').classList.add('active');
}

function closeCommentsPanel() {
    commentsPanelOpen = false;
    commentsPanelMode = null;
    document.getElementById('comments-panel').classList.remove('active');
}

function renderFloorCommentsInPanel() {
    if (!currentFloorPlan) return;
    
    const container = document.getElementById('cp-body');
    const comments = getCommentsForFloor(currentFloorPlan.name);
    
    if (comments.length === 0) {
        container.innerHTML = `
            <div class="cp-no-comments">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                </svg>
                <p>No comments for this floor</p>
                <p style="font-size: 0.8rem; margin-top: 0.5rem;">Comments added to cameras will appear here</p>
            </div>
        `;
        return;
    }
    
    const sorted = [...comments].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    container.innerHTML = sorted.map(comment => `
        <div class="cp-comment" onclick="navigateToCameraFromComment('${escapeAttr(comment.cameraId)}')">
            <div class="cp-comment-header">
                <span class="cp-comment-camera">${escapeHtml(comment.cameraId)}</span>
                <span class="cp-comment-time">${formatTimestamp(comment.timestamp)}</span>
            </div>
            <div class="cp-comment-author">${escapeHtml(comment.author)}</div>
            <div class="cp-comment-text">${escapeHtml(comment.text)}</div>
            <div class="cp-comment-nav">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
                Click to view camera
            </div>
        </div>
    `).join('');
}

function renderFOVCommentsInPanel() {
    if (!currentCamera) return;
    
    const container = document.getElementById('cp-body');
    const comments = getCommentsForCamera(currentCamera.id);
    
    if (comments.length === 0) {
        container.innerHTML = `
            <div class="cp-no-comments">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                </svg>
                <p>No comments yet</p>
                <p style="font-size: 0.8rem; margin-top: 0.5rem;">Add a comment below</p>
            </div>
        `;
        return;
    }
    
    const sorted = [...comments].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    container.innerHTML = sorted.map(comment => `
        <div class="cp-comment no-click">
            <div class="cp-comment-header">
                <span class="cp-comment-author" style="color: #3b82f6;">${escapeHtml(comment.author)}</span>
                <span class="cp-comment-time">${formatTimestamp(comment.timestamp)}</span>
            </div>
            <div class="cp-comment-text">${escapeHtml(comment.text)}</div>
        </div>
    `).join('');
}

function submitComment() {
    if (!currentCamera || !currentFloorPlan) {
        alert('Please select a camera first');
        return;
    }
    
    const authorInput = document.getElementById('comment-author');
    const textInput = document.getElementById('comment-text');
    
    const author = authorInput.value.trim();
    const text = textInput.value.trim();
    
    if (!author) {
        alert('Please enter your name');
        authorInput.focus();
        return;
    }
    
    if (!text) {
        alert('Please enter a comment');
        textInput.focus();
        return;
    }
    
    // Save author name locally
    localStorage.setItem('cameraPlanner_authorName', author);
    
    // Add comment to Firebase
    addComment({
        cameraId: currentCamera.id,
        author: author,
        text: text
    });
    
    // Clear text input
    textInput.value = '';
}

function navigateToCameraFromComment(cameraId) {
    if (!currentFloorPlan) return;
    
    const camera = currentFloorPlan.cameras.find(c => c.id === cameraId);
    if (camera) {
        closeCommentsPanel();
        navigateToCamera(camera);
    }
}

// ==========================================
// COMMENTS DATA FUNCTIONS (FIREBASE)
// ==========================================

function getCommentsForCamera(cameraId) {
    return commentsData.filter(c => c.cameraId === cameraId && !c.archived);
}

function getCommentsForFloor(floorId) {
    return commentsData.filter(c => c.floorId === floorId && !c.archived);
}

function addComment(commentData) {
    const newComment = {
        id: Date.now(),
        cameraId: commentData.cameraId,
        floorId: currentFloorPlan ? currentFloorPlan.name : '',
        author: commentData.author || 'Anonymous',
        text: commentData.text,
        timestamp: new Date().toISOString(),
        archived: false
    };
    
    // Push to Firebase (will auto-generate key)
    commentsRef.push(newComment);
    
    // Notify iframe if it exists
    const iframe = document.getElementById('camera-view-frame');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'commentAdded',
            comment: newComment
        }, '*');
    }
}

function updateFloorCommentsCount() {
    if (!currentFloorPlan) return;
    
    const comments = getCommentsForFloor(currentFloorPlan.name);
    document.getElementById('floor-comment-count').textContent = comments.length;
}

// ==========================================
// FLOOR PLAN & PDF FUNCTIONS
// ==========================================

function populateFloorSelector() {
    const selector = document.getElementById('floor-selector');
    
    floorPlansConfig.forEach((floorPlan, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = floorPlan.name;
        selector.appendChild(option);
    });
}

function setupEventListeners() {
    document.getElementById('floor-selector').addEventListener('change', handleFloorSelection);
    document.getElementById('zoom-in').addEventListener('click', () => adjustZoom(0.25));
    document.getElementById('zoom-out').addEventListener('click', () => adjustZoom(-0.25));
    document.getElementById('reset-zoom').addEventListener('click', resetZoom);
    document.getElementById('toggle-hotspots').addEventListener('click', toggleHotspots);
    
    const pdfContainer = document.getElementById('pdf-container');
    pdfContainer.addEventListener('dblclick', handleDoubleClickZoom);
    pdfContainer.addEventListener('click', handlePdfContainerClick);
}

function handlePdfContainerClick(e) {
    if (e.target === document.getElementById('pdf-container') || 
        e.target === document.getElementById('pdf-canvas')) {
        clearCameraView();
    }
}

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

function adjustZoom(delta) {
    if (!pdfDoc) return;
    
    scale += delta;
    if (scale < 0.5) scale = 0.5;
    if (scale > 5) scale = 5;
    
    renderPage(pageNum);
}

function handleDoubleClickZoom(e) {
    if (!pdfDoc) return;
    
    if (e.target.classList.contains('camera-hotspot') || 
        e.target.parentElement?.classList.contains('camera-hotspot')) {
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const container = document.getElementById('pdf-container');
    
    const clickX = e.clientX - rect.left + container.scrollLeft;
    const clickY = e.clientY - rect.top + container.scrollTop;
    
    const zoomAreaSize = 100;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const targetSize = Math.min(containerWidth, containerHeight) * 0.8;
    const zoomFactor = targetSize / zoomAreaSize;
    
    const newScale = scale * zoomFactor;
    scale = Math.max(0.5, Math.min(5, newScale));
    
    renderPageAndCenter(clickX, clickY);
}

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
                addCameraHotspots();
                
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

function resetZoom() {
    if (!pdfDoc) return;
    
    if (hotspotsVisible) {
        hotspotsVisible = false;
        document.getElementById('toggle-hotspots').textContent = 'Show CAM Links';
    }
    
    clearCameraView();
    
    pdfDoc.getPage(pageNum).then(function(page) {
        const viewport = page.getViewport({ scale: 1 });
        const container = document.getElementById('pdf-container');
        
        const pdfWidth = viewport.width;
        const pdfHeight = viewport.height;
        
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        const scaleX = (containerWidth * 0.95) / pdfWidth;
        const scaleY = (containerHeight * 0.95) / pdfHeight;
        
        scale = Math.min(scaleX, scaleY);
        
        renderPage(pageNum);
        
        setTimeout(() => {
            const newWidth = pdfWidth * scale;
            const newHeight = pdfHeight * scale;
            container.scrollLeft = Math.max(0, (newWidth - containerWidth) / 2);
            container.scrollTop = Math.max(0, (newHeight - containerHeight) / 2);
        }, 100);
    });
}

function handleFloorSelection(e) {
    const index = e.target.value;
    if (index === '') {
        clearPdfContainer();
        clearCameraView();
        document.getElementById('floor-comments-btn').disabled = true;
        document.getElementById('floor-comment-count').textContent = '0';
        return;
    }
    
    currentFloorPlan = floorPlansConfig[index];
    loadPdf(currentFloorPlan.pdfFile);
    clearCameraView();
    
    document.getElementById('floor-comments-btn').disabled = false;
    updateFloorCommentsCount();
    
    if (commentsPanelOpen) {
        closeCommentsPanel();
    }
}

function loadPdf(url) {
    const loadingTask = pdfjsLib.getDocument(url);
    
    loadingTask.promise.then(function(pdf) {
        pdfDoc = pdf;
        resetZoom();
    }).catch(function(error) {
        console.error('Error loading PDF:', error);
        alert('Error loading PDF: ' + error.message + '\n\nMake sure the PDF file exists at: ' + url);
    });
}

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
                addCameraHotspots();
            }
        });
    });
}

function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

function clearPdfContainer() {
    const container = document.getElementById('pdf-container');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const existingHotspots = container.querySelectorAll('.camera-hotspot');
    existingHotspots.forEach(hotspot => hotspot.remove());
    
    currentFloorPlan = null;
    pdfDoc = null;
    currentActiveHotspot = null;
    currentCamera = null;
}

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
    currentCamera = null;
}

function loadCameraView(camera, hotspotElement) {
    const container = document.getElementById('camera-view-container');
    
    if (currentActiveHotspot) {
        currentActiveHotspot.classList.remove('active');
    }
    
    hotspotElement.classList.add('active');
    currentActiveHotspot = hotspotElement;
    currentCamera = camera;
    
    container.innerHTML = `<iframe id="camera-view-frame" src="${camera.viewFile}"></iframe>`;
    
    const iframe = document.getElementById('camera-view-frame');
    
    iframe.onload = function() {
        setTimeout(() => {
            iframe.contentWindow.postMessage({
                type: 'cameraInfo',
                cameraId: camera.id,
                floorId: currentFloorPlan ? currentFloorPlan.name : ''
            }, '*');
            
            // Check if we should auto-open comments panel
            if (shouldOpenCommentsAfterLoad) {
                shouldOpenCommentsAfterLoad = false; // Only do this once
                openFOVComments();
            }
        }, 100);
    };
    
    iframe.onerror = function() {
        container.innerHTML = `
            <div class="placeholder">
                <div class="placeholder-icon">⚠️</div>
                <h3>Error Loading Camera View</h3>
                <p>Could not load: ${camera.viewFile}</p>
            </div>
        `;
    };
}

function addCameraHotspots() {
    if (!currentFloorPlan) return;
    
    const container = document.getElementById('pdf-container');
    
    const existingHotspots = container.querySelectorAll('.camera-hotspot');
    existingHotspots.forEach(hotspot => hotspot.remove());
    
    currentFloorPlan.cameras.forEach(camera => {
        const hotspot = document.createElement('div');
        hotspot.className = 'camera-hotspot';
        
        if (!hotspotsVisible) {
            hotspot.classList.add('hidden');
        }
        
        let fovLabel = "V1";
        if (camera.id.includes('FOV')) {
            const fovMatch = camera.id.match(/FOV(\d+)/);
            if (fovMatch) {
                fovLabel = `V${fovMatch[1]}`;
            }
        }
        
        hotspot.textContent = fovLabel;
        
        const left = (camera.position.x / 100) * canvas.width;
        const top = (camera.position.y / 100) * canvas.height;
        
        hotspot.style.left = left + 'px';
        hotspot.style.top = top + 'px';
        
        hotspot.title = camera.id + ' - Click to view';
        
        hotspot.addEventListener('click', (e) => {
            e.stopPropagation();
            loadCameraView(camera, hotspot);
        });
        
        container.appendChild(hotspot);
    });
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
