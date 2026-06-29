import express from "express";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp as initializeFirebaseApp } from "firebase/app";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    updateDoc, 
    limit, 
    orderBy 
} from "firebase/firestore";

// Load environment variables if .env file exists (Node 20.12+)
try {
    process.loadEnvFile();
} catch (e) {
    // In production or host environments, variables are loaded from the system environment.
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Config from services/firebase.ts
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase Client SDK (Works with API Key, doesn't need ADC)
const fbApp = initializeFirebaseApp(firebaseConfig);
const db = getFirestore(fbApp);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(compression());
  app.use(express.json());

  // API Authentication Middleware
  const apiKeyMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
          const key = req.header('X-API-KEY') || req.query.apiKey as string;
          if (!key) return res.status(401).json({ error: 'Falta X-API-KEY header o apiKey query param' });

          const keysCol = collection(db, 'api_keys');
          const q = query(keysCol, where('key', '==', key), where('active', '==', true), limit(1));
          const keySnap = await getDocs(q);

          if (keySnap.empty) return res.status(403).json({ error: 'API KEY inválida o inactiva' });

          const keyDoc = keySnap.docs[0];
          const keyData = keyDoc.data();
          (req as any).apiKey = { id: keyDoc.id, ...keyData };

          // Update last used (non-blocking)
          updateDoc(doc(db, 'api_keys', keyDoc.id), { lastUsedAt: Date.now() }).catch(e => console.error("Error updating lastUsedAt:", e));
          
          next();
      } catch (error) {
          console.error("API Auth Error:", error);
          res.status(500).json({ error: 'Internal Server Error during auth', message: error instanceof Error ? error.message : String(error) });
      }
  };

  // API Routes
  app.get("/api/v1/clients", apiKeyMiddleware, async (req, res) => {
      try {
          const keyData = (req as any).apiKey;
          const weekId = req.query.weekId as string;

          if (!keyData.permissions.includes('read:clients')) {
              return res.status(403).json({ error: 'Permisos insuficientes: read:clients requerido' });
          }

          if (!keyData.assignedFinancieraIds || keyData.assignedFinancieraIds.length === 0) {
              return res.json([]);
          }

          // Firestore 'in' limitation: max 30 items
          const chunks = [];
          const ids = keyData.assignedFinancieraIds;
          for (let i = 0; i < ids.length; i += 30) {
              chunks.push(ids.slice(i, i + 30));
          }

          let allClients: any[] = [];
          const clientsCol = collection(db, 'clients');

          for (const chunk of chunks) {
              let q;
              if (weekId) {
                  if (weekId.startsWith('W-')) {
                      const parts = weekId.split('-');
                      if (parts.length >= 3) {
                          const start = parseInt(parts[1]);
                          const end = parseInt(parts[2]);
                          // Range filter by registration time
                          q = query(clientsCol, 
                              where('financieraId', 'in', chunk), 
                              where('registeredAt', '>=', start), 
                              where('registeredAt', '<=', end)
                          );
                      } else {
                          q = query(clientsCol, where('financieraId', 'in', chunk), where('weekId', '==', weekId));
                      }
                  } else {
                      q = query(clientsCol, where('financieraId', 'in', chunk), where('weekId', '==', weekId));
                  }
              } else {
                  q = query(clientsCol, where('financieraId', 'in', chunk), orderBy('registeredAt', 'desc'), limit(200));
              }

              const snap = await getDocs(q);
              const clients = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
              allClients = [...allClients, ...clients];
          }

          // Sort if we combined multiple chunks
          if (chunks.length > 1 && !weekId) {
              allClients.sort((a, b: any) => (b.registeredAt || 0) - (a.registeredAt || 0));
              allClients = allClients.slice(0, 200);
          }

          res.json(allClients);
      } catch (error) {
          console.error("API Clients Error:", error);
          res.status(500).json({ 
              error: 'Internal Server Error fetching clients', 
              message: error instanceof Error ? error.message : String(error) 
          });
      }
  });

  app.get("/api/v1/weeks", apiKeyMiddleware, async (req, res) => {
      try {
          const keyData = (req as any).apiKey;
          if (!keyData.permissions.includes('read:weeks')) {
              return res.status(403).json({ error: 'Permisos insuficientes: read:weeks requerido' });
          }

          if (!keyData.assignedFinancieraIds || keyData.assignedFinancieraIds.length === 0) {
              return res.json([]);
          }

          const chunks = [];
          const ids = keyData.assignedFinancieraIds;
          for (let i = 0; i < ids.length; i += 30) {
              chunks.push(ids.slice(i, i + 30));
          }

          let allWeeks: any[] = [];
          const weeksCol = collection(db, 'weeks');

          for (const chunk of chunks) {
              const q = query(weeksCol, where('financieraId', 'in', chunk), orderBy('startDate', 'desc'), limit(100));
              const snap = await getDocs(q);
              const weeks = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
              allWeeks = [...allWeeks, ...weeks];
          }

          if (chunks.length > 1) {
              allWeeks.sort((a, b: any) => (b.startDate || 0) - (a.startDate || 0));
              allWeeks = allWeeks.slice(0, 100);
          }

          res.json(allWeeks);
      } catch (error) {
          console.error("API Weeks Error:", error);
          res.status(500).json({ error: 'Internal Server Error fetching weeks', message: error instanceof Error ? error.message : String(error) });
      }
  });

  app.get("/api/v1/visits", apiKeyMiddleware, async (req, res) => {
      try {
          const keyData = (req as any).apiKey;
          if (!keyData.permissions.includes('read:visits')) {
              return res.status(403).json({ error: 'Permisos insuficientes: read:visits requerido' });
          }

          const weekId = req.query.weekId as string;

          if (!keyData.assignedFinancieraIds || keyData.assignedFinancieraIds.length === 0) {
              return res.json([]);
          }

          const chunks = [];
          const ids = keyData.assignedFinancieraIds;
          for (let i = 0; i < ids.length; i += 30) {
              chunks.push(ids.slice(i, i + 30));
          }

          let allVisits: any[] = [];
          const visitsCol = collection(db, 'visits');

          for (const chunk of chunks) {
              let q;
              if (weekId) {
                  if (weekId.startsWith('W-')) {
                      const parts = weekId.split('-');
                      if (parts.length >= 3) {
                          const start = parseInt(parts[1]);
                          const end = parseInt(parts[2]);
                          q = query(visitsCol, 
                              where('financieraId', 'in', chunk), 
                              where('timestamp', '>=', start), 
                              where('timestamp', '<=', end)
                          );
                      } else {
                          q = query(visitsCol, where('financieraId', 'in', chunk), where('weekId', '==', weekId));
                      }
                  } else {
                      q = query(visitsCol, where('financieraId', 'in', chunk), where('weekId', '==', weekId));
                  }
              } else {
                  q = query(visitsCol, where('financieraId', 'in', chunk), orderBy('timestamp', 'desc'), limit(200));
              }
              
              const snap = await getDocs(q);
              const visits = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
              allVisits = [...allVisits, ...visits];
          }

          if (chunks.length > 1) {
              allVisits.sort((a, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
              allVisits = allVisits.slice(0, 200);
          }

          res.json(allVisits);
      } catch (error) {
          console.error("API Visits Error:", error);
          res.status(500).json({ error: 'Internal Server Error fetching visits', message: error instanceof Error ? error.message : String(error) });
      }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    
    // Serve static assets with long-term caching to reduce Cloud Run egress
    app.use("/assets", express.static(path.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true,
    }));

    // Serve other static files with shorter caching
    app.use(express.static(distPath, {
      maxAge: "1h",
    }));

    // SPA fallback - Express 5 uses *all
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Optimizations enabled: Gzip compression, Static asset caching.");
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
