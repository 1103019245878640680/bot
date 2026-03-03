const express = require('express');
const cors    = require('cors');
const https   = require('https');
const app     = express();

app.use(cors());
app.use(express.json());

// Variables d'environnement Railway directement
const SCANNER_SECRET    = process.env.SCANNER_SECRET;
const JUNKIE_IDENTIFIER = process.env.JUNKIE_IDENTIFIER;

// ─── Stockage en mémoire ───
const detections = [];
const MAX_STORE  = 500;

// ══════════════════════════════════════════
// POST /api/ingest  — Scanner privé
// ══════════════════════════════════════════
app.post('/api/ingest', (req, res) => {
    const { secret, detections: incoming } = req.body;

    if (!secret || secret !== SCANNER_SECRET) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!Array.isArray(incoming) || incoming.length === 0) {
        return res.status(400).json({ error: 'No detections' });
    }

    for (const d of incoming) {
        const exists = detections.find(
            x => x.jobId === d.jobId && x.animalName === d.animalName
        );
        if (!exists) {
            detections.push({
                name:         d.name         || '?',
                animalName:   d.animalName   || '?',
                mutation:     d.mutation     || 'None',
                trait:        d.trait        || 'None',
                rarity:       d.rarity       || 'Common',
                pps:          d.pps          || 0,
                ppsFormatted: d.ppsFormatted || '$0',
                gameId:       d.gameId       || 0,
                jobId:        d.jobId        || '',
                scannerName:  d.scannerName  || '?',
                timestamp:    d.timestamp    || Math.floor(Date.now() / 1000),
            });
        }
    }

    if (detections.length > MAX_STORE) {
        detections.splice(0, detections.length - MAX_STORE);
    }

    console.log(`[INGEST] +${incoming.length} | Total: ${detections.length}`);
    return res.json({ ok: true });
});

// ══════════════════════════════════════════
// GET /api/panel?key=XXX  — Script panel user
// ══════════════════════════════════════════
app.get('/api/panel', (req, res) => {
    const key = req.query.key;

    if (!key) {
        return res.status(400).json({ valid: false, error: 'No key provided' });
    }

    verifyJunkieKey(key, (valid, error) => {
        if (!valid) {
            return res.status(403).json({ valid: false, error: error || 'Invalid key' });
        }

        const sorted = [...detections]
            .sort((a, b) => b.pps - a.pps)
            .slice(0, 100)
            .map(d => ({
                name:         d.name,
                animalName:   d.animalName,
                mutation:     d.mutation,
                trait:        d.trait,
                rarity:       d.rarity,
                ppsFormatted: d.ppsFormatted,
                gameId:       d.gameId,
                jobId:        d.jobId,
                scannerName:  d.scannerName,
                timestamp:    d.timestamp,
            }));

        return res.json({ valid: true, detections: sorted });
    });
});

// ══════════════════════════════════════════
// Vérification Key Junkie
// ══════════════════════════════════════════
function verifyJunkieKey(key, callback) {
    const url = `https://jnkie.com/api/check?key=${encodeURIComponent(key)}&identifier=${JUNKIE_IDENTIFIER}`;

    https.get(url, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
            try {
                const json = JSON.parse(data);
                callback(json.valid === true, json.error || null);
            } catch {
                callback(false, 'Junkie parse error');
            }
        });
    }).on('error', () => {
        callback(false, 'Junkie unreachable');
    });
}

// ══════════════════════════════════════════
// Démarrage
// ══════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[ZYRA SERVER] Running on port ${PORT}`);
});
