import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import https from 'https';
import fs from 'fs';
import { SettingsManager } from './settingsManager';

export class WebServer {
  private app: express.Application;
  private port: number;
  private settingsManager: SettingsManager;
  private botInstance: any;
  private botStatus: {
    isRunning: boolean;
    collections: string[];
    floors: any;
    lastEvents: any[];
  };

  constructor(settingsManager: SettingsManager, port: number = 3000) {
    this.app = express();
    this.port = port;
    this.settingsManager = settingsManager;
    this.botStatus = {
      isRunning: false,
      collections: [],
      floors: {},
      lastEvents: []
    };

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  private setupRoutes(): void {
    // Serve dashboard
    this.app.get('/', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // Get current settings
    this.app.get('/api/settings', (req: Request, res: Response) => {
      res.json(this.settingsManager.getSettings());
    });

    // Update settings
    this.app.post('/api/settings', (req: Request, res: Response) => {
      try {
        this.settingsManager.saveSettings(req.body);
        res.json({ success: true, message: 'Settings saved successfully' });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to save settings' });
      }
    });

    // Get bot status
    this.app.get('/api/status', (req: Request, res: Response) => {
      res.json(this.botStatus);
    });

    // Get floor prices
    this.app.get('/api/floors', (req: Request, res: Response) => {
      res.json(this.botStatus.floors);
    });

    // Get recent events
    this.app.get('/api/events', (req: Request, res: Response) => {
      res.json(this.botStatus.lastEvents.slice(-50)); // Last 50 events
    });

    // Start listening
    this.app.post('/api/start', (req: Request, res: Response) => {
      if (this.botInstance) {
        this.botInstance.startListening();
        res.json({ success: true, message: 'Bot started listening' });
      } else {
        res.status(500).json({ success: false, message: 'Bot instance not available' });
      }
    });

    // Stop listening
    this.app.post('/api/stop', (req: Request, res: Response) => {
      if (this.botInstance) {
        this.botInstance.stopListening();
        res.json({ success: true, message: 'Bot stopped listening' });
      } else {
        res.status(500).json({ success: false, message: 'Bot instance not available' });
      }
    });

    // Test Telegram notification
    this.app.post('/api/test-telegram', async (req: Request, res: Response) => {
      const { botToken, chatId } = req.body;
      try {
        const https = await import('https');
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const data = JSON.stringify({
          chat_id: chatId,
          text: '✅ Test notification from OpenSea Floor Monitor!'
        });

        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        };

        const req2 = https.request(options, (res2) => {
          let responseData = '';
          res2.on('data', (chunk) => (responseData += chunk));
          res2.on('end', () => {
            if (res2.statusCode === 200) {
              res.json({ success: true, message: 'Test message sent!' });
            } else {
              res.status(400).json({ success: false, message: 'Failed to send test message' });
            }
          });
        });

        req2.on('error', (error) => {
          res.status(500).json({ success: false, message: error.message });
        });

        req2.write(data);
        req2.end();
      } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
      }
    });
  }

  setBotInstance(bot: any): void {
    this.botInstance = bot;
  }

  updateBotStatus(status: Partial<typeof this.botStatus>): void {
    this.botStatus = { ...this.botStatus, ...status };
  }

  addEvent(event: any): void {
    this.botStatus.lastEvents.push({
      ...event,
      timestamp: Date.now()
    });
    // Keep only last 100 events
    if (this.botStatus.lastEvents.length > 100) {
      this.botStatus.lastEvents.shift();
    }
  }

  start(): void {
    // Check if SSL certificates exist
    const certPath = path.join(process.cwd(), 'localhost+2.pem');
    const keyPath = path.join(process.cwd(), 'localhost+2-key.pem');

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      // Start HTTPS server
      const httpsOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      };

      https.createServer(httpsOptions, this.app).listen(this.port, () => {
        console.log(`\n🔒 Web Dashboard (HTTPS): https://localhost:${this.port}`);
      });
    } else {
      // Fallback to HTTP
      this.app.listen(this.port, () => {
        console.log(`\n🌐 Web Dashboard (HTTP): http://localhost:${this.port}`);
        console.log(`💡 Tip: Run 'mkcert localhost' to enable HTTPS`);
      });
    }
  }
}
