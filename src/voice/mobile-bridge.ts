// @ts-nocheck
/**
 * voice/mobile-bridge.ts — Mobile phone voice bridge for CLI
 * 
 * 1. CLI generates QR code with session URL
 * 2. User scans with phone
 * 3. Phone opens web app with STT (Web Speech API)
 * 4. Transcribed text sent via WebSocket to CLI
 * 5. CLI types text as if from keyboard
 */
import { randomBytes } from 'crypto';
import qrcode from 'qrcode-terminal';
import type { MobileBridgeSession } from './types.js';

export class MobileVoiceBridge {
  private sessions: Map<string, MobileBridgeSession> = new Map();
  private webSocketServer: any = null;
  private onTranscript: ((text: string) => void) | null = null;

  async startBridge(port: number = 3777): Promise<MobileBridgeSession> {
    const sessionId = randomBytes(16).toString('hex');
    const url = `https://voice.dirgha.ai/mobile?session=${sessionId}`;
    
    const session: MobileBridgeSession = {
      sessionId,
      qrCode: '',
      url,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min expiry
      paired: false
    };

    this.sessions.set(sessionId, session);

    // Generate QR code
    await new Promise<void>((resolve) => {
      qrcode.generate(url, { small: true }, (qr) => {
        session.qrCode = qr;
        resolve();
      });
    });

    // Start WebSocket server (simplified - real impl would use ws library)
    await this.startWebSocket(port, sessionId);

    return session;
  }

  private async startWebSocket(port: number, sessionId: string): Promise<void> {
    // In real implementation, use the 'ws' library
    // This is a placeholder showing the protocol
    console.log(`[Voice Bridge] WebSocket server on port ${port}`);
    console.log(`[Voice Bridge] Waiting for mobile connection...`);
    
    // Protocol:
    // Mobile -> Server: { type: 'connect', sessionId }
    // Server -> Mobile: { type: 'ready' }
    // Mobile -> Server: { type: 'transcript', text, confidence }
    // Server -> CLI: execute onTranscript(text)
  }

  onTranscriptReceived(callback: (text: string) => void): void {
    this.onTranscript = callback;
  }

  displayQR(session: MobileBridgeSession): void {
    console.log('\n📱 Scan with your phone to use voice typing:\n');
    console.log(session.qrCode);
    console.log(`\nOr open: ${session.url}`);
    console.log('Session expires in 10 minutes\n');
  }

  stopBridge(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

// Web app HTML for mobile (would be hosted at voice.dirgha.ai/mobile)
export const MOBILE_VOICE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dirgha Voice Typing</title>
  <style>
    body { font-family: system-ui; text-align: center; padding: 20px; }
    button { padding: 20px 40px; font-size: 18px; border-radius: 30px; border: none; background: #3b82f6; color: white; }
    button.recording { background: #ef4444; animation: pulse 1s infinite; }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    #status { margin: 20px 0; font-size: 14px; color: #666; }
    #transcript { margin: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px; min-height: 50px; }
  </style>
</head>
<body>
  <h1>🎤 Dirgha Voice</h1>
  <button id="mic">Hold to Speak</button>
  <div id="status">Tap and hold the button, then speak</div>
  <div id="transcript"></div>

  <script>
    // Web Speech API for STT
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    const mic = document.getElementById('mic');
    const status = document.getElementById('status');
    const transcript = document.getElementById('transcript');
    
    let isRecording = false;
    let finalTranscript = '';
    
    // WebSocket connection to CLI
    const ws = new WebSocket('wss://voice.dirgha.ai/ws');
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'connect', sessionId: new URLSearchParams(location.search).get('session') }));
      status.textContent = 'Connected to CLI. Hold button to speak.';
    };
    
    mic.addEventListener('mousedown', () => {
      isRecording = true;
      mic.classList.add('recording');
      mic.textContent = 'Recording...';
      recognition.start();
    });
    
    mic.addEventListener('mouseup', () => {
      isRecording = false;
      mic.classList.remove('recording');
      mic.textContent = 'Hold to Speak';
      recognition.stop();
      
      // Send final transcript
      if (finalTranscript) {
        ws.send(JSON.stringify({ type: 'transcript', text: finalTranscript }));
        finalTranscript = '';
      }
    });
    
    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += text;
        else interim += text;
      }
      transcript.textContent = finalTranscript + interim;
    };
  </script>
</body>
</html>
`;
