const express = require('express');
const cors    = require('cors');
const https   = require('https');
const app     = express();

app.use(cors());
app.use(express.json());

const SCANNER_SECRET = process.env.SCANNER_SECRET;
const PANEL_SECRET   = process.env.PANEL_SECRET;

// ─── Stockage en mémoire ───
const detections = [];
const MAX_STORE  = 500;

// ══════════════════════════════════════════
// POST /api/ingest  — Scanner privé
// ══════════════════════════════════════════
app.post('/api/ingest', (req, res) => {
    const { secret, detections: incoming } = req.body;

    if (!secret || secret !== SCANNER_SECRET)
        return res.status(403).json({ error: 'Unauthorized' });

    if (!Array.isArray(incoming) || incoming.length === 0)
        return res.status(400).json({ error: 'No detections' });

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

    if (detections.length > MAX_STORE)
        detections.splice(0, detections.length - MAX_STORE);

    console.log(`[INGEST] +${incoming.length} | Total: ${detections.length}`);
    return res.json({ ok: true });
});

// ══════════════════════════════════════════
// GET /api/panel?key=XXX&secret=YYY
// ══════════════════════════════════════════
app.get('/api/panel', (req, res) => {
    const key    = req.query.key;
    const secret = req.query.secret;

    if (!key)
        return res.status(400).json({ valid: false, error: 'No key provided' });

    if (!secret || secret !== PANEL_SECRET) {
        console.log(`[PANEL] Secret invalide`);
        return res.status(403).json({ valid: false, error: 'Invalid secret' });
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

    console.log(`[PANEL] Accepté — ${sorted.length} detections envoyées`);
    return res.json({ valid: true, detections: sorted });
});

// ══════════════════════════════════════════
// Démarrage
// ══════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[ZYRA SERVER] Running on port ${PORT}`);
    console.log(`[ZYRA SERVER] SCANNER_SECRET = ${SCANNER_SECRET ? '✅ SET' : '⚠️  NOT SET'}`);
    console.log(`[ZYRA SERVER] PANEL_SECRET   = ${PANEL_SECRET   ? '✅ SET' : '⚠️  NOT SET'}`);
});
