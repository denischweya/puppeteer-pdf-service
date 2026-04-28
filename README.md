# Puppeteer PDF Microservice

A high-fidelity PDF generation microservice using Puppeteer and Chromium. Optimized for pixel-perfect PDF output that matches browser rendering.

## Features

- Generate PDFs from HTML content or URLs
- High-fidelity rendering with SwiftShader GPU support
- Proper handling of CSS effects (clip-path, gradients, shadows)
- Docker support for easy deployment
- Auto-recovery on browser crashes

## Prerequisites

### Docker (Recommended)
- Docker and Docker Compose installed

### Local Development
- Node.js 20+
- npm

## Quick Start

### Docker (Recommended)

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd puppeteer
   ```

2. **Start the service:**
   ```bash
   docker-compose up -d puppeteer
   ```

3. **Verify it's running:**
   ```bash
   curl http://localhost:3000/health
   ```
   Should return: `{"status":"ok","browser":true}`

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Verify it's running:**
   ```bash
   curl http://localhost:3000/health
   ```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/pdf/url` | POST | Generate PDF from URL |
| `/pdf/html` | POST | Generate PDF from HTML content |

## Usage Examples

### Generate PDF from HTML

```bash
curl -X POST http://localhost:3000/pdf/html \
  -H "Content-Type: application/json" \
  -d '{"html":"<h1>Hello World</h1>"}' \
  --output output.pdf
```

### Generate PDF from URL

```bash
curl -X POST http://localhost:3000/pdf/url \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' \
  --output output.pdf
```

### High-Fidelity PDF (Recommended)

For pixel-perfect PDF output that matches browser rendering:

```bash
curl -X POST http://localhost:3000/pdf/html \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html>...</html>",
    "options": {
      "preferCSSPageSize": true,
      "printBackground": true,
      "margin": {"top": 0, "right": 0, "bottom": 0, "left": 0}
    }
  }' \
  --output output.pdf
```

### PDF Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | string | - | Page width (e.g., "8.5in") |
| `height` | string | - | Page height (e.g., "11in") |
| `format` | string | "Letter" | Paper format (Letter, A4, etc.) |
| `landscape` | boolean | false | Landscape orientation |
| `preferCSSPageSize` | boolean | true | Honor `@page` CSS rules |
| `printBackground` | boolean | true | Print background graphics |
| `scale` | number | 1 | Scale of the webpage rendering |
| `margin` | object | {0,0,0,0} | Page margins |
| `viewportWidth` | number | 816 | Viewport width in pixels |
| `viewportHeight` | number | 1056 | Viewport height in pixels |
| `deviceScaleFactor` | number | 2 | Device scale for crisp rendering |
| `waitUntil` | string | "load" | Wait condition (load, domcontentloaded, networkidle0) |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |

### Browser Options

The service is configured with optimized Chromium flags for high-fidelity rendering:

- **SwiftShader GPU**: Software-based GPU rendering for consistent CSS effects
- **sRGB color profile**: Consistent colors across environments
- **Disabled font subpixel positioning**: Consistent font rendering

### Resource Limits (Docker)

The Docker Compose configuration limits memory to 2GB. Adjust in `docker-compose.yml` if needed.

## Troubleshooting

### Port already in use

```bash
lsof -ti:3000 | xargs kill -9
npm start
```

### Browser crashes

The service auto-recovers from browser crashes. Check logs for errors:

```bash
docker-compose logs puppeteer
```

## License

MIT

