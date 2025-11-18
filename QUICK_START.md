# Quick Start Guide

## Getting Your Camera Floor Plan Website Running in 5 Minutes

### Step 1: Create the Folder Structure

Create a new folder for your website with these subfolders:

```
my-camera-site/
├── floor-plans/
└── camera-views/
```

### Step 2: Copy the Core Files

Place these files in the root of `my-camera-site/`:
- `index.html`
- `app.js`
- `floor-plans-config.js`

### Step 3: Add Your Files

1. Copy all your **PDF floor plans** into the `floor-plans/` folder
2. Copy all your **3D camera view HTML files** into the `camera-views/` folder

### Step 4: Edit the Configuration

Open `floor-plans-config.js` and update it with your information:

```javascript
const floorPlansConfig = [
    {
        name: "Your Floor Name",                    // What appears in dropdown
        pdfFile: "floor-plans/your-file.pdf",       // Your PDF filename
        cameras: [
            {
                id: "YOUR-CAM-ID",                  // Your camera ID
                position: { x: 20, y: 30, width: 5, height: 5 },  // Adjust these
                viewFile: "camera-views/your-view.html"  // Your HTML filename
            }
        ]
    }
];
```

### Step 5: Start a Local Server

**Easiest Method - Python (if installed):**

Open terminal/command prompt in your `my-camera-site/` folder and run:

```bash
python -m http.server 8000
```

Then open your browser to: `http://localhost:8000`

**Alternative - VS Code:**

1. Install the "Live Server" extension
2. Right-click `index.html`
3. Select "Open with Live Server"

### Step 6: Find Camera Positions

The position values are percentages of the PDF dimensions:

**Quick Method:**
1. Open your PDF
2. Estimate where each camera is located:
   - Left side = x around 10-30
   - Center = x around 40-60
   - Right side = x around 70-90
   - Top = y around 10-30
   - Middle = y around 40-60
   - Bottom = y around 70-90
3. Use width and height of 4-6 for most cameras
4. Adjust by trial and error until they line up

**Example Positions:**

```
Top-left corner:     x: 10,  y: 10
Top-right corner:    x: 85,  y: 10
Center:              x: 48,  y: 50
Bottom-left:         x: 10,  y: 85
Bottom-right:        x: 85,  y: 85
```

### Step 7: Test It

1. Open the website in your browser
2. Select a floor plan from the dropdown
3. Check if the red camera hotspots appear in the right places
4. Click a hotspot to test if it opens the correct camera view
5. Adjust positions in `floor-plans-config.js` as needed

## Common Issues and Fixes

**PDF doesn't load:**
- Make sure you're using a web server (not just opening the HTML file)
- Check the PDF filename matches exactly in the config file

**Hotspots in wrong place:**
- Adjust the x and y values in `floor-plans-config.js`
- Remember: x=0 is left edge, x=100 is right edge
- y=0 is top edge, y=100 is bottom edge

**Camera view doesn't open:**
- Check the HTML filename matches exactly in the config file
- Make sure the file is in the `camera-views/` folder

## You're Done! 🎉

Your website is now ready to use. Share it by uploading to any web hosting service, or keep it running locally for your team.
